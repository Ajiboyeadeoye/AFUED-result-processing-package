import mongoose from "mongoose";

const carryoverSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  semester: { type: mongoose.Schema.Types.ObjectId, ref: "Semester", required: true },
  reason: { type: String, enum: ["Failed", "NotRegistered"], required: true },
  cleared: {type: Boolean, default: false},
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional: admin or system
}, { timestamps: true });

carryoverSchema.index({ student: 1, course: 1, semester: 1 }, { unique: true });

export default mongoose.model("CarryoverCourse", carryoverSchema);
