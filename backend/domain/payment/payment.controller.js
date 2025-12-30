// domain/payment/payment.controller.js
import stripe from "../../utils/paystackClient.js";
import Payment from "./payment.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import RemitaService from "./remita.service.js";
import { CourseRestrictionService } from "./courseRestriction.service.js";

/**
 * 🎯 Create a payment intent with course restrictions
 */
export const createPaymentIntent = async (req, res) => {
  const { amount, feeType, description, provider = "STRIPE", courseId } = req.body;

  try {
    if (!amount || amount <= 0)
      return buildResponse.error(res, "Invalid amount", 400);

    const studentId = req.user?._id;
    if (!studentId)
      return buildResponse.error(res, "Unauthorized: Student not found", 401);

    // ✅ Check course restrictions before payment
    if (courseId) {
      const restrictionService = new CourseRestrictionService();
      const canAccess = await restrictionService.checkPermission(studentId, feeType, null);
      
      if (!canAccess.allowed && canAccess.restrictionLevel === 'STRICT') {
        return buildResponse.error(
          res, 
          canAccess.message, 
          403, 
          {
            restrictionType: canAccess.type,
            requiredPayments: canAccess.requiredPayments || [],
            currentStatus: "PAYMENT_REQUIRED",
            missingPayments: canAccess.requiredPayments || []
          }
        );
      }
    }

    // Get student info
    const studentInfo = {
      matricNumber: req.user.matricNumber,
      fullName: `${req.user.firstName} ${req.user.lastName}`,
      email: req.user.email,
      phone: req.user.phone || "08000000000",
      department: req.user.department,
      level: req.user.level,
      session: req.user.session
    };

    // Generate transaction reference
    const transactionRef = Payment.generateTransactionRef();

    // Create payment record
    const paymentData = {
      payer: studentId,
      amount: amount,
      currency: "NGN",
      feeType,
      description: description || `${feeType} payment`,
      provider: provider.toUpperCase(),
      status: "CREATED",
      transactionRef,
      studentInfo,
      academicSession: req.user.session,
      metadata: {
        initiatedBy: studentId,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        courseId: courseId || null,
        restrictionChecks: {}
      }
    };

    const payment = await Payment.create(paymentData);

    // Route to appropriate payment provider
    if (provider.toUpperCase() === "STRIPE") {
      return await processStripePayment(payment, req, res);
    } else if (provider.toUpperCase() === "REMITA") {
      return await processRemitaPayment(payment, req, res);
    } else {
      return buildResponse.error(res, "Unsupported payment provider", 400);
    }

  } catch (error) {
    console.error("Create payment intent error:", error);
    return buildResponse.error(res, "Payment creation failed", 500, error);
  }
};

/**
 * Process Stripe payment
 */
async function processStripePayment(payment, req, res) {
  try {
    const amountInKobo = Math.round(payment.amount * 100);

    // Create PaymentIntent on Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInKobo,
      currency: "ngn",
      metadata: { 
        studentId: payment.payer.toString(),
        feeType: payment.feeType,
        transactionRef: payment.transactionRef
      },
      description: payment.description || `${payment.feeType} payment`,
    });

    // Update payment with Stripe details
    payment.providerPaymentId = paymentIntent.id;
    payment.stripe = {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    };
    payment.status = paymentIntent.status === "requires_action" ? "REQUIRES_ACTION" : "PENDING";
    
    await payment.save();

    return buildResponse.success(
      res,
      "Stripe payment initialized",
      {
        clientSecret: paymentIntent.client_secret,
        paymentId: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        transactionRef: payment.transactionRef,
        provider: "STRIPE",
        requiresAction: paymentIntent.status === "requires_action"
      }
    );

  } catch (error) {
    console.error("Stripe payment error:", error);
    payment.status = "FAILED";
    await payment.save();
    
    return buildResponse.error(res, "Stripe payment failed: " + error.message, 500, error);
  }
}

/**
 * Process Remita payment
 */
async function processRemitaPayment(payment, req, res) {
  try {
    const remitaService = new RemitaService();
    const studentData = req.user;

    // Initialize Remita payment
    const remitaResult = await remitaService.initializePayment(payment._id, studentData);

    return buildResponse.success(
      res,
      "Remita payment initialized",
      {
        paymentId: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        transactionRef: payment.transactionRef,
        provider: "REMITA",
        paymentUrl: remitaResult.paymentUrl,
        environment: remitaResult.environment,
        instructions: {
          web: "You will be redirected to Remita payment page",
          ussd: "Dial *737# for USSD payment",
          bank: "Make transfer to Remita collection account"
        },
        rrr: remitaResult.rrr || null
      }
    );

  } catch (error) {
    console.error("Remita payment error:", error);
    payment.status = "FAILED";
    await payment.save();
    
    return buildResponse.error(res, "Remita payment failed: " + error.message, 500, error);
  }
}

/**
 * 🎯 Get AFUED payment services
 */
