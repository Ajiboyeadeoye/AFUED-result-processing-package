import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    universityName: {
      type: String,
      required: true,
      default: "Adeyemi Federal University of Education",
    },

    currentSession: {
      type: String,
      required: true,
      default: "2025/2026",
    },

    currentSemester: {
      type: String,
      enum: ["First Semester", "Second Semester"],
      required: true,
      default: "First Semester",
    },

    activeSemesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Semester",
    },

    gradingSystem: {
      A: { type: Number, default: 70 },
      B: { type: Number, default: 60 },
      C: { type: Number, default: 50 },
      D: { type: Number, default: 45 },
      E: { type: Number, default: 40 },
      F: { type: Number, default: 0 },
    },

    cgpaScale: {
      type: Number,
      default: 5.0,
    },

    registrationOpen: {
      type: Boolean,
      default: false,
    },

    resultPublicationOpen: {
      type: Boolean,
      default: false,
    },

    maxCreditUnitsPerSemester: {
      type: Number,
      default: 24,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Superuser
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
