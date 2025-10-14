// HoD assignment target

// lecturer.model.js
import mongoose from "mongoose";

const lecturerSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  staffId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  role: { type: String, enum: ["lecturer", "hod"], default: "lecturer" }
}, { timestamps: true });

export default mongoose.model("Lecturer", lecturerSchema);
