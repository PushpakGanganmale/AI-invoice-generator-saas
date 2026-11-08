import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Invoice from "../models/invoiceModel.js";
import { connectDB } from "../config/db.js";

export const razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not set.");
      return res.status(500).json({ success: false });
    }

    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body; // Buffer (express.raw)

    if (!signature || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ success: false });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.error("Webhook signature mismatch.");
      return res.status(400).json({ success: false });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    // Only act on captured payments; acknowledge everything else.
    if (event.event !== "payment.captured") {
      return res.status(200).json({ success: true, ignored: true });
    }

    const payment = event?.payload?.payment?.entity;

    if (!payment?.id || !payment?.order_id) {
      return res.status(200).json({ success: true, ignored: true });
    }

    await connectDB();

    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Notes were set by our server when the order was created.
    const order = await rzp.orders.fetch(payment.order_id);
    const notes = order?.notes || {};

    if (
      !notes.invoiceId ||
      !notes.owner ||
      !mongoose.Types.ObjectId.isValid(notes.invoiceId)
    ) {
      // Not an InvoiceGenius payment.
      return res.status(200).json({ success: true, ignored: true });
    }

    if (
      payment.status !== "captured" ||
      payment.currency !== "INR" ||
      Number(payment.amount) !== Number(order.amount)
    ) {
      return res.status(200).json({ success: true, ignored: true });
    }

    const paymentId = String(payment.id);
    const orderId = String(payment.order_id);
    const paymentAmount = Number((Number(payment.amount) / 100).toFixed(2));

    const result = await Invoice.collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(notes.invoiceId),
        owner: notes.owner,
        razorpayPaymentIds: { $ne: paymentId },
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ["$paidAmount", 0] }, paymentAmount] },
            { $add: [{ $ifNull: ["$total", 0] }, 0.005] },
          ],
        },
      },
      [
        {
          $set: {
            paidAmount: {
              $round: [
                { $add: [{ $ifNull: ["$paidAmount", 0] }, paymentAmount] },
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

    console.log(
      `Webhook: payment ${paymentId} -> invoice ${notes.invoiceId} ` +
        `(${result.matchedCount ? "recorded" : "already recorded / skipped"})`
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    // 500 makes Razorpay retry later.
    return res.status(500).json({ success: false });
  }
};