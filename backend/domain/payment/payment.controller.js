// backend/controllers/paymentController.js
import stripe from "../../utils/stripeClient.js";
import Payment from "./payment.model.js";
import buildResponse from "../../utils/responseBuilder.js";

/**
 * 🎯 Create a payment intent
 * --------------------------------
 * Expects:
 *  - amount (number) -> in NGN major units (₦)
 *  - feeType ('post_utme' | 'acceptance' | 'school_fees')
 *  - description (optional)
 */
export const createPaymentIntent = async (req, res) => {
  const { amount, feeType, description } = req.body;

  try {
    if (!amount || amount <= 0)
      return buildResponse(res, 400, "Invalid amount", null, true);

    const studentId = req.user?._id;
    if (!studentId)
      return buildResponse(res, 401, "Unauthorized: Student not found", null, true);

    const amountInKobo = Math.round(Number(amount) * 100);

    // Create PaymentIntent on Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInKobo,
      currency: "ngn",
      metadata: { studentId, feeType },
      description: description || `${feeType} payment`,
    });

    // Create DB record
    const payment = await Payment.create({
      student: studentId,
      amount: amountInKobo,
      currency: "ngn",
      feeType,
      description,
      providerPaymentId: paymentIntent.id,
      status: paymentIntent.status,
      metadata: paymentIntent,
    });

    return buildResponse(res, 200, "Payment initialized", {
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id,
      amount,
      feeType,
    });
  } catch (error) {
    console.error("❌ createPaymentIntent error:", error);
    return buildResponse(res, 500, "Payment initialization failed", null, true, error);
  }
};

/**
 * 🪄 Stripe webhook handler
 * --------------------------
 * Listens for events like payment_intent.succeeded or failed
 */
export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await Payment.findOneAndUpdate(
          { providerPaymentId: event.data.object.id },
          { status: "succeeded", metadata: event.data.object }
        );
        break;
      case "payment_intent.payment_failed":
        await Payment.findOneAndUpdate(
          { providerPaymentId: event.data.object.id },
          { status: "failed", metadata: event.data.object }
        );
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook handler error:", error);
    res.status(500).send("Internal error");
  }
};

/**
 * 📊 Fetch all payments (admin/staff use)
 */
export const getAllPayments = async (req, res) => {
  try {
    const { universalQueryHandler } = await import("../utils/universalQueryHandler.js");
    const result = await universalQueryHandler(Payment, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to fetch payments", null, true, error);
  }
};

/**
 * 📜 Get student’s payment history
 */
export const getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return buildResponse(res, 200, "Payment history fetched", payments);
  } catch (error) {
    return buildResponse(res, 500, "Failed to get payments", null, true, error);
  }
};
