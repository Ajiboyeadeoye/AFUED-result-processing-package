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
    attamptNumber: {type: Number, dafault: 1},
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    carryOverId: {type: mongoose.Schema.Types.ObjectId, ref: "CarryoverCourse", default: null},  // This would be linked to a carryover document in case they are carrying the coursse over

    // Details in case it was registered or re-registerd by an hod
    notes: {type: String, default: null},
    registeredByHod: {type: mongoose.Schema.Types.ObjectId, ref: "User", default: null},
      department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: true,
      },
    
  },
  { timestamps: true }
);

// ✅ Prevent a student from registering twice for same semester/session
courseRegistrationSchema.index(
  { student: 1, semester: 1, session: 1 },
  { unique: true }
);

export default mongoose.model("CourseRegistration", courseRegistrationSchema);
