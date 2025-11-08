import mongoose from "mongoose";

const courseAssignmentSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    lecturer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Changed to single lecturer
    semester: { type: mongoose.Schema.Types.ObjectId, ref: "Semester", required: true },
    session: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["Active", "Completed", "Cancelled"], default: "Active" },
  },
  { timestamps: true }
);

// ✅ Prevent same course from being assigned twice in same semester/session/department
courseAssignmentSchema.index(
  { course: 1, semester: 1, session: 1, department: 1 },
  { unique: true }
);

export default mongoose.model("CourseAssignment", courseAssignmentSchema);
