// department.model.js
import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
        code: {
      type: String,
      required: true,
      unique: true, // ✅ Enforce uniqueness at DB level
      trim: true,
      uppercase: true, // optional: helps keep codes consistent (like "SCI", "ENG")
    },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
  hod: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // borrowed: {
  //   _id: ref: "Course",
  //   type: 
  // }
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  
},
 { timestamps: true });

export default mongoose.model("Department", departmentSchema);
