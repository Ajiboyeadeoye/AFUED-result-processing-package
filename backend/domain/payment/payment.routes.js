import express from "express";
import bodyParser from "body-parser";
import {
  createPaymentIntent,
  stripeWebhook,
  getAllPayments,
  getMyPayments,
  getAFUEDServices,
  verifyRemitaPayment,
  remitaWebhook,
  getPaymentById
} from "./payment.controller.js";
import authenticate from "../../middlewares/authenticate.js";
import { auditLogger } from "../../middlewares/auditLogger.js";

const router = express.Router();

// 🎯 AFUED Payment Services (Public)
router.get("/services", getAFUEDServices);

// 🚀 Create payment intent (student)
router.post(
  "/create-intent",
  authenticate("student"),
  auditLogger("Initialized a payment"),
  express.json(),
  createPaymentIntent
);

// 🔍 Get payment by ID
router.get(
  "/:paymentId",
  authenticate(["student", "admin", "superuser", "hod"]),
  auditLogger("Viewed payment details"),
  getPaymentById
);

// 📱 Verify Remita payment
router.get(
  "/remita/verify/:transactionRef",
  authenticate(["student", "admin", "superuser"]),
  auditLogger("Verified Remita payment"),
  verifyRemitaPayment
);

// 🧾 Student can fetch their own payment history
router.get(
  "/my-payments",
  authenticate("student"),
  auditLogger("Viewed payment history"),
  getMyPayments
);

// 🧠 Admin/staff can fetch all payments
router.get(
  "/all",
  authenticate(["admin", "superuser", "hod"]),
  auditLogger("Fetched all payment records"),
  getAllPayments
);

// ⚡ Stripe webhook route — raw body required
router.post(
  "/webhook/stripe",
  bodyParser.raw({ type: "application/json" }),
  stripeWebhook
);

// ⚡ Remita webhook route
router.post(
  "/webhook/remita",
  express.json(),
  remitaWebhook
);

export default router;
