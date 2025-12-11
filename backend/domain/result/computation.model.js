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

  totalStudents: { type: Number, default: 0 },
  studentsWithResults: { type: Number, default: 0 },
  studentsProcessed: { type: Number, default: 0 },

  averageGPA: { type: Number, default: 0 },
  highestGPA: { type: Number, default: 0 },
  lowestGPA: { type: Number, default: 0 },

  gradeDistribution: {
    firstClass: { type: Number, default: 0 },
    secondClassUpper: { type: Number, default: 0 },
    secondClassLower: { type: Number, default: 0 },
    thirdClass: { type: Number, default: 0 },
    fail: { type: Number, default: 0 }
  },

  // Existing: Outstanding Courses / Carryover
  carryoverStats: {
    totalCarryovers: { type: Number, default: 0 },
    affectedStudentsCount: { type: Number, default: 0 },
    affectedStudents: [{
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
      matricNumber: String,
      name: String,
      courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
      notes: String
    }]
  },

  // Existing: Failed Students
  failedStudents: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    matricNumber: String,
    name: String,
    error: String,
    notified: { type: Boolean, default: false },
    notifiedAt: Date
  }],

  // NEW: Pass List
  passList: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    matricNumber: String,
    name: String,
    gpa: Number
  }],

  // NEW: Probation List
  probationList: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    matricNumber: String,
    name: String,
    gpa: Number,
    remarks: String
  }],

  // NEW: Withdrawal List
  withdrawalList: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    matricNumber: String,
    name: String,
    reason: String,
    remarks: String
  }],

  // NEW: Termination List
  terminationList: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    matricNumber: String,
    name: String,
    reason: String,
    remarks: String
  }],

  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "completed",
      "completed_with_errors",
      "failed",
      "cancelled"
    ],
    default: "pending"
  },

  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  duration: { type: Number },

  error: { type: String },
  retryCount: { type: Number, default: 0 },
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
  }],
  recommendations: [{
    priority: { type: String },
    title: { type: String },
    description: { type: String },
    action: { type: String },

  }]
}, { timestamps: true });

const ComputationSummary = mongoose.model("ComputationSummary", computationSummarySchema);
export default ComputationSummary;
