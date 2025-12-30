// domain/payment/payment.model.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

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

    session: {
      type: String,
      required: true,
      match: /^\d{4}\/\d{4}$/,
      index: true,
    },

    semester: {
      type: String,
      enum: ["first", "second", "summer"],
      index: true,
    },

    expectedAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
    },

    provider: {
      type: String,
      enum: ["REMITA", "PAYSTACK"],
      default: "REMITA",
      index: true,
    },

    transactionRef: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    providerPaymentId: {
      type: String,
      index: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SUCCESSFUL", "FAILED"],
      default: "PENDING",
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    studentLevel: {
      type: Number,
      required: true,
    },

    studentDepartment: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    errorDetails: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate successful payments
paymentSchema.index(
  { student: 1, purpose: 1, session: 1, semester: 1 },
  { 
    unique: true,
    partialFilterExpression: { status: "SUCCESSFUL" }
  }
);

// Generate transaction reference
paymentSchema.statics.generateTransactionRef = function () {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PAY-${timestamp}-${random}`;
};

// Check if payment is successful
paymentSchema.methods.isSuccessful = function () {
  return this.status === "SUCCESSFUL";
};

export default mongoose.models.Payment ||
  mongoose.model("Payment", paymentSchema);