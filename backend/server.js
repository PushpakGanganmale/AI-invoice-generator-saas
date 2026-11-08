
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

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("CORS blocked origin:", origin);
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
    ],
  })
);

/* ---------------- BODY PARSING ---------------- */

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

/* ---------------- CLERK ---------------- */

app.use(clerkMiddleware());

/* ---------------- STATIC FILES ---------------- */

if (process.env.VERCEL !== "1") {
  app.use(
    "/uploads",
    express.static(path.join(process.cwd(), "uploads"))
  );
}

/* ---------------- ROOT ---------------- */

app.get("/", (req, res) => {
  res.status(200).send("InvoiceGenius API Working");
});

/* ---------------- DATABASE CONNECTION ---------------- */

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database middleware error:", error);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

/* ---------------- HEALTH CHECK ---------------- */

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    message: "InvoiceGenius backend is running",
    database: "connected",
  });
});

/* ---------------- API ROUTES ---------------- */

app.use(
  "/api/invoices",
  requireAuth(),
  invoiceRouter
);

app.use(
  "/api/business-profile",
  requireAuth(),
  bussinessProfileRouter
);

app.use(
  "/api/ai-invoices",
  requireAuth(),
  aiInvoiceRouter
);

app.use(
  "/api/payment",
  requireAuth(),
  paymentRouter
);

/* ---------------- 404 ---------------- */

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

/* ---------------- LOCAL SERVER ---------------- */

if (process.env.VERCEL !== "1") {
  const startServer = async () => {
    try {
      await connectDB();

      app.listen(port, () => {
        console.log(
          `InvoiceGenius running on port ${port}`
        );
      });
    } catch (error) {
      console.error("Server startup failed:", error);
      process.exit(1);
    }
  };

  startServer();
}

export default app;
