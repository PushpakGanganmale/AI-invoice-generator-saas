import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import { getAuth } from "@clerk/express";
import Invoice from "../models/invoiceModel.js";

/* ---------------- RAZORPAY CLIENT (lazy) ---------------- */

let razorpayClient = null;

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured."
    );
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    console.log(
      `Razorpay initialised in ${
        keyId.startsWith("rzp_live_") ? "LIVE" : "TEST"
      } mode.`
    );
  }

  return razorpayClient;
}

/* ---------------- HELPERS ---------------- */

const round2 = (n) => Number(Number(n || 0).toFixed(2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getUserId(req) {
  try {
    const auth = getAuth(req);
    if (auth?.userId) return auth.userId;
  } catch {
    // fall through
  }

  return req.auth?.userId || null;
}

// Same rounding rules as invoiceController.js
function computeTotals(items = [], taxPercent = 0) {
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
    0
  );

  const tax = (subtotal * Number(taxPercent || 0)) / 100;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number((subtotal + tax).toFixed(2)),
  };
}

// Razorpay can briefly report "authorized" before auto-capture completes.
async function fetchSettledPayment(rzp, paymentId) {
  let payment = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    payment = await rzp.payments.fetch(paymentId);

    if (payment.status !== "authorized") return payment;

    await sleep(1500);
  }

  return payment;
}

function gatewayMessage(error, fallback) {
  const description = error?.error?.description;
  return description ? `${fallback} (${description})` : fallback;
}

/* ---------------- CREATE ORDER ---------------- */

export const createOrder = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { invoiceId, amount } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      });
    }

    if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
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
        message:
          "Only INR payments are supported by this payment gateway.",
      });
    }

    // Recompute authoritative totals from saved items.
    const totals = computeTotals(
      invoice.items || [],
      invoice.taxPercent
    );

    if (totals.total <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invoice total must be greater than zero.",
      });
    }

    const paidAmount = round2(invoice.paidAmount);

    const remaining = round2(
      Math.max(totals.total - paidAmount, 0)
    );

    if (remaining <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invoice is already fully paid.",
      });
    }

    // Keep stored totals consistent (only write if something changed).
    if (
      invoice.subtotal !== totals.subtotal ||
      invoice.tax !== totals.tax ||
      invoice.total !== totals.total
    ) {
      invoice.subtotal = totals.subtotal;
      invoice.tax = totals.tax;
      invoice.total = totals.total;
      await invoice.save();
    }

    // Full balance by default; partial payment if an amount is sent.
    let payAmount = remaining;

    if (amount !== undefined && amount !== null && amount !== "") {
      payAmount = round2(Number(amount));

      if (!Number.isFinite(payAmount) || payAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid payment amount.",
        });
      }

      if (payAmount > remaining + 0.001) {
        return res.status(400).json({
          success: false,
          message: `Amount exceeds the remaining balance (${remaining.toFixed(
            2
          )}).`,
        });
      }
    }

    const amountInPaise = Math.round(payAmount * 100);

    // Razorpay minimum is 100 paise (INR 1.00).
    if (amountInPaise < 100) {
      return res.status(400).json({
        success: false,
        message: "The minimum online payment is INR 1.00.",
      });
    }

    const rzp = getRazorpay();

    const order = await rzp.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `inv_${String(invoice._id).slice(-12)}_${Date.now().toString(
        36
      )}`,
      notes: {
        invoiceId: String(invoice._id),
        invoiceNumber: String(invoice.invoiceNumber || ""),
        owner: userId,
      },
    });

    // Reference only - verification does not depend on this field.
    await Invoice.updateOne(
      { _id: invoice._id, owner: userId },
      { $set: { razorpayOrderId: order.id } }
    );

    return res.status(200).json({
      success: true,
      message: "Payment order created successfully.",
      order,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: payAmount,
      remainingAmount: remaining,
    });
  } catch (error) {
    console.error("Create Order Error:", error);

    return res.status(error?.statusCode ? 502 : 500).json({
      success: false,
      message: gatewayMessage(error, "Payment initialization failed."),
    });
  }
};

/* ---------------- VERIFY PAYMENT ---------------- */

