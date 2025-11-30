import mongoose from "mongoose";

const academicSemesterSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ["first", "second", "summer"],
    required: true,
  },
  session: {
    type: String,
    required: true,
    match: /^\d{4}\/\d{4}$/,
  },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
isRegistrationOpen: { type: Boolean, default: false },
  isResultsPublished: { type: Boolean, default: false },
  isActive: { type: Boolean, default: false },
}, { timestamps: true });

// Only one active semester across the entire school
academicSemesterSchema.index(
  { isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export const AcademicSemester = mongoose.model("AcademicSemester", academicSemesterSchema);
