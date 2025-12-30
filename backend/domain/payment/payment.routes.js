// domain/payment/payment.routes.js
import express from 'express';
import bodyParser from 'body-parser';
import {
  createPaymentIntent,
  stripeWebhook,
  getAllPayments,
  getMyPayments,
  getAFUEDServices,
  verifyRemitaPayment,
  remitaWebhook,
  getPaymentById,
  // New functions
  getStudentPaymentSummary,
  checkCourseEligibility,
  batchCheckPermissions,
  checkExamEligibility,
  getPaymentRestrictions,
  checkFeePayment
} from './payment.controller.js';
import authenticate from '../../../middlewares/authenticate.js';
import { auditLogger } from '../../../middlewares/auditLogger.js';

const router = express.Router();

// 🎯 AFUED Payment Services (Public)
router.get('/services', getAFUEDServices);

// 🚀 Create payment intent (student)
router.post(
  '/create-intent',
  authenticate(['student']),
  auditLogger('Initialized a payment'),
  express.json(),
  createPaymentIntent
);

// 🔍 Get payment by ID
router.get(
  '/:paymentId',
  authenticate(['student', 'admin', 'superuser', 'hod', 'finance']),
  auditLogger('Viewed payment details'),
  getPaymentById
);

// 📱 Verify Remita payment
router.get(
  '/remita/verify/:transactionRef',
  authenticate(['student', 'admin', 'superuser', 'finance']),
  auditLogger('Verified Remita payment'),
  verifyRemitaPayment
);

// 🧾 Student can fetch their own payment history
router.get(
  '/my-payments',
  authenticate(['student']),
  auditLogger('Viewed payment history'),
  getMyPayments
);

// 📊 Student payment summary
router.get(
  '/summary',
  authenticate(['student', 'admin', 'hod', 'finance']),
  auditLogger('Viewed payment summary'),
  getStudentPaymentSummary
);

// ✅ Check course registration eligibility
router.post(
  '/check-course-eligibility',
  authenticate(['student']),
  auditLogger('Checked course eligibility'),
  checkCourseEligibility
);

// 📝 Check exam registration eligibility
router.post(
  '/check-exam-eligibility',
  authenticate(['student']),
  auditLogger('Checked exam eligibility'),
  checkExamEligibility
);

// 📋 Batch check permissions for multiple activities
router.post(
  '/check-permissions',
  authenticate(['student', 'admin']),
  auditLogger('Checked permissions'),
  batchCheckPermissions
);

// 🚫 Get payment restrictions
router.get(
  '/restrictions',
  authenticate(['student', 'admin', 'hod', 'finance']),
  auditLogger('Viewed payment restrictions'),
  getPaymentRestrictions
);

// 💰 Check specific fee payment status
router.post(
  '/check-fee-payment',
  authenticate(['student', 'admin', 'finance']),
  auditLogger('Checked fee payment status'),
  checkFeePayment
);

// 🧠 Admin/staff can fetch all payments
router.get(
  '/all',
  authenticate(['admin', 'superuser', 'hod', 'finance']),
  auditLogger('Fetched all payment records'),
  getAllPayments
);

// ⚡ Stripe webhook route — raw body required
router.post(
  '/webhook/stripe',
  bodyParser.raw({ type: 'application/json' }),
  stripeWebhook
);

// ⚡ Remita webhook route
router.post(
  '/webhook/remita',
  express.json(),
  remitaWebhook
);

export default router;