export const getAFUEDServices = async (req, res) => {
  try {
    const remitaService = new RemitaService();
    const services = remitaService.getAFUEDServices();

    return buildResponse.success(
      res,
      "AFUED payment services retrieved",
      {
        university: "Adeyemi Federal University of Education",
        services: Object.values(services),
        timestamp: new Date().toISOString()
      }
    );

  } catch (error) {
    console.error("Get AFUED services error:", error);
    return buildResponse.error(res, "Failed to retrieve services", 500, error);
  }
};

/**
 * 🎯 Verify Remita payment
 */
export const verifyRemitaPayment = async (req, res) => {
  try {
    const { transactionRef } = req.params;

    if (!transactionRef) {
      return buildResponse.error(res, "Transaction reference is required", 400);
    }

    const remitaService = new RemitaService();
    const verification = await remitaService.verifyPayment(transactionRef);

    return buildResponse.success(res, "Payment verification completed", verification);

  } catch (error) {
    console.error("Verify Remita payment error:", error);
    return buildResponse.error(res, "Payment verification failed: " + error.message, 500, error);
  }
};

/**
 * 🎯 Handle Remita webhook
 */
export const remitaWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    const signature = req.headers["x-remita-signature"];

    console.log("Received Remita webhook:", {
      data: webhookData,
      signature,
      timestamp: new Date().toISOString()
    });

    const remitaService = new RemitaService();
    const result = await remitaService.handleWebhook(webhookData);

    // Webhooks should return raw responses, not buildResponse format
    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      data: result
    });

  } catch (error) {
    console.error("Remita webhook error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 🎯 Get payment by ID
 */
export const getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const studentId = req.user?._id;

    const payment = await Payment.findById(paymentId)
      .populate("payer", "firstName lastName email matricNumber department level");
    
    if (!payment) {
      return buildResponse.error(res, "Payment not found", 404);
    }

    // Check authorization
    if (payment.payer._id.toString() !== studentId.toString() && 
        !req.user.roles?.includes("admin") && 
        !req.user.roles?.includes("superuser") &&
        !req.user.roles?.includes("finance")) {
      return buildResponse.error(res, "Unauthorized to view this payment", 403);
    }

    return buildResponse.success(res, "Payment retrieved", payment);

  } catch (error) {
    console.error("Get payment by ID error:", error);
    return buildResponse.error(res, "Failed to retrieve payment", 500, error);
  }
};

/**
 * 🎯 Get all payments (admin)
 */
export const getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, feeType, provider, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (feeType) filter.feeType = feeType;
    if (provider) filter.provider = provider;
    
    // Date filtering
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("payer", "firstName lastName email matricNumber department");

    const total = await Payment.countDocuments(filter);

    return buildResponse.success(
      res,
      "Payments retrieved successfully",
      {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        filters: {
          status,
          feeType,
          provider,
          dateRange: { startDate, endDate }
        }
      }
    );

  } catch (error) {
    console.error("Get all payments error:", error);
    return buildResponse.error(res, "Failed to retrieve payments", 500, error);
  }
};

/**
 * 🎯 Get my payments (student)
 */
export const getMyPayments = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { page = 1, limit = 10, status, feeType } = req.query;
    const skip = (page - 1) * limit;

    const filter = { payer: studentId };
    if (status) filter.status = status;
    if (feeType) filter.feeType = feeType;

    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(filter);

    return buildResponse.success(
      res,
      "Your payments retrieved successfully",
      {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    );

  } catch (error) {
    console.error("Get my payments error:", error);
    return buildResponse.error(res, "Failed to retrieve your payments", 500, error);
  }
};

/**
 * 🎯 Stripe webhook handler
 */
export const stripeWebhook = async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ 
        success: false, 
        error: `Webhook Error: ${err.message}` 
      });
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      case "payment_intent.payment_failed":
        const failedPayment = event.data.object;
        await handlePaymentIntentFailed(failedPayment);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ success: true, received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper functions for webhook handling
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      "stripe.paymentIntentId": paymentIntent.id
    });

    if (payment) {
      payment.status = "SUCCEEDED";
      payment.paidAt = new Date();
      payment.stripe.chargeId = paymentIntent.charges?.data[0]?.id;
      payment.stripe.receiptUrl = paymentIntent.charges?.data[0]?.receipt_url;
      await payment.save();
      
      console.log(`Payment ${payment._id} marked as succeeded`);
      
      // Trigger post-payment actions if course is involved
      if (payment.metadata?.courseId) {
        const restrictionService = new CourseRestrictionService();
        await restrictionService.updateCourseAccess(
          payment.payer,
          payment.metadata.courseId,
          payment.feeType,
          payment._id
        );
      }
    }
  } catch (error) {
    console.error("Error handling payment success:", error);
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      "stripe.paymentIntentId": paymentIntent.id
    });

    if (payment) {
      payment.status = "FAILED";
      payment.failureReason = paymentIntent.last_payment_error?.message || "Payment failed";
      await payment.save();
      console.log(`Payment ${payment._id} marked as failed`);
    }
  } catch (error) {
    console.error("Error handling payment failure:", error);
  }
}

