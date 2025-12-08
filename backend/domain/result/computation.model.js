import mongoose from "mongoose";

const computationSummarySchema = new mongoose.Schema({
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true
  },
  semester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Semester",
    required: true
  },
  masterComputationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MasterComputation"
  },
  totalStudents: {
    type: Number,
    default: 0
  },
  studentsWithResults: {
    type: Number,
    default: 0
  },
  studentsProcessed: {
    type: Number,
    default: 0
  },
  averageGPA: {
    type: Number,
    default: 0
  },
  highestGPA: {
    type: Number,
    default: 0
  },
  lowestGPA: {
    type: Number,
    default: 0
  },
  gradeDistribution: {
    firstClass: { type: Number, default: 0 },
    secondClassUpper: { type: Number, default: 0 },
    secondClassLower: { type: Number, default: 0 },
    thirdClass: { type: Number, default: 0 },
    fail: { type: Number, default: 0 }
  },
  carryoverStats: {
    totalCarryovers: { type: Number, default: 0 },
    affectedStudents: { type: Number, default: 0 }
  },
  failedStudents: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student"
    },
    matricNumber: String,
    name: String,
    error: String,
    notified: {
      type: Boolean,
      default: false
    },
    notifiedAt: Date
  }],
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "completed_with_errors", "failed", "cancelled"],
    default: "pending"
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  duration: {
    type: Number
  },
  error: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: Date,
  computedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  notifications: [{
    type: {
      type: String,
      enum: ["hod", "admin", "student"]
    },
    sentAt: Date,
    recipient: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      enum: ["pending", "sent", "failed"]
    }
  }]
}, { timestamps: true });

const ComputationSummary = mongoose.model("ComputationSummary", computationSummarySchema);
export default ComputationSummary;