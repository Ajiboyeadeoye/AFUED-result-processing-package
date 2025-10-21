import mongoose from "mongoose";
import Student from "../../domain/student/student.model.js";

const resultSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    session: { type: String, required: true },
    semester: { type: String, enum: ["1", "2"], required: true },
    score: { type: Number, min: 0, max: 100, required: true },
    grade: { type: String, enum: ["A", "B", "C", "D", "E", "F"] },
    gradePoint: { type: Number, default: 0 },
    remark: { type: String, default: "" },
    approved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 🧮 Grade computation
resultSchema.pre("save", function (next) {
  const score = this.score;
  if (score >= 70) { this.grade = "A"; this.gradePoint = 5; }
  else if (score >= 60) { this.grade = "B"; this.gradePoint = 4; }
  else if (score >= 50) { this.grade = "C"; this.gradePoint = 3; }
  else if (score >= 45) { this.grade = "D"; this.gradePoint = 2; }
  else if (score >= 40) { this.grade = "E"; this.gradePoint = 1; }
  else { this.grade = "F"; this.gradePoint = 0; }
  next();
});

// 📊 Recalculate student GPA/CGPA after save or update
resultSchema.post("save", async function () {
  const results = await mongoose.model("Result").find({ studentId: this.studentId });
  if (!results.length) return;

  const totalUnits = results.length;
  const totalGradePoints = results.reduce((sum, r) => sum + r.gradePoint, 0);
  const gpa = (totalGradePoints / totalUnits).toFixed(2);

  await Student.findByIdAndUpdate(this.studentId, { gpa, cgpa: gpa });
});

export default mongoose.model("Result", resultSchema);
