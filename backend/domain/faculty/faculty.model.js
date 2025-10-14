// faculty.model.js
import mongoose from "mongoose";

const facultySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
      code: {
      type: String,
      required: true,
      unique: true, // ✅ Enforce uniqueness at DB level
      trim: true,
      uppercase: true, // optional: helps keep codes consistent (like "SCI", "ENG")
    },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
}, { timestamps: true });

export default mongoose.model("Faculty", facultySchema);
