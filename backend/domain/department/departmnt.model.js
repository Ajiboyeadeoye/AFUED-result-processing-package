// department.model.js
import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
  hod: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
},
 { timestamps: true });

export default mongoose.model("Department", departmentSchema);
