// backend/routes/paymentRoutes.js
import express from "express";
import bodyParser from "body-parser";
import {
  createPaymentIntent,
  stripeWebhook,
  getAllPayments,
  getMyPayments,
} from "./payment.controller.js";
import authenticate from "../../middlewares/authenticate.js";
import { auditLogger } from "../../middlewares/auditLogger.js";

const router = express.Router();

// 🚀 Create payment intent (student)
router.post(
  "/create-intent",
  authenticate("student"),
  auditLogger("Initialized a payment"),
  express.json(),
  createPaymentIntent
);

// 🧾 Student can fetch their own payment history
router.get(
  "/my-payments",
  authenticate("student"),
  auditLogger("Viewed payment history"),
  getMyPayments
);

// 🧠 Admin/staff can fetch all payments
router.post(
  "/all",
  authenticate(["admin", "superuser", "hod"]),
  auditLogger("Fetched all payment records"),
  getAllPayments
);

// ⚡ Stripe webhook route — raw body required
router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  stripeWebhook
);

export default router;
