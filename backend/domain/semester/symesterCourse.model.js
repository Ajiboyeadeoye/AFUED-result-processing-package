import mongoose from "mongoose";

const semesterCourseSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    semesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Semester",
      required: true,
    },
    department: {
      type: String,
      required: true,
    },
    level: {
      type: Number,
      required: true,
    },
    assignedLecturers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Lecturer accounts
      },
    ],
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Prevent duplicate semester-course entries
semesterCourseSchema.index(
  { courseId: 1, semesterId: 1, level: 1 },
  { unique: true }
);

const SemesterCourse = mongoose.model("SemesterCourse", semesterCourseSchema);

export default SemesterCourse;
