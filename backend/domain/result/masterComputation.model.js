import mongoose from "mongoose";

const masterComputationSchema = new mongoose.Schema({
  semester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AcademicSemester"
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
  departmentSummaries: {
    type: Map,
    of: new mongoose.Schema({
      studentsProcessed: Number,
      passListCount: Number,
      probationListCount: Number,
      withdrawalListCount: Number,
      terminationListCount: Number,
      carryoverCount: Number,
      averageGPA: Number,
      failedStudentsCount: Number,
      status: String,
      processed: { type: Boolean, default: false },
      isPreview: { type: Boolean, default: false },
      updatedAt: { type: Date, default: Date.now }
    }, { _id: false })
  },
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
  }],
  isFinal: {
    type: Boolean,
    default: false
  },
  purpose: {
    type: String,
    enum: ['preview', 'final', 'simulation'],
    default: 'final'
  },
  isPreview: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Add index for better query performance
masterComputationSchema.index({ semester: 1, status: 1 });
masterComputationSchema.index({ computedBy: 1 });
masterComputationSchema.index({ isPreview: 1, purpose: 1 });

const MasterComputation = mongoose.model("MasterComputation", masterComputationSchema);
export default MasterComputation;