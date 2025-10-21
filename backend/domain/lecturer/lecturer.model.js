import mongoose from "mongoose";

const lecturerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    staffId: { type: String, required: true, unique: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
    specialization: { type: String },
    rank: { type: String, enum: ["Assistant Lecturer", "Lecturer II", "Lecturer I", "Senior Lecturer", "Associate Professor", "Professor"], default: "Lecturer II" },
    isHOD: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Lecturer", lecturerSchema);
