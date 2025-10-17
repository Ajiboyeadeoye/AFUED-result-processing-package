import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
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
   
    level: {
      type: String,
      enum: ["100", "200", "300", "400", "500"],
      required: true,
    },
    session: {
      type: String,
      required: true, // e.g. "2024/2025"
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
  },
  { timestamps: true }
);

// 🧹 Auto-exclude deleted students from default queries
studentSchema.pre(/^find/, function (next) {
  this.where({ deletedAt: null });
  next();
});

export default mongoose.model("Student", studentSchema);
