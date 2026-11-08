import express from "express";
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
} from "../controllers/invoiceControllers.js";

const router = express.Router();

/**
 * All routes below are prefixed with /api/invoices
 * Authentication is handled by requireAuth() in server.js
 */

// GET: /api/invoices (The Dashboard call - supports ?invoiceNumber=)
router.get("/", getInvoices);

// POST: /api/invoices (Create new)
router.post("/", createInvoice);

// GET: /api/invoices/:id (View single)
router.get("/:id", getInvoiceById);

// PUT: /api/invoices/:id (Edit/Update)
router.put("/:id", updateInvoice);

// DELETE: /api/invoices/:id (Remove)
router.delete("/:id", deleteInvoice);

export default router;