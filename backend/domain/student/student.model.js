import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    matricNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },

    level: {
      type: String,
      enum: ["100", "200", "300", "400", "500"],
      required: true,
    },
    session: {
      type: String,
      // required: true, // e.g. "2024/2025"
    },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    gpa: {
      type: Number,
      default: 0.0,
    },
    cgpa: {
      type: Number,
      default: 0.0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    totalCarryovers: { type: Number, default: 0 },
    lastGPAUpdate: { type: Date },
    probationStatus: {
      type: String,
      enum: ["none", "probation", "probation_lifted"],
      default: "none"
    },
    terminationStatus: {
      type: String,
      enum: ["none", "withdrawn", "terminated", "expelled"],
      default: "none"
    },
    suspension: {
      status: { type: Boolean, default: false },
      reason: {
        type: String,
        enum: ["NO_REGISTRATION", "SCHOOL_APPROVED"],
        default: null
      },
      sinceSemesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Semester",
        default: null
      }
    }

  },
  { timestamps: true }
);

// 🧹 Auto-exclude deleted students from default queries
studentSchema.pre(/^find/, function (next) {
  this.where({ deletedAt: null });
  next();
});

export default mongoose.model("Student", studentSchema);
