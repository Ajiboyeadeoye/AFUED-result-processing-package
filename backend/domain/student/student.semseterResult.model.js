// import mongoose from "mongoose";

// const studentSemesterResultSchema = new mongoose.Schema(
//   {
//     studentId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Student",
//       required: true,
//     },

//     departmentId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Department",
//       required: true,
//     },

//     semesterId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Semester",
//       required: true,
//     },

//     // All courses taken this semester + scores + grades
//     courses: [
//       {
//         courseId: {
//           type: mongoose.Schema.Types.ObjectId,
//           ref: "Course",
//           required: true,
//         },
//         courseUnit: { type: Number, required: true },
//         score: { type: Number, required: true },
//         grade: { type: String, required: true },      // A/B/C/D/F
//         gradePoint: { type: Number, required: true }, // 5/4/3/2/0
//         isCoreCourse: { type: Boolean, default: false },
//         isCarryover: { type: Boolean, default: false },
//       }
//     ],

//     // Computed values
//     gpa: {
//       type: Number,
//       default: 0.0,
//     },

//     cgpa: {
//       type: Number,
//       default: 0.0,
//     },

//     totalUnits: {
//       type: Number,
//       default: 0,
//     },

//     totalPoints: {
//       type: Number,
//       default: 0,
//     },

//     carryoverCount: {
//       type: Number,
//       default: 0,
//     },

//     // Academic standing output for frontend
//     remark: {
//       type: String,
//       enum: ["good", "probation", "withdrawn", "terminated", "excellent"],
//       default: "good",
//     },

//     status: {
//       type: String,
//       enum: ["pending", "processed", "failed"],
//       default: "processed",
//     },

//     // traceability
//     computedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       default: null,
//     },

//     computationSummaryId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "ComputationSummary",
//       default: null,
//     },

//     deletedAt: {
//       type: Date,
//       default: null,
//     },
//   },
//   { timestamps: true }
// );

// // Auto-exclude soft-deleted results
// studentSemesterResultSchema.pre(/^find/, function (next) {
//   this.where({ deletedAt: null });
//   next();
// });

// export default mongoose.model("StudentSemesterResult", studentSemesterResultSchema);
// student.semesterResult.model.js
import mongoose from "mongoose";

const studentSemesterResultSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true
  },
  semesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Semester",
    required: true
  },
  
  // Academic year and level context
  session: {
    type: String,
    required: true
  },
  level: {
    type: String,
    required: true,
    enum: ["100", "200", "300", "400", "500"]
  },
  
  // Course results
  courses: [{
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
    courseCode: String,
    courseTitle: String,
    courseUnit: Number,
    score: Number,
    grade: String,
    gradePoint: Number,
    creditPoint: Number,
    isCoreCourse: { type: Boolean, default: false },
    isCarryover: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["passed", "failed", "outstanding"],
      default: "passed"
    }
  }],
  
  // Semester performance
  gpa: {
    type: Number,
    default: 0
  },
  cgpa: {
    type: Number,
    default: 0
  },
  totalUnits: {
    type: Number,
    default: 0
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  
  // Previous semester cumulative data
  previousCumulativeTCP: { type: Number, default: 0 },
  previousCumulativeTNU: { type: Number, default: 0 },
  previousCGPA: { type: Number, default: 0 },
  
  // Current semester data (TCP = Total Credit Points, TNU = Total Number of Units)
  currentTCP: { type: Number, default: 0 },
  currentTNU: { type: Number, default: 0 },
  
  // Cumulative data (including current)
  cumulativeTCP: { type: Number, default: 0 },
  cumulativeTNU: { type: Number, default: 0 },
  
  // Academic standing
  carryoverCount: {
    type: Number,
    default: 0
  },
  remark: {
    type: String,
    enum: ["excellent", "good", "probation", "withdrawn", "terminated"],
    default: "good"
  },
  status: {
    type: String,
    enum: ["draft", "processed", "approved", "published", "archived"],
    default: "processed"
  },
  
  // Audit trail
  computedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  computationSummaryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ComputationSummary"
  },
  
  // For MMS2 tracking
  academicHistory: [{
    session: String,
    semester: String,
    level: String,
    tcp: Number,
    tnu: Number,
    gpa: Number,
    cgpa: Number
  }],
  
  isPreview: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

// Indexes for efficient querying
studentSemesterResultSchema.index({ studentId: 1, semesterId: 1 }, { unique: true });
studentSemesterResultSchema.index({ departmentId: 1, semesterId: 1 });
studentSemesterResultSchema.index({ session: 1, level: 1 });
studentSemesterResultSchema.index({ computationSummaryId: 1 });

const studentSemesterResultModel = mongoose.model("StudentSemesterResult", studentSemesterResultSchema);
export default studentSemesterResultModel;