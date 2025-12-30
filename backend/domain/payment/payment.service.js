// domain/payment/payment.service.js
import Payment from "./payment.model.js";
import RemitaProvider from "./providers/remita.provider.js";
// import StripeProvider from "./providers/stripe.provider.js";

const providers = {
  REMITA: new RemitaProvider(),
  // STRIPE: new StripeProvider(),
};

export class PaymentService {
  /**
   * Create a payment and initialize with provider
   */
  static async createPayment({
    student,
    purpose,
    amount,
    provider = "REMITA",
    session,
    semester,
    metadata = {},
  }) {
    if (!providers[provider]) {
      throw new Error(`Unsupported payment provider: ${provider}`);
    }

    // Create payment record
    const payment = await Payment.create({
      payer: student._id,
      purpose,
      amount,
      provider,
      session,
      semester,
      status: "CREATED",
      transactionRef: Payment.generateTransactionRef(),
      metadata,
    });

    // Initialize payment with provider
    const providerResponse = await providers[provider].initialize(
      payment,
      student
    );

    // Update payment with provider response
    payment.status = "PENDING";
    payment.providerPaymentId = providerResponse.transactionRef;
    await payment.save();

    return {
      payment,
      providerResponse,
    };
  }

  /**
   * Verify payment status (manual verification / polling)
   */
  static async verifyPayment(transactionRef) {
    const payment = await Payment.findOne({ transactionRef });

    if (!payment) {
      throw new Error("Payment not found");
    }

    const provider = providers[payment.provider];
    if (!provider) {
      throw new Error(`Provider not found: ${payment.provider}`);
    }

    const verification = await provider.verify(payment);

    if (verification.status === "SUCCEEDED") {
      payment.status = "SUCCEEDED";
      payment.paidAt = new Date();
    } else if (verification.status === "FAILED") {
      payment.status = "FAILED";
    }

    payment.metadata = {
      ...payment.metadata,
      verification: verification.raw || {},
    };

    await payment.save();

    return payment;
  }

  /**
   * Handle provider webhooks
   */
  static async handleWebhook(providerName, data) {
    const provider = providers[providerName];
    if (!provider) {
      throw new Error(`Unsupported provider webhook: ${providerName}`);
    }

    const result = await provider.handleWebhook(data);

    const payment = await Payment.findOne({
      transactionRef: result.transactionRef,
    });

    if (!payment) {
      throw new Error("Payment not found for webhook");
    }

    if (result.status === "SUCCEEDED") {
      payment.status = "SUCCEEDED";
      payment.paidAt = new Date();
    } else if (result.status === "FAILED") {
      payment.status = "FAILED";
    }

    payment.metadata = {
      ...payment.metadata,
      webhook: result.raw || {},
    };

    await payment.save();

    return payment;
  }

  /**
   * Core method for middleware
   * ✔ Universal payment verification
   */
  static async hasPaid({
    studentId,
    purpose,
    session,
    semester,
  }) {
    return Payment.exists({
      payer: studentId,
      purpose,
      session,
      semester,
      status: "SUCCEEDED",
    });
  }

  /**
   * Fetch student payments (dashboard, history)
   */
  static async getStudentPayments(studentId, filters = {}) {
    return Payment.find({
      payer: studentId,
      ...filters,
    }).sort({ createdAt: -1 });
  }
}

export default PaymentService;
