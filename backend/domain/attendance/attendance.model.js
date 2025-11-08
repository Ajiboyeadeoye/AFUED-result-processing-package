import mongoose from "mongoose";

const attendanceSessionSchema = new mongoose.Schema({
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "courseAssignment",
    required: true,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "course",
    required: true,
  },
  lecturer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "lecturer",
    required: true,
  },
  semester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "semester",
    required: true,
  },
  session_date: { type: Date, required: true },
  start_time: { type: String, required: true },
  end_time: { type: String, required: true },
  topic: { type: String },
  attendance_method: {
    type: String,
    enum: ["manual", "qr_code", "biometric"],
    default: "manual",
  },
  qr_code_token: { type: String }, // valid only for qr_code method
  is_active: { type: Boolean, default: true },
  total_students: { type: Number, default: 0 },
  present_count: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model("attendanceSession", attendanceSessionSchema);
