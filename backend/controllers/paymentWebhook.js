import crypto from "crypto";
import { recordPayment } from "./paymentController.js";

/**
 * Mounted in server.js with express.raw() BEFORE express.json() and Clerk,
 * so req.body is the untouched Buffer needed for signature verification.
 */
export const razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!secret || !signature || !Buffer.isBuffer(req.body)) {
      console.error("Webhook rejected: missing secret/signature or body is not raw");
      return res.status(400).send("Bad request");
    }

    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.error("Webhook rejected: invalid signature");
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString("utf8"));

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      const invoiceId = payment?.notes?.invoiceId;

      if (payment && invoiceId && payment.status === "captured") {
        const result = await recordPayment(invoiceId, payment);
        console.log(
          `Webhook ${event.event} ${payment.id}:`,
          result.recorded ? "recorded" : "already recorded"
        );
      } else {
        console.warn("Webhook: no invoiceId note or not captured", payment?.id);
      }
    }

    // 200 for any validly signed event so Razorpay stops retrying
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("Server error"); // Razorpay will retry
  }
};
