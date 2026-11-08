
import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "path";

import { clerkMiddleware, requireAuth } from "@clerk/express";

import { connectDB } from "./config/db.js";

import invoiceRouter from "./routes/invoiceRouter.js";
import bussinessProfileRouter from "./routes/bussinessProfileRouter.js";
import aiInvoiceRouter from "./routes/aiInvoiceRouter.js";
import paymentRouter from "./routes/paymentRouter.js";
import { razorpayWebhook } from "./controllers/paymentWebhook.js";

const app = express();
const port = process.env.PORT || 4000;

/* ---------------- CORS ---------------- */

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4000",
  "https://frontend-kohl-six-85.vercel.app",
  "https://frontend-ofzhuhh5a-pushpak17.vercel.app",
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((url) => url.replace(/\/$/, ""));

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }

    console.error("Blocked CORS origin:", origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
  ],
};

app.use(cors(corsOptions));

/* ---------------- RAZORPAY WEBHOOK ----------------
   Must be registered BEFORE express.json() and clerkMiddleware():
   it needs the raw body for signature verification and has no Clerk auth. */

app.post(
  "/api/payment/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, res, next) => ensureDBConnection(req, res, next),
  razorpayWebhook
);

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use(clerkMiddleware());

/* ---------------- STATIC FILES ---------------- */

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/* ---------------- HEALTH ROUTES ---------------- */

app.get("/", (req, res) => {
  res.status(200).send("InvoiceGenius API Working");
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    message: "InvoiceGenius backend is running",
  });
});

/* ---------------- DATABASE CONNECTION ---------------- */

let dbConnectionPromise = null;

const ensureDBConnection = async (req, res, next) => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI environment variable is missing");
    }

    if (mongoose.connection.readyState === 1) {
      return next();
    }

    if (!dbConnectionPromise) {
      dbConnectionPromise = connectDB().catch((error) => {
        dbConnectionPromise = null;
        throw error;
      });
    }

    await dbConnectionPromise;

    return next();
  } catch (error) {
    console.error("Database connection failed:", error.message);

    return res.status(503).json({
      success: false,
      message: "Database connection unavailable",
    });
  }
};

/* ---------------- API ROUTES ---------------- */

app.use(
  "/api/invoices",
  ensureDBConnection,
  requireAuth(),
  invoiceRouter
);

app.use(
  "/api/business-profile",
  ensureDBConnection,
  requireAuth(),
  bussinessProfileRouter
);

app.use(
  "/api/ai-invoices",
  ensureDBConnection,
  requireAuth(),
  aiInvoiceRouter
);

app.use(
  "/api/payment",
  ensureDBConnection,
  requireAuth(),
  paymentRouter
);

/* ---------------- ERROR HANDLER ---------------- */

app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

/* ---------------- 404 HANDLER ---------------- */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

/* ---------------- EXPORT APP ---------------- */

export default app;

/* ---------------- LOCAL SERVER ---------------- */

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`InvoiceGenius server running on port ${port}`);
  });
}
