
import mongoose from "mongoose";

/* ---------------- ITEM SCHEMA ---------------- */

const ItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    qty: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },

    unitPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

/* ---------------- INVOICE SCHEMA ---------------- */

const InvoiceSchema = new mongoose.Schema(
  {
    owner: {
      type: String,
      required: true,
      index: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },

    issueDate: Date,
    dueDate: Date,

    fromBusinessName: { type: String, default: "" },
    fromEmail: { type: String, default: "" },
    fromAddress: { type: String, default: "" },
    fromPhone: { type: String, default: "" },
    fromGst: { type: String, default: "" },

    client: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
    },

    items: {
      type: [ItemSchema],
      default: [],
    },

    currency: {
      type: String,
      default: "INR",
    },

    status: {
      type: String,
      enum: ["draft", "unpaid", "partially_paid", "paid", "overdue"],
      default: "draft",
    },

    logoDataUrl: { type: String, default: null },
    stampDataUrl: { type: String, default: null },
    signatureDataUrl: { type: String, default: null },

    signatureName: { type: String, default: "" },
    signatureTitle: { type: String, default: "" },

    /* ---------------- TAX ---------------- */

    taxPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    tax: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ---------------- PAYMENT ---------------- */

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    notes: { type: String, default: "" },
    terms: { type: String, default: "" },

    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

/* ---------------- PAYMENT STATUS ---------------- */

InvoiceSchema.pre("save", function (next) {
  const total = Number(this.total) || 0;
  const paidAmount = Number(this.paidAmount) || 0;

  this.remainingAmount = Number(
    Math.max(total - paidAmount, 0).toFixed(2)
  );

  if (total <= 0) {
    this.status = "draft";
  } else if (paidAmount <= 0) {
    if (this.status !== "overdue") {
      this.status = "unpaid";
    }
  } else if (this.remainingAmount <= 0) {
    this.status = "paid";
  } else {
    this.status = "partially_paid";
  }

  next();
});

/* ---------------- INDEXES ---------------- */

InvoiceSchema.index(
  { owner: 1, invoiceNumber: 1 },
  { unique: true, sparse: true }
);

InvoiceSchema.index({
  owner: 1,
  createdAt: -1,
});

/* ---------------- MODEL ---------------- */

const Invoice =
  mongoose.models.Invoice ||
  mongoose.model("Invoice", InvoiceSchema);

export default Invoice;
