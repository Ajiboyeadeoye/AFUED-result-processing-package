// routes/payment.routes.js
import express from "express";
import { PaymentController } from "../controllers/payment.controller.js";
import { authenticateStudent } from "../middleware/auth.js";

const router = express.Router();

// All routes require student authentication
router.use(authenticateStudent);

// Get expected payment amount
router.get("/expected-amount", PaymentController.getExpectedAmount);

// Initialize payment
router.post("/initialize", PaymentController.initializePayment);

// Check payment status
router.get("/status/:transactionRef", PaymentController.checkPaymentStatus);

// Cancel pending payment
router.delete("/cancel/:transactionRef", PaymentController.cancelPayment);

// Get payment history
router.get("/history", PaymentController.getPaymentHistory);

// Get available providers
router.get("/providers", PaymentController.getProviders);

// Verify payment (polling)
router.get("/verify/:transactionRef", PaymentController.verifyPayment);

// Payment callback (public route - no auth required)
router.get("/callback", (req, res) => PaymentController.paymentCallback(req, res));

// Webhook endpoints (public routes - no auth required)
router.post("/webhook/:provider", (req, res) => PaymentController.handleWebhook(req, res));

export default router;