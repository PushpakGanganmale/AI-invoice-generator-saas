
import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Invoice from "../models/invoiceModel.js";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  console.error("Razorpay environment variables are missing.");
}

const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

/* ---------------- CREATE ORDER ---------------- */

export const createOrder = async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const userId = req.auth?.userId;

    if (!userId || !invoiceId) {
      return res.status(400).json({
        success: false,
        message: "Authentication and invoice ID are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID.",
      });
    }

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      owner: userId,
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    if (invoice.currency !== "INR") {
      return res.status(400).json({
        success: false,
        message: "Only INR payments are supported by this payment gateway.",
      });
    }

    if (invoice.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice is already fully paid.",
      });
    }

    // Calculate invoice total from saved invoice items.
    const subtotal = (invoice.items || []).reduce(
      (sum, item) =>
        sum +
        Number(item.qty || 0) * Number(item.unitPrice || 0),
      0
    );

    const tax =
      (subtotal * Number(invoice.taxPercent || 0)) / 100;

    const total = Number((subtotal + tax).toFixed(2));

    const paidAmount = Number(invoice.paidAmount || 0);

    const remainingAmount = Number(
      Math.max(total - paidAmount, 0).toFixed(2)
    );

    if (remainingAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "No remaining amount to pay.",
      });
    }

    // Save authoritative totals.
    invoice.subtotal = Number(subtotal.toFixed(2));
    invoice.tax = Number(tax.toFixed(2));
    invoice.total = total;
    invoice.remainingAmount = remainingAmount;

    await invoice.save();

    // Razorpay accepts amounts in paise.
    const amountInPaise = Math.round(remainingAmount * 100);

    if (amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount.",
      });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `inv_${invoice._id}`.slice(0, 40),
      notes: {
        invoiceId: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        owner: userId,
      },
    });

    invoice.razorpayOrderId = order.id;

    await invoice.save();

    return res.status(200).json({
      success: true,
      message: "Payment order created successfully.",
      order,
      remainingAmount,
    });
  } catch (error) {
    console.error("Create Order Error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment initialization failed.",
    });
  }
};

/* ---------------- VERIFY PAYMENT ---------------- */

export const updatePayment = async (req, res) => {
  try {
    const {
      invoiceId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    const userId = req.auth?.userId;

    if (
      !userId ||
      !invoiceId ||
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification details.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID.",
      });
    }

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      owner: userId,
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    // Check that this is the order created for this invoice.
    if (invoice.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid Razorpay order ID.",
      });
    }

    // Verify signature.
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(razorpay_signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Razorpay signature verification failed.",
      });
    }

    // Prevent duplicate payment recording.
    const recordedIds = invoice.razorpayPaymentIds || [];

    if (recordedIds.includes(razorpay_payment_id)) {
      return res.status(200).json({
        success: true,
        message: "Payment has already been recorded.",
        invoice,
      });
    }

    // Independently verify the payment with Razorpay.
    const payment = await razorpay.payments.fetch(
      razorpay_payment_id
    );

    if (
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.currency !== "INR"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment has not been captured successfully.",
      });
    }

    const paymentAmount = Number(payment.amount) / 100;

    const expectedAmount = Number(
      invoice.remainingAmount || 0
    );

    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0 ||
      Math.abs(paymentAmount - expectedAmount) > 0.001
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment amount does not match the invoice balance.",
      });
    }

    // Recheck duplicate IDs before saving.
    if (
      (invoice.razorpayPaymentIds || []).includes(
        razorpay_payment_id
      )
    ) {
      return res.status(200).json({
        success: true,
        message: "Payment has already been recorded.",
        invoice,
      });
    }

    // Update invoice.
    invoice.paidAmount = Number(
      (
        Number(invoice.paidAmount || 0) +
        paymentAmount
      ).toFixed(2)
    );

    invoice.razorpayPaymentIds.push(razorpay_payment_id);

    // Retain the latest payment details for reference.
    invoice.razorpayPaymentId = razorpay_payment_id;
    invoice.razorpaySignature = razorpay_signature;

    await invoice.save();

    return res.status(200).json({
      success: true,
      message: "Payment verified and invoice updated successfully.",
      invoice,
    });
  } catch (error) {
    console.error("Payment Verification Error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment verification failed.",
    });
  }
};
