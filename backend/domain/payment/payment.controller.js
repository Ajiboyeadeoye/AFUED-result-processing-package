import PaymentService from "./payment.service.js";
import buildResponse from "../../utils/responseBuilder.js";

/**
 * Create a payment
 */
export const createPayment = async (req, res) => {
  try {
    const { purpose, amount, provider = "REMITA" } = req.body;

    if (!purpose || !amount) {
      return buildResponse.error(
        res,
        "purpose and amount are required",
        400
      );
    }

    const student = req.user;

    const session = req.currentSession || null;
    const semester = req.currentSemester || null;

    const { payment, providerResponse } =
      await PaymentService.createPayment({
        student,
        purpose,
        amount,
        provider,
        session,
        semester,
      });

    return buildResponse.success(res, "Payment initialized", {
      paymentId: payment._id,
      transactionRef: payment.transactionRef,
      provider,
      providerResponse,
    });
  } catch (error) {
    console.error("Create payment error:", error);
    return buildResponse.error(res, error.message, 500);
  }
};

/**
 * Verify payment manually (polling)
 */
export const verifyPayment = async (req, res) => {
  try {
    const { transactionRef } = req.params;

    if (!transactionRef) {
      return buildResponse.error(
        res,
        "transactionRef is required",
        400
      );
    }

    const payment = await PaymentService.verifyPayment(transactionRef);

    return buildResponse.success(
      res,
      "Payment verification completed",
      payment
    );
  } catch (error) {
    console.error("Verify payment error:", error);
    return buildResponse.error(res, error.message, 500);
  }
};

/**
 * Handle provider webhooks
 */
export const paymentWebhook = async (req, res) => {
  try {
    const { provider } = req.params;

    await PaymentService.handleWebhook(provider.toUpperCase(), req.body);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Payment webhook error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get logged-in student's payments
 */
export const getMyPayments = async (req, res) => {
  try {
    const studentId = req.user._id;

    const payments = await PaymentService.getStudentPayments(studentId);

    return buildResponse.success(
      res,
      "Payments retrieved successfully",
      payments
    );
  } catch (error) {
    console.error("Get my payments error:", error);
    return buildResponse.error(res, error.message, 500);
  }
};
