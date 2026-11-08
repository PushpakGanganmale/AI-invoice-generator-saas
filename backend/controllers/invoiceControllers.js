
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Invoice from "../models/invoiceModel.js";

/* ---------------- RAZORPAY ---------------- */

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

/* ---------------- HELPERS ---------------- */

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function computeTotals(items = [], taxPercent = 0) {
  if (!Array.isArray(items)) {
    throw new Error("Invoice items must be an array");
  }

  const rate = Number(taxPercent);

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("Tax percentage must be between 0 and 100");
  }

  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);

    if (
      !Number.isFinite(qty) ||
      !Number.isFinite(unitPrice) ||
      qty < 0 ||
      unitPrice < 0
    ) {
      throw new Error("Invalid item quantity or unit price");
    }

    return sum + qty * unitPrice;
  }, 0);

  const roundedSubtotal = roundMoney(subtotal);
  const tax = roundMoney((roundedSubtotal * rate) / 100);

  return {
    taxPercent: rate,
    subtotal: roundedSubtotal,
    tax,
    total: roundMoney(roundedSubtotal + tax),
  };
}

function generateInvoiceNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `INV-${timestamp}-${random}`;
}

function getInvoiceQuery(id, userId) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return {
      owner: userId,
      $or: [{ _id: id }, { invoiceNumber: id }],
    };
  }

  return {
    owner: userId,
    invoiceNumber: id,
  };
}

/* ---------------- CREATE INVOICE ---------------- */

export async function createInvoice(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const body = { ...req.body };

    const items = Array.isArray(body.items) ? body.items : [];

    // Support both new and old frontend tax fields.
    const taxPercent = body.taxPercent ?? body.taxRate ?? 0;

    const totals = computeTotals(items, taxPercent);

    delete body.taxRate;
    delete body.taxAmount;
    delete body.owner;
    delete body._id;

    const invoice = await Invoice.create({
      ...body,
      owner: userId,
      invoiceNumber:
        (typeof body.invoiceNumber === "string" &&
          body.invoiceNumber.trim()) ||
        generateInvoiceNumber(),
      items,
      ...totals,
    });

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Create Invoice Error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate invoice number",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create invoice",
    });
  }
}

/* ---------------- GET ALL INVOICES ---------------- */

export async function getInvoices(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const query = { owner: userId };

    if (req.query.invoiceNumber) {
      query.invoiceNumber = {
        $regex: req.query.invoiceNumber,
        $options: "i",
      };
    }

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: invoices.length,
      data: invoices,
    });
  } catch (error) {
    console.error("Get Invoices Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch invoices",
    });
  }
}

/* ---------------- GET SINGLE INVOICE ---------------- */

export async function getInvoiceById(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const invoice = await Invoice.findOne(
      getInvoiceQuery(req.params.id, userId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error("Get Invoice Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch invoice",
    });
  }
}

/* ---------------- UPDATE INVOICE ---------------- */

export async function updateInvoice(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const invoice = await Invoice.findOne(
      getInvoiceQuery(req.params.id, userId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const updateData = { ...req.body };

    // Protect database-managed fields.
    delete updateData.owner;
    delete updateData._id;
    delete updateData.taxAmount;
    delete updateData.razorpayOrderId;
    delete updateData.razorpayPaymentId;
    delete updateData.razorpaySignature;
    delete updateData.paidAmount;
    delete updateData.remainingAmount;
    delete updateData.status;

    // Backward compatibility.
    if (
      updateData.taxPercent === undefined &&
      updateData.taxRate !== undefined
    ) {
      updateData.taxPercent = updateData.taxRate;
    }

    delete updateData.taxRate;

    // Preserve existing values when fields are not submitted.
    const finalItems =
      updateData.items !== undefined
        ? updateData.items
        : invoice.items;

    const finalTaxPercent =
      updateData.taxPercent !== undefined
        ? updateData.taxPercent
        : invoice.taxPercent;

    // Always recalculate using the final items and tax percentage.
    const totals = computeTotals(finalItems, finalTaxPercent);

    const previousTotal = Number(invoice.total);

    Object.assign(invoice, updateData, totals);

    const amountChanged =
      previousTotal !== Number(invoice.total);

    // Do not silently replace an order for an already-paid invoice.
    if (amountChanged && Number(invoice.paidAmount) > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot change invoice amount after a payment has been recorded.",
      });
    }

    // Create a fresh Razorpay order if the amount changes.
    if (amountChanged && invoice.total > 0 && razorpay) {
      const order = await razorpay.orders.create({
        amount: Math.round(invoice.total * 100),
        currency: invoice.currency || "INR",
        receipt: invoice.invoiceNumber,
      });

      invoice.razorpayOrderId = order.id;
      invoice.razorpayPaymentId = null;
      invoice.razorpaySignature = null;
    }

    await invoice.save();

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Update Invoice Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to update invoice",
    });
  }
}

/* ---------------- DELETE INVOICE ---------------- */

export async function deleteInvoice(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const invoice = await Invoice.findOneAndDelete(
      getInvoiceQuery(req.params.id, userId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (error) {
    console.error("Delete Invoice Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete invoice",
    });
  }
}
