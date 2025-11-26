import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
  // BASIC INFO (only allowed when NOT borrowed)
  courseCode: { type: String, unique: true, uppercase: true, trim: true },
  title: { type: String, trim: true },
  description: { type: String, default: "" },

  // ACADEMIC FIELDS (only allowed when NOT borrowed)
  unit: { type: Number, min: 1 },
  level: { type: Number },
  semester: { type: String, enum: ["first", "second"] },

  // COURSE TYPE (always allowed)
  type: {
    type: String,
    enum: ["core", "elective"],
    required: true,
  },

  // ELECTIVE SUBCATEGORY
  elective_category: {
    type: String,
    enum: ["required", "optional", null],
    default: null,
    validate: {
      validator: function (v) {
        if (this.type === "core") return v === null;
        if (this.type === "elective") return ["required", "optional"].includes(v);
        return true;
      },
      message: props => `${props.value} is not valid for elective_category.`,
    },
  },

  // SCOPE (always allowed)
  scope: {
    type: String,
    enum: ["department", "faculty", "general"],
    default: "department",
    required: true,
  },

  // FACULTY (only required when scope = faculty)
  faculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Faculty",
    default: null,
    validate: {
      validator: function (v) {
        if (this.scope === "faculty") return v !== null;
        return true;
      },
      message: "faculty field is required when scope is set to 'faculty'.",
    },
  },

  // Every course belongs to some department
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true,
  },

  // BORROWED SYSTEM
  // is_borrowed: { type: Boolean, default: false },
  borrowedId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },

  // VISIBILITY + SOFT DELETE
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  // is_visible_for_registration: { type: Boolean, default: true },

  // REPLACEMENT COURSE (in case a course is retired)
  replacement_course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    default: null,
  },

  // ✅ Prerequisites: courses that must be passed before taking this course
  prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },


  lecture_hours: { type: Number, default: 0 },
  practical_hours: { type: Number, default: 0 },

}, { timestamps: true });


// 🔥 CUSTOM VALIDATION FOR BORROWED COURSES
courseSchema.pre("validate", function (next) {
  const isBorrowed = this.borrowedId !== null;

  if (isBorrowed) {
    this.is_borrowed = true;

    // All these must be null for borrowed courses
    this.courseCode = null;
    this.title = null;
    this.description = null;
    this.unit = null;
    this.level = null;
    this.semester = null;
    this.faculty = null; // faculty comes from original course
  }

  next();
});


export default mongoose.model("Course", courseSchema);
