import express from "express";
import { createOrder, updatePayment, syncPayment } from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-order", createOrder);

router.post("/update-payment", updatePayment);

router.post("/sync", syncPayment);

export default router;