/**
 * Get student payment summary
 */
export const getStudentPaymentSummary = async (req, res) => {
  try {
    const studentId = req.user?._id;
    
    if (!studentId) {
      return buildResponse.error(res, 'Student not found', 401);
    }

    const restrictionService = new CourseRestrictionService();
    const { session } = req.query;
    
    const summary = await restrictionService.getPaymentSummary(studentId, session);
    
    return buildResponse.success(
      res,
      'Payment summary retrieved successfully',
      summary
    );
  } catch (error) {
    console.error('Get payment summary error:', error);
    return buildResponse.error(res, 'Failed to get payment summary', 500, error);
  }
};

/**
 * Check course registration eligibility
 */
export const checkCourseEligibility = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { courseIds, session } = req.body;
    
    if (!studentId) {
      return buildResponse.error(res, 'Student not found', 401);
    }

    const restrictionService = new CourseRestrictionService();
    
    const eligibility = await restrictionService.checkCourseRegistrationEligibility(
      studentId,
      Array.isArray(courseIds) ? courseIds : [],
      session
    );
    
    return buildResponse.success(
      res,
      eligibility.eligible ? 'Eligible for course registration' : 'Not eligible for course registration',
      eligibility
    );
  } catch (error) {
    console.error('Check course eligibility error:', error);
    return buildResponse.error(res, 'Failed to check eligibility', 500, error);
  }
};

/**
 * Batch check permissions
 */
export const batchCheckPermissions = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { activities, session } = req.body;
    
    if (!studentId) {
      return buildResponse.error(res, 'Student not found', 401);
    }

    if (!Array.isArray(activities) || activities.length === 0) {
      return buildResponse.error(res, 'Please specify activities to check', 400);
    }

    const restrictionService = new CourseRestrictionService();
    const permissions = await restrictionService.batchCheckPermissions(
      studentId,
      activities,
      session
    );
    
    // Check if any permissions are denied
    const deniedPermissions = Object.entries(permissions)
      .filter(([_, perm]) => !perm.allowed && perm.restrictionLevel === 'STRICT')
      .map(([activity, perm]) => ({ activity, reason: perm.message }));
    
    return buildResponse.success(
      res,
      'Permissions checked successfully',
      { 
        permissions,
        summary: {
          total: Object.keys(permissions).length,
          allowed: Object.values(permissions).filter(p => p.allowed).length,
          denied: Object.values(permissions).filter(p => !p.allowed).length,
          deniedPermissions
        }
      }
    );
  } catch (error) {
    console.error('Batch check permissions error:', error);
    return buildResponse.error(res, 'Failed to check permissions', 500, error);
  }
};

/**
 * Check if student can register for exams
 */
export const checkExamEligibility = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { session } = req.body;
    
    if (!studentId) {
      return buildResponse.error(res, 'Student not found', 401);
    }

    const restrictionService = new CourseRestrictionService();
    const permission = await restrictionService.checkPermission(
      studentId,
      'EXAM_REGISTRATION',
      session
    );
    
    return buildResponse.success(
      res,
      permission.allowed ? 'Eligible for exam registration' : 'Not eligible for exam registration',
      permission
    );
  } catch (error) {
    console.error('Check exam eligibility error:', error);
    return buildResponse.error(res, 'Failed to check exam eligibility', 500, error);
  }
};

/**
 * Get payment restrictions for student
 */
export const getPaymentRestrictions = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { session } = req.query;
    
    if (!studentId) {
      return buildResponse.error(res, 'Student not found', 401);
    }

    const restrictionService = new CourseRestrictionService();
    const summary = await restrictionService.getPaymentSummary(studentId, session);
    
    // Extract only restrictions
    const restrictions = {
      student: summary.student,
      session: summary.session,
      restrictions: summary.restrictions,
      permissions: summary.permissions,
      totals: summary.totals
    };
    
    return buildResponse.success(
      res,
      'Payment restrictions retrieved successfully',
      restrictions
    );
  } catch (error) {
    console.error('Get payment restrictions error:', error);
    return buildResponse.error(res, 'Failed to get payment restrictions', 500, error);
  }
};

/**
 * Check specific fee payment status
 */
export const checkFeePayment = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { feeType, session } = req.body;
    
    if (!studentId) {
      return buildResponse.error(res, 'Student not found', 401);
    }

    if (!feeType) {
      return buildResponse.error(res, 'Fee type is required', 400);
    }

    const restrictionService = new CourseRestrictionService();
    const currentSession = session || await restrictionService.getCurrentAcademicSession();
    
    const hasPaid = await restrictionService.hasPaidFee(studentId, feeType, currentSession);
    
    return buildResponse.success(
      res,
      hasPaid ? 'Fee has been paid' : 'Fee has not been paid',
      {
        feeType,
        paid: hasPaid,
        session: currentSession,
        studentId,
        checkedAt: new Date()
      }
    );
  } catch (error) {
    console.error('Check fee payment error:', error);
    return buildResponse.error(res, 'Failed to check fee payment', 500, error);
  }
};
