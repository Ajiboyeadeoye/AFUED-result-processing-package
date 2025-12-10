import mongoose from "mongoose";

const carryoverSchema = new mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Student",
    required: true 
  },
  course: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Course", 
    required: true 
  },
  semester: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Semester", 
    required: true 
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department"
  },
  result: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Result"
  },
  grade: {
    type: String,
    enum: ["F", "D", "E", null],
    default: null
  },
  score: {
    type: Number,
    min: 0,
    max: 100
  },
  reason: { 
    type: String, 
    enum: ["Failed", "NotRegistered", "Absent", "Incomplete"], 
    required: true 
  },
  isCoreCourse: {
    type: Boolean,
    default: true
  },
  cleared: {
    type: Boolean, 
    default: false
  },
  clearedAt: Date,
  clearedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User" 
  },
  remark: String,
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User" 
  },
  computationBatch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ComputationSummary"
  }
}, { timestamps: true });

carryoverSchema.index({ student: 1, course: 1, semester: 1 }, { unique: true });
carryoverSchema.index({ student: 1, cleared: 1 });
carryoverSchema.index({ department: 1, semester: 1 });
carryoverSchema.index({ computationBatch: 1 });

const CarryoverCourse = mongoose.model("CarryoverCourse", carryoverSchema);
export default CarryoverCourse;