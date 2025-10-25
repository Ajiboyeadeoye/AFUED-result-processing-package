import mongoose from "mongoose";

const courseRegistrationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true }],
    semester: { type: mongoose.Schema.Types.ObjectId, ref: "Semester", required: true },
    session: { type: String, required: true },
    level: { type: Number, required: true },
    totalUnits: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ✅ Prevent a student from registering twice for same semester/session
courseRegistrationSchema.index(
  { student: 1, semester: 1, session: 1 },
  { unique: true }
);

export default mongoose.model("CourseRegistration", courseRegistrationSchema);
