import express from "express";
import { createOrder, updatePayment } from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-order", createOrder);

router.post("/update-payment", updatePayment);

export default router;