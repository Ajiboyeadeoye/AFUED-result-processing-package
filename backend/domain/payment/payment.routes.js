import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import paymentGuard from "../../middlewares/paymentGuard.js";

import {
  createPayment,
  verifyPayment,
  paymentWebhook,
  getMyPayments,
} from "./payment.controller.js";

const router = express.Router();

/**
 * ==============================
 * PAYMENT INITIALIZATION
 * ==============================
 * Student creates a payment
 */
router.post(
  "/create",
  authenticate(["student"]),
  createPayment
);

/**
 * ==============================
 * PAYMENT VERIFICATION (Polling)
 * ==============================
 * Used after redirect from provider
 */
router.get(
  "/verify/:transactionRef",
  authenticate(["student", "admin"]),
  verifyPayment
);

/**
 * ==============================
 * PAYMENT WEBHOOKS
 * ==============================
 * Provider callbacks (NO AUTH)
 * Example:
 *  POST /api/payments/webhook/remita
 *  POST /api/payments/webhook/paystack
 */
router.post(
  "/webhook/:provider",
  express.json(),
  paymentWebhook
);

/**
 * ==============================
 * PAYMENT HISTORY
 * ==============================
 * Logged-in student payments
 */
router.get(
  "/my-payments",
  authenticate(["student"]),
  getMyPayments
);

/**
 * ==============================
 * GUARDED ROUTES EXAMPLES
 * ==============================
 * Use these in other modules (NOT payment module)
 */

/**
 * Example: Course registration (requires payment)
 */
// router.post(
//   "/course-registration",
//   authenticate(["student"]),
//   paymentGuard({
//     purpose: "COURSE_REGISTRATION",
//     requireSession: true,
//     requireSemester: true,
//   }),
//   courseRegistrationController
// );

/**
 * Example: Result access
 */
// router.get(
//   "/results",
//   authenticate(["student"]),
//   paymentGuard({
//     purpose: "RESULT_ACCESS",
//     requireSession: true,
//     requireSemester: true,
//   }),
//   viewResultController
// );

/**
 * Example: Transcript download (no session/semester)
 */
// router.get(
//   "/transcript",
//   authenticate(["student"]),
//   paymentGuard({
//     purpose: "TRANSCRIPT",
//     requireSession: false,
//     requireSemester: false,
//   }),
//   downloadTranscriptController
// );

export default router;
