import mongoose from "mongoose";

/**
 * 🎯 Admission Settings
 * ----------------------
 * Stores the current Post-JAMB cutoff mark and related metadata.
 */
const admissionSettingsSchema = new mongoose.Schema(
  {
    cutoffMark: { type: Number, required: true, default: 180 },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("AdmissionSettings", admissionSettingsSchema);
