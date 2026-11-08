import crypto from "crypto";
import Razorpay from "razorpay";
import { getAuth } from "@clerk/express";
import Invoice from "../models/invoiceModel.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const round2 = (n) => Number(Number(n).toFixed(2));

// If the route is behind Clerk auth, only the invoice owner may pay / update it.
function canAccess(req, invoice) {
  const { userId } = getAuth(req);
  return Boolean(userId) && invoice.owner === userId;
}

/**
 * Idempotent: called by BOTH the browser (update-payment) and the webhook.
 * The $ne filter makes the push atomic, so only one caller can record a
 * given payment id. Razorpay amounts are paise; paidAmount is rupees.
 */
export async function recordPayment(invoiceId, payment) {
  const amount = round2(Number(payment.amount) / 100);

  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, "payments.paymentId": { $ne: payment.id } },
    {
      $push: {
        payments: {
          paymentId: payment.id,
          orderId: payment.order_id,
          amount,
          method: payment.method,
          at: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updated) return { recorded: false }; // already recorded, or invoice missing

  // pre("save") hook recalculates remainingAmount and status
  updated.paidAmount = round2((Number(updated.paidAmount) || 0) + amount);
  updated.razorpayPaymentId = payment.id;
  await updated.save();
  return { recorded: true, invoice: updated };
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

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      receipt: `invoice_${invoice._id}`,
      notes: { invoiceId: String(invoice._id) }, // lets the webhook find the invoice
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

    /* -------- VERIFY RAZORPAY SIGNATURE -------- */

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(String(razorpay_signature));

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.error(
        "Signature mismatch: check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are the same mode (test vs live)"
      );
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    /* -------- FETCH THE PAYMENT FROM RAZORPAY (never trust the browser) -------- */

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (
      payment.order_id !== razorpay_order_id ||
      payment.notes?.invoiceId !== String(invoice._id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment does not match this invoice",
      });
    }

    if (payment.status !== "captured") {
      return res.status(409).json({
        success: false,
        message: `Payment is ${payment.status}, not captured yet`,
      });
    }

    /* -------- RECORD (idempotent, safe if the webhook already did it) -------- */

    const result = await recordPayment(invoice._id, payment);
    const fresh = result.invoice || (await Invoice.findById(invoice._id));

    return res.json({
      success: true,
      alreadyProcessed: !result.recorded,
      invoice: fresh,
    });
  } catch (error) {
    console.error("Payment Update Error:", error);

    res.status(500).json({
      success: false,
      message: "Payment update failed",
    });
  }
};