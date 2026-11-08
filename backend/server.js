
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

const app = express();
const port = process.env.PORT || 4000;

/* ---------------- CORS ---------------- */

const allowedOrigins = [
  "http://localhost:5173",
  "https://invoicegenius-4ffi.onrender.com",
  "https://frontend-kohl-six-85.vercel.app",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error("CORS blocked origin:", origin);

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
  ],
};

app.use(cors(corsOptions));

/* ---------------- BODY PARSING ---------------- */

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

/* ---------------- CLERK AUTHENTICATION ---------------- */

app.use(clerkMiddleware());

/* ---------------- STATIC FILES ---------------- */

// Vercel deployment filesystem is read-only.
// Persistent uploaded files require cloud storage.
if (process.env.VERCEL !== "1") {
  app.use(
    "/uploads",
    express.static(path.join(process.cwd(), "uploads"))
  );
}

/* ---------------- HEALTH CHECK ---------------- */

app.get("/", (req, res) => {
  res.status(200).send("InvoiceGenius API Working");
});

app.get("/api/health", async (req, res) => {
  try {
    await connectDB();

    res.status(200).json({
      success: true,
      status: "ok",
      message: "InvoiceGenius backend is running",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check database error:", error);

    res.status(500).json({
      success: false,
      status: "error",
      message: "Database connection failed",
    });
  }
});

/* ---------------- API ROUTES ---------------- */

app.use("/api/invoices", requireAuth(), invoiceRouter);

app.use(
  "/api/business-profile",
  requireAuth(),
  bussinessProfileRouter
);

app.use("/api/ai-invoices", requireAuth(), aiInvoiceRouter);

app.use("/api/payment", requireAuth(), paymentRouter);

/* ---------------- 404 HANDLER ---------------- */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

/* ---------------- ERROR HANDLER ---------------- */

app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

/* ---------------- SERVER STARTUP ---------------- */

// Vercel uses the exported Express application.
// Local development uses app.listen().

if (process.env.VERCEL !== "1") {
  const startServer = async () => {
    try {
      await connectDB();

      app.listen(port, () => {
        console.log(`InvoiceGenius server running on port ${port}`);
      });
    } catch (error) {
      console.error("Server startup failed:", error);
      process.exit(1);
    }
  };

  startServer();
}

export default app;
