import mongoose from "mongoose";
import Student from "../student/student.model.js"; // Adjusted import path

const resultSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    session: { type: String, required: true },
    semester: { type: String, enum: ["1", "2"], required: true },

    // 🧮 Marks Breakdown
    ca: { type: Number, min: 0, max: 40, default: 0 },      // Continuous Assessment
    exam: { type: Number, min: 0, max: 60, default: 0 },    // Exam Score
    score: { type: Number, min: 0, max: 100, required: true }, // Total (CA + Exam)
    grade: { type: String, enum: ["A", "B", "C", "D", "E", "F"] },
    gradePoint: { type: Number, default: 0 },
    remark: { type: String, default: "" },

    // ✅ Status Flags
    approved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    locked: { type: Boolean, default: false },

    // 🗑️ Soft Delete
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ⚙️ Index for faster lookups
resultSchema.index({ studentId: 1, courseId: 1, session: 1, semester: 1 }, { unique: true });

/**
 * 🧮 Pre-save: Compute grade and grade point
 */
resultSchema.pre("save", function (next) {
  const totalScore = this.ca + this.exam || this.score;
  this.score = totalScore;

  if (totalScore >= 70) { this.grade = "A"; this.gradePoint = 5; }
  else if (totalScore >= 60) { this.grade = "B"; this.gradePoint = 4; }
  else if (totalScore >= 50) { this.grade = "C"; this.gradePoint = 3; }
  else if (totalScore >= 45) { this.grade = "D"; this.gradePoint = 2; }
  else if (totalScore >= 40) { this.grade = "E"; this.gradePoint = 1; }
  else { this.grade = "F"; this.gradePoint = 0; }

  next();
});

/**
 * 📊 Post-save: Recalculate GPA/CGPA for the student
 */
resultSchema.post("save", async function () {
  try {
    const Result = mongoose.model("Result");
    const results = await Result.find({ studentId: this.studentId, deletedAt: null });

    if (!results.length) return;

    const totalUnits = results.length;
    const totalGradePoints = results.reduce((sum, r) => sum + r.gradePoint, 0);
    const gpa = (totalGradePoints / totalUnits).toFixed(2);

    await Student.findByIdAndUpdate(this.studentId, { gpa, cgpa: gpa });
  } catch (err) {
    console.error("❌ GPA recalculation error:", err.message);
  }
});

export default mongoose.model("Result", resultSchema);
