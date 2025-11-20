
import mongoose from "mongoose";
const courseSchema = new mongoose.Schema({
  courseCode: { type: String, unique: true, uppercase: true, trim: true },
  title: { type: String, trim: true },
  unit: { type: Number, min: 1 },
  level: { type: Number },
  semester: { type: String, enum: ["first", "second"] },
  type: { type: String, enum: ["core", "elective", "general", "faculty"], default: "compulsory" },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  description: { type: String, default: "" },
  borrowedId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
}, { timestamps: true });

export default mongoose.model("Course", courseSchema);
