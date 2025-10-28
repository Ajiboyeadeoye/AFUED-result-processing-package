// backend/models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    payer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // user with role 'applicant' or 'student'
    amount: { type: Number, required: true },
    currency: { type: String, default: "ngn" },
    feeType: {
      type: String,
      enum: ["post_utme", "acceptance", "school_fees", "other"],
      default: "other",
    },
    description: String,
    status: {
      type: String,
      enum: ["created", "requires_action", "succeeded", "failed", "pending"],
      default: "created",
    },
    provider: { type: String, default: "stripe" },
    providerPaymentId: String,
    metadata: Object,
  },
  { timestamps: true }
);

export default mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
