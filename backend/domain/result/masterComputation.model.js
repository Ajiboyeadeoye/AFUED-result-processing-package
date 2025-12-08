import mongoose from "mongoose";

const masterComputationSchema = new mongoose.Schema({
  semester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Semester"
  },
  totalDepartments: {
    type: Number,
    default: 0
  },
  departmentsProcessed: {
    type: Number,
    default: 0
  },
  totalStudents: {
    type: Number,
    default: 0
  },
  overallAverageGPA: {
    type: Number,
    default: 0
  },
  totalCarryovers: {
    type: Number,
    default: 0
  },
  totalFailedStudents: {
    type: Number,
    default: 0
  },
  departmentsLocked: {
    type: Number,
    default: 0
  },
  departmentSummaries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "ComputationSummary"
  }],
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "completed_with_errors", "failed", "cancelled", "locked"],
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
  computedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  semesterLocked: {
    type: Boolean,
    default: false
  },
  semesterLockedAt: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  notifications: [{
    type: {
      type: String,
      enum: ["admin", "hod", "all"]
    },
    sentAt: Date,
    recipient: mongoose.Schema.Types.ObjectId,
    status: String
  }]
}, { timestamps: true });

const MasterComputation = mongoose.model("MasterComputation", masterComputationSchema);
export default MasterComputation;