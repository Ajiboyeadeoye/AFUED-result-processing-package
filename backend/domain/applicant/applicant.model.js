import mongoose from "mongoose";

/**
 * 🧾 Applicant Schema
 * -------------------
 * Stores Post-JAMB applicants before admission.
 */
const applicantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jambRegNumber: { type: String, required: true, unique: true },
    score: { type: Number, default: null },
    programChoice: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    admissionStatus: {
      type: String,
      enum: ["pending", "admitted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Applicant", applicantSchema);
