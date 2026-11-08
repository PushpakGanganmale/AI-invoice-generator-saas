import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema(
{
id: {
type: String,
default: () => new mongoose.Types.ObjectId().toString(),
},
description: { type: String, required: true },
qty: { type: Number, required: true, default: 1 },
unitPrice: { type: Number, required: true, default: 0 },
},
{ _id: false }
);

const InvoiceSchema = new mongoose.Schema(
{
owner: { type: String, required: true, index: true },

invoiceNumber: { type: String, required: true },

issueDate: { type: Date },
dueDate: { type: Date },

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

items: { type: [ItemSchema], default: [] },

currency: { type: String, default: "INR" },

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

taxPercent: { type: Number, default: 0 },

subtotal: { type: Number, default: 0 },
tax: { type: Number, default: 0 },
total: { type: Number, default: 0 },

paidAmount: { type: Number, default: 0 },
remainingAmount: { type: Number, default: 0 },

notes: { type: String, default: "" },
terms: { type: String, default: "" },

/* Razorpay fields */

razorpayOrderId: { type: String, default: null },
razorpayPaymentId: { type: String, default: null },
razorpaySignature: { type: String, default: null }

},
{ timestamps: true }
);

/* ---------------- AUTO CALCULATE PAYMENT STATUS ---------------- */

InvoiceSchema.pre("save", function (next) {

if (!this.total) {
this.remainingAmount = 0;
return next();
}

/* calculate remaining */
this.remainingAmount = Math.max(this.total - this.paidAmount, 0);

/* update status */

if (this.paidAmount <= 0) {
this.status = "unpaid";
}
else if (this.remainingAmount === 0) {
this.status = "paid";
}
else {
this.status = "partially_paid";
}

next();
});

/* ---------------- INDEXES ---------------- */

InvoiceSchema.index(
{ owner: 1, invoiceNumber: 1 },
{ unique: true, sparse: true }
);

InvoiceSchema.index({ owner: 1, createdAt: -1 });

const Invoice =
mongoose.models.Invoice ||
mongoose.model("Invoice", InvoiceSchema);

export default Invoice;