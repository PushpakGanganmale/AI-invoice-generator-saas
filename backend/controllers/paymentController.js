import crypto from "crypto";
import Razorpay from "razorpay";
import { getAuth } from "@clerk/express";
import Invoice from "../models/invoiceModel.js";

// Created on first use, so a missing key can't crash the whole server at startup.
let razorpayClient = null;
const getRazorpay = () => {
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayClient;
};

const round2 = (n) => Number(Number(n).toFixed(2));

// If the route is behind Clerk auth, only the invoice owner may pay / update it.
function canAccess(req, invoice) {
  const { userId } = getAuth(req);
  return Boolean(userId) && invoice.owner === userId;
}

// Records a captured payment exactly once, even if update-payment and sync
// run at the same time (the razorpayPaymentId filter makes the claim atomic).
async function recordPayment(invoiceId, payment) {
  const claimed = await Invoice.findOneAndUpdate(
    { _id: invoiceId, razorpayPaymentId: { $ne: payment.id } },
    { $set: { razorpayPaymentId: payment.id } },
    { new: true }
  );

  if (!claimed) {
    return { recorded: false, invoice: await Invoice.findById(invoiceId) };
  }

  try {
    // pre("save") hook auto-calculates remainingAmount and status
    claimed.paidAmount = round2(
      (Number(claimed.paidAmount) || 0) + Number(payment.amount) / 100
    );
    await claimed.save();
  } catch (err) {
    await Invoice.updateOne({ _id: invoiceId }, { $set: { razorpayPaymentId: null } });
    throw err;
  }

  return { recorded: true, invoice: claimed };
}

/* ---------------- CREATE ORDER ---------------- */

export const createOrder = async (req, res) => {
  try {
    const { invoiceId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: "Invoice ID is required",
      });
    }

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    if (!canAccess(req, invoice)) {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    /* -------- BLOCK IF ALREADY FULLY PAID -------- */

    if (invoice.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice is already fully paid",
      });
    }

    /* -------- ALWAYS RECALCULATE FRESH FROM ITEMS -------- */

    const subtotal = (invoice.items || []).reduce(
      (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
      0
    );

    const tax = (subtotal * (Number(invoice.taxPercent) || 0)) / 100;
    const freshTotal = round2(subtotal + tax);

    const paidAmount = Number(invoice.paidAmount) || 0;
    const remainingAmount = round2(Math.max(freshTotal - paidAmount, 0));

    const amount = remainingAmount > 0 ? remainingAmount : freshTotal;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    /* -------- CREATE RAZORPAY ORDER -------- */

    const order = await getRazorpay().orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      receipt: `invoice_${invoice._id}`,
    });

    /* -------- SYNC INVOICE + REMEMBER THE ORDER -------- */

    invoice.subtotal = round2(subtotal);
    invoice.tax = round2(tax);
    invoice.total = freshTotal;
    invoice.remainingAmount = remainingAmount;
    invoice.razorpayOrderId = order.id; // used to verify the payment later
    await invoice.save();

    res.json({
      success: true,
      order,
      remainingAmount: amount,
    });
  } catch (error) {
    console.error("Create Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Payment initialization failed",
    });
  }
};

/* ---------------- UPDATE PAYMENT (VERIFIED) ---------------- */

export const updatePayment = async (req, res) => {
  try {
    const {
      invoiceId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!invoiceId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invoice ID and Razorpay payment details are required",
      });
    }

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    if (!canAccess(req, invoice)) {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    /* -------- ALREADY RECORDED (e.g. the request was sent twice) -------- */

    if (invoice.razorpayPaymentId === razorpay_payment_id) {
      return res.json({ success: true, invoice });
    }

    if (invoice.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice is already fully paid",
      });
    }

    /* -------- THE ORDER MUST BELONG TO THIS INVOICE -------- */

    if (invoice.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Order does not match this invoice",
      });
    }

    /* -------- VERIFY RAZORPAY SIGNATURE -------- */

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(String(razorpay_signature));

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    /* -------- AMOUNT COMES FROM RAZORPAY, NOT FROM THE BROWSER -------- */

    const payment = await getRazorpay().payments.fetch(razorpay_payment_id);

    if (payment.order_id !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Payment does not match this order",
      });
    }

    if (payment.status !== "captured") {
      return res.status(409).json({
        success: false,
        message: `Payment is ${payment.status}, not captured yet`,
      });
    }

    const result = await recordPayment(invoice._id, payment);

    res.json({
      success: true,
      invoice: result.invoice,
    });
  } catch (error) {
    console.error("Payment Update Error:", error);

    res.status(500).json({
      success: false,
      message: "Payment update failed",
    });
  }
};

/* ---------------- SYNC (asks Razorpay directly; safe to call repeatedly) ---------------- */

export const syncPayment = async (req, res) => {
  try {
    const { invoiceId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ success: false, message: "Invoice ID is required" });
    }

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    if (!canAccess(req, invoice)) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    let current = invoice;

    if (invoice.razorpayOrderId && invoice.status !== "paid") {
      const list = await getRazorpay().orders.fetchPayments(invoice.razorpayOrderId);
      const captured = (list?.items || []).find((p) => p.status === "captured");

      if (captured) {
        const result = await recordPayment(invoice._id, captured);
        current = result.invoice;
      }
    }

    res.json({ success: true, invoice: current });
  } catch (error) {
    console.error("Sync Payment Error:", error);
    res.status(500).json({ success: false, message: "Payment sync failed" });
  }
};