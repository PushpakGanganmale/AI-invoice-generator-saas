
import mongoose from "mongoose";
import Invoice from "../models/invoiceModel.js";

/* ---------------- HELPERS ---------------- */

function computeTotals(items = [], taxPercent = 0) {
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      (Number(item.qty) || 0) *
        (Number(item.unitPrice) || 0),
    0
  );

  const tax =
    (subtotal * Number(taxPercent || 0)) / 100;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number((subtotal + tax).toFixed(2)),
  };
}

function generateInvoiceNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase();

  return `INV-${timestamp}-${random}`;
}

function invoiceQuery(id, userId) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return {
      owner: userId,
      $or: [
        { _id: id },
        { invoiceNumber: id },
      ],
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
        message: "User not authenticated.",
      });
    }

    const body = { ...req.body };

    const items = Array.isArray(body.items)
      ? body.items
      : [];

    const taxPercent = Number(body.taxPercent) || 0;

    if (taxPercent < 0 || taxPercent > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid tax percentage.",
      });
    }

    const totals = computeTotals(items, taxPercent);

    // Never accept payment or ownership values from frontend.
    delete body.owner;
    delete body.paidAmount;
    delete body.remainingAmount;
    delete body.razorpayOrderId;
    delete body.razorpayPaymentId;
    delete body.razorpayPaymentIds;
    delete body.razorpaySignature;

    const invoiceData = {
      ...body,
      owner: userId,
      invoiceNumber:
        typeof body.invoiceNumber === "string" &&
        body.invoiceNumber.trim()
          ? body.invoiceNumber.trim()
          : generateInvoiceNumber(),
      items,
      taxPercent,
      paidAmount: 0,
      ...totals,
    };

    const invoice = await Invoice.create(invoiceData);

    return res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error("Create Invoice Error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate invoice number.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Invoice creation failed.",
    });
  }
}

/* ---------------- LIST INVOICES ---------------- */

export async function getInvoices(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const { invoiceNumber } = req.query;

    const query = {
      owner: userId,
    };

    if (invoiceNumber) {
      query.invoiceNumber = {
        $regex: String(invoiceNumber).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        ),
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
      message: "Unable to fetch invoices.",
    });
  }
}

/* ---------------- GET ONE INVOICE ---------------- */

export async function getInvoiceById(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const invoice = await Invoice.findOne(
      invoiceQuery(req.params.id, userId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
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
      message: "Error fetching invoice.",
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
        message: "Unauthorized.",
      });
    }

    const invoice = await Invoice.findOne(
      invoiceQuery(req.params.id, userId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    const updateData = { ...req.body };

    // Protect ownership, payment records and calculated fields.
    const protectedFields = [
      "owner",
      "_id",
      "paidAmount",
      "remainingAmount",
      "subtotal",
      "tax",
      "total",
      "status",
      "razorpayOrderId",
      "razorpayPaymentId",
      "razorpayPaymentIds",
      "razorpaySignature",
    ];

    protectedFields.forEach((field) => {
      delete updateData[field];
    });

    const newItems =
      updateData.items !== undefined
        ? updateData.items
        : invoice.items;

    const newTaxPercent =
      updateData.taxPercent !== undefined
        ? Number(updateData.taxPercent)
        : Number(invoice.taxPercent || 0);

    if (!Array.isArray(newItems)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice items.",
      });
    }

    if (
      !Number.isFinite(newTaxPercent) ||
      newTaxPercent < 0 ||
      newTaxPercent > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid tax percentage.",
      });
    }

    const totals = computeTotals(
      newItems,
      newTaxPercent
    );

    // Do not allow invoice edits to reduce the total below
    // the amount already received.
    if (totals.total < Number(invoice.paidAmount || 0)) {
      return res.status(400).json({
        success: false,
        message:
          "Invoice total cannot be less than the amount already paid.",
      });
    }

    Object.assign(invoice, updateData);

    invoice.items = newItems;
    invoice.taxPercent = newTaxPercent;

    invoice.subtotal = totals.subtotal;
    invoice.tax = totals.tax;
    invoice.total = totals.total;

    await invoice.save();

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error("Update Invoice Error:", error);

    return res.status(500).json({
      success: false,
      message: "Invoice update failed.",
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
        message: "Unauthorized.",
      });
    }

    const invoice = await Invoice.findOne(
      invoiceQuery(req.params.id, userId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    // Preserve invoices that have received payments.
    if (Number(invoice.paidAmount || 0) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "An invoice with recorded payments cannot be deleted.",
      });
    }

    await invoice.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Invoice deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Invoice Error:", error);

    return res.status(500).json({
      success: false,
      message: "Invoice deletion failed.",
    });
  }
}
