import mongoose from "mongoose";

const attendanceRecordSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "attendanceSession",
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "student",
    required: true,
  },
  status: {
    type: String,
    enum: ["present", "absent", "late"],
    default: "absent",
  },
  check_in_time: { type: Date },
  check_in_method: {
    type: String,
    enum: ["manual", "qr_code", "biometric"],
  },
}, { timestamps: true });

attendanceRecordSchema.index({ session: 1, student: 1 }, { unique: true });

export default mongoose.model("attendanceRecord", attendanceRecordSchema);
