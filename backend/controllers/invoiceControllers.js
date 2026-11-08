import mongoose from "mongoose";
import Razorpay from "razorpay";
import Invoice from "../models/invoiceModel.js";

/* ---------------- RAZORPAY INSTANCE ---------------- */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* ---------------- HELPER ---------------- */

function computeTotals(items = [], taxPercent = 0) {
  const subtotal = items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
    0
  );

  const tax = (subtotal * Number(taxPercent)) / 100;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number((subtotal + tax).toFixed(2))
  };
}

function generateInvoiceNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${ts}-${rand}`;
}

/* ---------------- CREATE INVOICE ---------------- */

export async function createInvoice(req, res) {
  try {

    const auth = req.auth;
    const userId = auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const body = req.body;

    const items = Array.isArray(body.items) ? body.items : [];

    const totals = computeTotals(items, body.taxPercent || 0);

    const invoiceData = {
      ...body,
      owner: userId,
      invoiceNumber:
        (body.invoiceNumber && body.invoiceNumber.trim()) ||
        generateInvoiceNumber(),
      ...totals
    };

    const invoice = await Invoice.create(invoiceData);

    res.status(201).json({
      success: true,
      data: invoice
    });

  } catch (err) {

    console.error("Create Error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate invoice number"
      });
    }

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/* ---------------- LIST INVOICES ---------------- */

export async function getInvoices(req, res) {
  try {

    const auth = req.auth;
    const userId = auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const { invoiceNumber } = req.query;

    let query = { owner: userId };

    if (invoiceNumber) {
      query.invoiceNumber = {
        $regex: invoiceNumber,
        $options: "i"
      };
    }

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: invoices.length,
      data: invoices
    });

  } catch (err) {

    console.error("getInvoices error:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}

/* ---------------- GET ONE INVOICE ---------------- */

export async function getInvoiceById(req, res) {
  try {

    const auth = req.auth;
    const userId = auth?.userId;

    const id = req.params.id;

    let query = { owner: userId, invoiceNumber: id };

    if (mongoose.Types.ObjectId.isValid(id)) {
      query = {
        owner: userId,
        $or: [{ _id: id }, { invoiceNumber: id }]
      };
    }

    const invoice = await Invoice.findOne(query);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    res.json({
      success: true,
      data: invoice
    });

  } catch (err) {

    console.error("GET invoice error:", err);

    res.status(500).json({
      success: false,
      message: "Error fetching invoice"
    });
  }
}

/* ---------------- UPDATE INVOICE ---------------- */

export async function updateInvoice(req, res) {
  try {

    const auth = req.auth;
    const userId = auth?.userId;
    const id = req.params.id;

    let updateData = { ...req.body };

    if (updateData.items || updateData.taxPercent !== undefined) {

      const totals = computeTotals(
        updateData.items || [],
        updateData.taxPercent || 0
      );

      updateData = {
        ...updateData,
        ...totals
      };
    }

    let query = { owner: userId, invoiceNumber: id };

    if (mongoose.Types.ObjectId.isValid(id)) {
      query = {
        owner: userId,
        $or: [{ _id: id }, { invoiceNumber: id }]
      };
    }

    const updated = await Invoice.findOneAndUpdate(
      query,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    /* ---------------- CREATE NEW RAZORPAY ORDER ---------------- */

    if (updated.total) {

      const order = await razorpay.orders.create({
        amount: Math.round(updated.total * 100),
        currency: "INR",
        receipt: updated.invoiceNumber
      });

      updated.razorpayOrderId = order.id;

      await updated.save();
    }

    res.json({
      success: true,
      data: updated
    });

  } catch (err) {

    console.error("Update invoice error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/* ---------------- DELETE INVOICE ---------------- */

export async function deleteInvoice(req, res) {
  try {

    const auth = req.auth;
    const userId = auth?.userId;
    const id = req.params.id;

    let invoice = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      invoice = await Invoice.findOneAndDelete({
        _id: id,
        owner: userId
      });
    }

    if (!invoice) {
      invoice = await Invoice.findOneAndDelete({
        invoiceNumber: id,
        owner: userId
      });
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    res.json({
      success: true,
      message: "Invoice deleted successfully"
    });

  } catch (err) {

    console.error("Delete invoice error:", err);

    res.status(500).json({
      success: false,
      message: "Error deleting invoice"
    });
  }
}