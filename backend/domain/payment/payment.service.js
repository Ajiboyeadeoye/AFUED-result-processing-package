// domain/payment/payment.service.js
import Payment from "./payment.model.js";
import PaymentFee from "./payment-fee.model.js";
import RemitaProvider from "./providers/remita.provider.js";
import PaystackProvider from "./providers/paystack.provider.js";

const providers = {
  REMITA: new RemitaProvider(),
  PAYSTACK: new PaystackProvider(),
};

export class PaymentService {
  /**
   * Get available payment providers
   */
  static getAvailableProviders() {
    return Object.keys(providers).map(providerKey => ({
      code: providerKey,
      name: providerKey === 'PAYSTACK' ? 'Paystack' : 'Remita',
      isActive: true,
    }));
  }

  /**
   * Get expected payment amount for a student
   */
  static async getExpectedAmount({ student, purpose, session }) {
    const { level, department } = student;
    
    const feeStructure = await PaymentFee.findOne({
      purpose,
      department: department._id,
      level,
      session,
      isActive: true,
    });

    if (!feeStructure) {
      throw new Error(`No fee structure found for ${purpose} - Level ${level} - ${session}`);
    }

    return {
      amount: feeStructure.amount,
      currency: feeStructure.currency,
      description: feeStructure.description,
      feeStructure,
    };
  }

  /**
   * Create and initialize payment
   */
  static async createPayment({ student, purpose, session, semester, provider = "REMITA" }) {
    try {
      // Get expected amount
      const expectedAmount = await this.getExpectedAmount({
        student,
        purpose,
        session,
      });

      // Check for existing successful payment
      const existingPayment = await Payment.findOne({
        student: student._id,
        purpose,
        session,
        semester,
        status: "SUCCESSFUL",
      });

      if (existingPayment) {
        throw new Error(`You have already paid for ${purpose} in ${session} ${semester}`);
      }

      // Create payment record
      const payment = await Payment.create({
        student: student._id,
        purpose,
        session,
        semester,
        expectedAmount: expectedAmount.amount,
        paidAmount: 0, // Will be updated after payment
        currency: expectedAmount.currency,
        provider,
        status: "PENDING",
        transactionRef: Payment.generateTransactionRef(),
        studentLevel: student.level,
        studentDepartment: student.department._id,
      });

      // Initialize with provider
      const providerInstance = providers[provider];
      if (!providerInstance) {
        throw new Error(`Unsupported payment provider: ${provider}`);
      }

      const providerResponse = await providerInstance.initialize({
        payment,
        student,
        amount: expectedAmount.amount,
      });

      // Update payment with provider info
      payment.providerPaymentId = providerResponse.providerPaymentId;
      await payment.save();

      return {
        payment,
        providerResponse,
      };
    } catch (error) {
      console.error("Payment creation error:", error);
      throw error;
    }
  }

  /**
   * Verify payment (called after payment callback)
   */
  static async verifyPayment(transactionRef) {
    try {
      const payment = await Payment.findOne({ transactionRef })
        .populate("student")
        .populate("studentDepartment");

      if (!payment) {
        throw new Error("Payment not found");
      }

      const provider = providers[payment.provider];
      const verification = await provider.verify(payment);

      // Update payment based on provider response
      if (verification.status === "SUCCESSFUL") {
        payment.status = "SUCCESSFUL";
        payment.paidAmount = verification.amount || payment.expectedAmount;
        payment.paidAt = new Date();
        payment.isVerified = true;
        payment.verifiedAt = new Date();
      } else if (verification.status === "FAILED") {
        payment.status = "FAILED";
        payment.errorDetails = verification.errorDetails;
      } else {
        payment.status = "PENDING";
      }

      await payment.save();
      return payment;
    } catch (error) {
      console.error("Payment verification error:", error);
      throw error;
    }
  }

  /**
   * Handle provider webhooks
   */
  static async handleWebhook(providerName, webhookData) {
    try {
      const provider = providers[providerName];
      if (!provider) {
        throw new Error(`Unsupported provider: ${providerName}`);
      }

      const result = await provider.handleWebhook(webhookData);

      // Find payment by reference
      const payment = await Payment.findOne({
        $or: [
          { transactionRef: result.transactionRef },
          { providerPaymentId: result.providerPaymentId },
        ],
      });

      if (!payment) {
        throw new Error("Payment not found for webhook");
      }

      // Update payment status
      if (result.status === "SUCCESSFUL") {
        payment.status = "SUCCESSFUL";
        payment.paidAmount = result.amount || payment.expectedAmount;
        payment.paidAt = new Date();
        payment.isVerified = true;
        payment.verifiedAt = new Date();
      } else if (result.status === "FAILED") {
        payment.status = "FAILED";
      }

      await payment.save();
      return payment;
    } catch (error) {
      console.error("Webhook handling error:", error);
      throw error;
    }
  }

  /**
   * Check if student has paid (used by middleware)
   */
  static async hasPaid({ studentId, purpose, session, semester }) {
    const payment = await Payment.findOne({
      student: studentId,
      purpose,
      session,
      semester,
      status: "SUCCESSFUL",
    });

    return !!payment;
  }

  /**
   * Get student payment history
   */
  static async getStudentPayments(studentId, filters = {}) {
    return Payment.find({
      student: studentId,
      ...filters,
    })
      .populate("studentDepartment")
      .sort({ createdAt: -1 });
  }

  /**
   * Get payment by transaction reference
   */
  static async getPaymentByRef(transactionRef) {
    return Payment.findOne({ transactionRef })
      .populate("student")
      .populate("studentDepartment");
  }

  /**
   * Cancel/abandon a pending payment
   */
  static async cancelPayment(transactionRef) {
    const payment = await Payment.findOne({ transactionRef, status: "PENDING" });
    
    if (!payment) {
      throw new Error("Pending payment not found");
    }

    payment.status = "FAILED";
    payment.errorDetails = { message: "Payment cancelled by user" };
    await payment.save();

    return payment;
  }
}

export default PaymentService;