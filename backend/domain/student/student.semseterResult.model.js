import mongoose from "mongoose";

const studentSemesterResultSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    semesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Semester",
      required: true,
    },

    // All courses taken this semester + scores + grades
    courses: [
      {
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
          required: true,
        },
        courseUnit: { type: Number, required: true },
        score: { type: Number, required: true },
        grade: { type: String, required: true },      // A/B/C/D/F
        gradePoint: { type: Number, required: true }, // 5/4/3/2/0
        isCoreCourse: { type: Boolean, default: false },
        isCarryover: { type: Boolean, default: false },
      }
    ],

    // Computed values
    gpa: {
      type: Number,
      default: 0.0,
    },

    cgpa: {
      type: Number,
      default: 0.0,
    },

    totalUnits: {
      type: Number,
      default: 0,
    },

    totalPoints: {
      type: Number,
      default: 0,
    },

    carryoverCount: {
      type: Number,
      default: 0,
    },

    // Academic standing output for frontend
    remark: {
      type: String,
      enum: ["good", "probation", "withdrawn", "terminated", "excellent"],
      default: "good",
    },

    status: {
      type: String,
      enum: ["pending", "processed", "failed"],
      default: "processed",
    },

    // traceability
    computedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    computationSummaryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ComputationSummary",
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted results
studentSemesterResultSchema.pre(/^find/, function (next) {
  this.where({ deletedAt: null });
  next();
});

export default mongoose.model("StudentSemesterResult", studentSemesterResultSchema);
