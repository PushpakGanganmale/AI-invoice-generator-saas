import express from "express";

import {
  createOrder,
  updatePayment,
  syncPayments,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-order", createOrder);

router.post("/update-payment", updatePayment);

router.post("/sync", syncPayments);

export default router;