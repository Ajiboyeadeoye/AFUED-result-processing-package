import mongoose from "mongoose";

const semesterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ["First Semester", "Second Semester"],
      required: true,
    },
    session: {
      type: String,
      required: true,
      match: /^\d{4}\/\d{4}$/, // Example: 2025/2026
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    isActive: { type: Boolean, default: false },
    isRegistrationOpen: { type: Boolean, default: false },
    isResultsPublished: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// ✅ Ensure only one active semester exists at a time
semesterSchema.index(
  { isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

const Semester = mongoose.model("Semester", semesterSchema);

export default Semester;
