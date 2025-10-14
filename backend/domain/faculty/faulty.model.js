// faculty.model.js
import mongoose from "mongoose";

const facultySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
}, { timestamps: true });

export default mongoose.model("Faculty", facultySchema);
