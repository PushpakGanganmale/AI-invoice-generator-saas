import Razorpay from "razorpay";
import Invoice from "../models/invoiceModel.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

    // ✅ FIXED: always recalculate fresh total from items
    const freshTotal = Number((subtotal + tax).toFixed(2));

    // ✅ FIXED: recalculate remaining from fresh total
    const paidAmount = Number(invoice.paidAmount) || 0;
    const remainingAmount = Number(Math.max(freshTotal - paidAmount, 0).toFixed(2));

    const amount = remainingAmount > 0 ? remainingAmount : freshTotal;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    /* -------- SYNC INVOICE TOTAL IF CHANGED -------- */

    if (invoice.total !== freshTotal) {
      invoice.total = freshTotal;
      invoice.subtotal = Number(subtotal.toFixed(2));
      invoice.tax = Number(tax.toFixed(2));
      invoice.remainingAmount = remainingAmount;
      await invoice.save();
    }

    /* -------- CREATE RAZORPAY ORDER -------- */

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      receipt: `invoice_${invoice._id}`,
    });

    res.json({
      success: true,
      order,
      remainingAmount: amount, // ✅ send correct amount to frontend
    });

  } catch (error) {
    console.error("Create Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Payment initialization failed",
    });
  }
};

/* ---------------- UPDATE PAYMENT ---------------- */

export const updatePayment = async (req, res) => {
  try {
    const { invoiceId, amount } = req.body;

    if (!invoiceId || !amount) {
      return res.status(400).json({
        success: false,
        message: "Invoice ID and amount required",
      });
    }

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    /* -------- BLOCK IF ALREADY FULLY PAID -------- */

    if (invoice.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice is already fully paid",
      });
    }

    /* -------- UPDATE PAID AMOUNT -------- */

    // pre("save") hook will auto-calculate remainingAmount and status
    invoice.paidAmount = (invoice.paidAmount || 0) + Number(amount);
    await invoice.save();

    res.json({
      success: true,
      invoice,
    });

  } catch (error) {
    console.error("Payment Update Error:", error);

    res.status(500).json({
      success: false,
      message: "Payment update failed",
    });
  }
};