export const updatePayment = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      invoiceId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      });
    }

    if (
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

    const paymentId = String(razorpay_payment_id);
    const orderId = String(razorpay_order_id);
    const signature = String(razorpay_signature);

    /* 1. Invoice must exist and belong to this user. */

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

    /* 2. Verify the signature with the secret key. */

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      throw new Error("RAZORPAY_KEY_SECRET is not configured.");
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return res.status(400).json({
        success: false,
        message: "Razorpay signature verification failed.",
      });
    }

    /* 3. Idempotency: already recorded -> success, no double credit. */

    if ((invoice.razorpayPaymentIds || []).includes(paymentId)) {
      return res.status(200).json({
        success: true,
        message: "Payment has already been recorded.",
        invoice,
      });
    }

    const rzp = getRazorpay();

    /* 4. The order must have been created for THIS invoice and user. */

    const order = await rzp.orders.fetch(orderId);
    const notes = order?.notes || {};

    if (
      notes.invoiceId !== String(invoice._id) ||
      notes.owner !== userId
    ) {
      return res.status(403).json({
        success: false,
        message: "This payment does not belong to this invoice.",
      });
    }

    if (order.currency !== "INR") {
      return res.status(400).json({
        success: false,
        message: "Unsupported payment currency.",
      });
    }

    /* 5. Verify payment status and amount directly with Razorpay. */

    const payment = await fetchSettledPayment(rzp, paymentId);

    if (payment.order_id !== orderId) {
      return res.status(400).json({
        success: false,
        message: "Payment does not match the order.",
      });
    }

    if (payment.status === "failed") {
      return res.status(400).json({
        success: false,
        message: "The payment failed. You have not been charged.",
      });
    }

    if (payment.status === "authorized") {
      return res.status(409).json({
        success: false,
        message:
          "Payment is still being processed. Please refresh in a minute.",
      });
    }

    if (
      payment.status !== "captured" ||
      payment.currency !== "INR" ||
      Number(payment.amount) !== Number(order.amount)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment has not been captured successfully.",
      });
    }

    const paymentAmount = Number((Number(payment.amount) / 100).toFixed(2));

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount.",
      });
    }

    /* 6. Atomic update: record the payment exactly once. */

    const result = await Invoice.collection.updateOne(
      {
        _id: invoice._id,
        owner: userId,
        razorpayPaymentIds: { $ne: paymentId },
        $expr: {
          $lte: [
            {
              $add: [{ $ifNull: ["$paidAmount", 0] }, paymentAmount],
            },
            { $add: [{ $ifNull: ["$total", 0] }, 0.005] },
          ],
        },
      },
      [
        {
          $set: {
            paidAmount: {
              $round: [
                {
                  $add: [{ $ifNull: ["$paidAmount", 0] }, paymentAmount],
                },
                2,
              ],
            },
            razorpayPaymentIds: {
              $concatArrays: [
                { $ifNull: ["$razorpayPaymentIds", []] },
                [paymentId],
              ],
            },
            razorpayPaymentId: paymentId,
            razorpayOrderId: orderId,
            razorpaySignature: signature,
            updatedAt: "$$NOW",
          },
        },
        {
          $set: {
            remainingAmount: {
              $round: [
                {
                  $max: [
                    0,
                    {
                      $subtract: [
                        { $ifNull: ["$total", 0] },
                        "$paidAmount",
                      ],
                    },
                  ],
                },
                2,
              ],
            },
          },
        },
        {
          $set: {
            status: {
              $cond: [
                { $lte: ["$remainingAmount", 0] },
                "paid",
                "partially_paid",
              ],
            },
          },
        },
      ]
    );

    const fresh = await Invoice.findOne({
      _id: invoice._id,
      owner: userId,
    });

    if (result.matchedCount === 0) {
      // Either a concurrent request already recorded it, or it would overpay.
      if ((fresh?.razorpayPaymentIds || []).includes(paymentId)) {
        return res.status(200).json({
          success: true,
          message: "Payment has already been recorded.",
          invoice: fresh,
        });
      }

      console.error(
        `Payment ${paymentId} captured but exceeds balance of invoice ${invoice._id}.`
      );

      return res.status(409).json({
        success: false,
        message: `Payment ${paymentId} was received but exceeds the invoice balance (the invoice may have been edited). Please contact support for a refund or adjustment.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified and invoice updated successfully.",
      invoice: fresh,
    });
  } catch (error) {
    console.error("Payment Verification Error:", error);

    return res.status(error?.statusCode ? 502 : 500).json({
      success: false,
      message: gatewayMessage(error, "Payment verification failed."),
    });
  }
};