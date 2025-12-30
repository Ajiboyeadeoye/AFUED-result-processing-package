import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    // Who paid
    payer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // What the payment is for
    purpose: {
      type: String,
      enum: [
        "COURSE_REGISTRATION",
        "EXAM_REGISTRATION",
        "RESULT_ACCESS",
        "SCHOOL_FEES",
        "TRANSCRIPT",
        "ADMISSION",
        "CERTIFICATE",
        "OTHER",
      ],
      required: true,
      index: true,
    },

    // Academic context (nullable, validated at schema level)
    session: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      default: null,
      index: true,
    },

    semester: {
      type: Schema.Types.ObjectId,
      ref: "Semester",
      default: null,
      index: true,
    },

    // Amount info
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
    },

    // Provider
    provider: {
      type: String,
      enum: ["REMITA", "STRIPE", "PAYSTACK", "MANUAL"],
      required: true,
      index: true,
    },

    providerPaymentId: {
      type: String,
      index: true,
    },

    // Internal transaction reference
    transactionRef: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Payment lifecycle status
    status: {
      type: String,
      enum: ["CREATED", "PENDING", "SUCCEEDED", "FAILED", "REFUNDED"],
      default: "CREATED",
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    // Flexible extra data
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

//
// 🔐 SCHEMA-LEVEL VALIDATION (SAFE & CORRECT)
//

paymentSchema.pre("validate", function (next) {
  const sessionRequiredFor = [
    "COURSE_REGISTRATION",
    "EXAM_REGISTRATION",
    "RESULT_ACCESS",
    "SCHOOL_FEES",
  ];

  const semesterRequiredFor = [
    "COURSE_REGISTRATION",
    "EXAM_REGISTRATION",
    "RESULT_ACCESS",
  ];

  if (sessionRequiredFor.includes(this.purpose) && !this.session) {
    return next(
      new Error(`Session is required for ${this.purpose} payment`)
    );
  }

  if (semesterRequiredFor.includes(this.purpose) && !this.semester) {
    return next(
      new Error(`Semester is required for ${this.purpose} payment`)
    );
  }

  next();
});

//
// 🚫 PREVENT DUPLICATE SUCCESSFUL PAYMENTS
// (Allows retries, blocks double success)
//

paymentSchema.index(
  { payer: 1, purpose: 1, session: 1, semester: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "SUCCEEDED" },
  }
);

//
// 🧠 HELPERS
//

paymentSchema.statics.generateTransactionRef = function (prefix = "AFUED") {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase()}`;
};

paymentSchema.methods.isSuccessful = function () {
  return this.status === "SUCCEEDED";
};

export default mongoose.models.Payment ||
  mongoose.model("Payment", paymentSchema);
