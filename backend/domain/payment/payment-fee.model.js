// domain/payment/payment-fee.model.js
import mongoose from "mongoose";

const paymentFeeSchema = new mongoose.Schema({
  purpose: {
    type: String,
    enum: [
      "COURSE_REGISTRATION",
      "EXAM_REGISTRATION",
      "SCHOOL_FEES",
      "TRANSCRIPT",
      "ADMISSION",
      "OTHER",
    ],
    required: true,
    index: true,
  },

  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true,
    index: true,
  },

  level: {
    type: Number,
    required: true,
    min: 100,
    max: 500,
    index: true,
  },

  session: {
    type: String,
    required: true,
    match: /^\d{4}\/\d{4}$/, // Matches "2023/2024" format
    index: true,
  },

  amount: {
    type: Number,
    required: true,
    min: 0,
  },

  currency: {
    type: String,
    default: "NGN",
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },

  description: String,

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
}, {
  timestamps: true,
});

// Ensure unique fee per combination
paymentFeeSchema.index(
  { purpose: 1, department: 1, level: 1, session: 1 },
  { unique: true }
);

const PaymentFee = mongoose.model("PaymentFee", paymentFeeSchema);
export default PaymentFee;