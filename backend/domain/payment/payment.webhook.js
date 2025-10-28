// modules/payment/payment.webhook.js
import crypto from "crypto";
import { Payment } from "./payment.model.js";
import  Applicant  from "../applicant/applicant.model.js"; 
import buildResponse from "../../utils/responseBuilder.js"; // your helper

/**
 * Handle Paystack webhook notifications
 */
export const handlePaystackWebhook = async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    // 🔒 Verify Paystack signature
    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.warn("❌ Invalid Paystack signature detected");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const reference = event.data.reference;
      const amount = event.data.amount / 100; // convert kobo to naira

      const payment = await Payment.findOne({ reference });
      if (!payment) {
        console.warn("⚠️ Webhook for unknown reference:", reference);
        return res.status(404).send("Payment record not found");
      }

      if (payment.status === "successful") {
        // already processed
        return res.status(200).send("Already processed");
      }

      payment.status = "successful";
      payment.amount = amount;
      payment.paidAt = new Date();
      await payment.save();

      // mark applicant as paid
      await Applicant.findByIdAndUpdate(payment.applicantId, {
        hasPaidPostJamb: true,
      });

      console.log(`✅ Payment confirmed for reference: ${reference}`);
      return res.status(200).send("Webhook processed successfully");
    }

    return res.status(200).send("Event ignored");
  } catch (err) {
    console.error("❌ Paystack Webhook Error:", err);
    return buildResponse(res, 500, "Webhook processing failed", null, true, err);
  }
};
