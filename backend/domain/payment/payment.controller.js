// controllers/payment.controller.js
import PaymentService from "../domain/payment/payment.service.js";
import buildResponse from "../../utils/responseBuilder.js";

export class PaymentController {
  /**
   * Get expected payment amount
   */
  static async getExpectedAmount(req, res) {
    try {
      const student = req.user;
      const { purpose, session } = req.query;

      if (!purpose) {
        return buildResponse.error(res, "Purpose is required", 400);
      }

      const expectedAmount = await PaymentService.getExpectedAmount({
        student,
        purpose,
        session: session || student.currentSession,
      });

      return buildResponse.success(
        res,
        "Expected amount retrieved",
        expectedAmount
      );
    } catch (error) {
      console.error("Get expected amount error:", error);
      return buildResponse.error(res, error.message, 400);
    }
  }

  /**
   * Initialize payment
   */
  static async initializePayment(req, res) {
    try {
      const student = req.user;
      const { purpose, session, semester, provider = "REMITA" } = req.body;

      if (!purpose) {
        return buildResponse.error(res, "Purpose is required", 400);
      }

      const result = await PaymentService.createPayment({
        student,
        purpose,
        session: session || student.currentSession,
        semester: semester || student.currentSemester,
        provider: provider.toUpperCase(),
      });

      return buildResponse.success(
        res,
        "Payment initialized successfully",
        {
          paymentId: result.payment._id,
          transactionRef: result.payment.transactionRef,
          provider: result.payment.provider,
          expectedAmount: result.payment.expectedAmount,
          providerResponse: result.providerResponse,
        }
      );
    } catch (error) {
      console.error("Initialize payment error:", error);
      return buildResponse.error(res, error.message, 400);
    }
  }

  /**
   * Payment callback (after payment)
   */
  static async paymentCallback(req, res) {
    try {
      const { reference } = req.query;

      if (!reference) {
        return buildResponse.error(res, "Reference is required", 400);
      }

      const payment = await PaymentService.verifyPayment(reference);

      if (payment.status === "SUCCESSFUL") {
        // Redirect to success page
        return res.redirect(`/dashboard/payment/success?reference=${reference}`);
      } else if (payment.status === "FAILED") {
        // Redirect to failed page
        return res.redirect(`/dashboard/payment/failed?reference=${reference}`);
      } else {
        // Still pending
        return res.redirect(`/dashboard/payment/pending?reference=${reference}`);
      }
    } catch (error) {
      console.error("Payment callback error:", error);
      return res.redirect(`/dashboard/payment/error?message=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Check payment status
   */
  static async checkPaymentStatus(req, res) {
    try {
      const { transactionRef } = req.params;

      if (!transactionRef) {
        return buildResponse.error(res, "Transaction reference is required", 400);
      }

      const payment = await PaymentService.getPaymentByRef(transactionRef);

      if (!payment) {
        return buildResponse.error(res, "Payment not found", 404);
      }

      return buildResponse.success(
        res,
        "Payment status retrieved",
        payment
      );
    } catch (error) {
      console.error("Check payment status error:", error);
      return buildResponse.error(res, error.message, 400);
    }
  }

  /**
   * Get payment history
   */
  static async getPaymentHistory(req, res) {
    try {
      const student = req.user;
      const { purpose, status, session } = req.query;

      const filters = {};
      if (purpose) filters.purpose = purpose;
      if (status) filters.status = status;
      if (session) filters.session = session;

      const payments = await PaymentService.getStudentPayments(student._id, filters);

      return buildResponse.success(
        res,
        "Payment history retrieved",
        payments
      );
    } catch (error) {
      console.error("Get payment history error:", error);
      return buildResponse.error(res, error.message, 400);
    }
  }

  /**
   * Cancel pending payment
   */
  static async cancelPayment(req, res) {
    try {
      const { transactionRef } = req.params;

      if (!transactionRef) {
        return buildResponse.error(res, "Transaction reference is required", 400);
      }

      const payment = await PaymentService.cancelPayment(transactionRef);

      return buildResponse.success(
        res,
        "Payment cancelled successfully",
        payment
      );
    } catch (error) {
      console.error("Cancel payment error:", error);
      return buildResponse.error(res, error.message, 400);
    }
  }

  /**
   * Get available payment providers
   */
  static async getProviders(req, res) {
    try {
      const providers = PaymentService.getAvailableProviders();

      return buildResponse.success(
        res,
        "Payment providers retrieved",
        providers
      );
    } catch (error) {
      console.error("Get providers error:", error);
      return buildResponse.error(res, error.message, 400);
    }
  }

  /**
   * Handle webhook from payment providers
   */
  static async handleWebhook(req, res) {
    try {
      const { provider } = req.params;

      if (!provider) {
        return buildResponse.error(res, "Provider is required", 400);
      }

      await PaymentService.handleWebhook(provider.toUpperCase(), req.body);

      // Return success to provider (plain JSON, not using buildResponse)
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Webhook handling error:", error);
      // Still return success to provider to avoid retries
      return res.status(200).json({ success: false, error: error.message });
    }
  }

  /**
   * Verify if payment is successful (for polling)
   */
  static async verifyPayment(req, res) {
    try {
      const { transactionRef } = req.params;

      if (!transactionRef) {
        return buildResponse.error(res, "Transaction reference is required", 400);
      }

      const payment = await PaymentService.verifyPayment(transactionRef);

      return buildResponse.success(
        res,
        "Payment verification completed",
        payment
      );
    } catch (error) {
      console.error("Verify payment error:", error);
      return buildResponse.error(res, error.message, 400);
    }
  }
}

// Export individual functions for backward compatibility
export const getExpectedAmount = PaymentController.getExpectedAmount;
export const initializePayment = PaymentController.initializePayment;
export const paymentCallback = PaymentController.paymentCallback;
export const checkPaymentStatus = PaymentController.checkPaymentStatus;
export const getPaymentHistory = PaymentController.getPaymentHistory;
export const cancelPayment = PaymentController.cancelPayment;
export const getProviders = PaymentController.getProviders;
export const paymentWebhook = PaymentController.handleWebhook;
export const verifyPayment = PaymentController.verifyPayment;
export const getMyPayments = PaymentController.getPaymentHistory; // Alias for getPaymentHistory

export default PaymentController;