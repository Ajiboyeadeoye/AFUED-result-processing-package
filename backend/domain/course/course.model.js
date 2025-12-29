import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
  // BASIC INFO (only allowed when NOT borrowed)
  courseCode: { type: String, uppercase: true, trim: true },
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
    required: function () {
      return this.borrowedId === null;
    },
  },


  elective_category: {
    type: String,
    enum: ["required", "optional"],
    default: function () {
      if (this.borrowedId !== null) return undefined;
      return this.type === "elective" ? "optional" : undefined;
    },
    validate: {
      validator: function (v) {
        if (this.borrowedId !== null) return true;
        if (this.type === "core") return v === undefined;
        return true;
      },
      message: "elective_category is only applicable to elective courses.",
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
  borrowedId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },

  // VISIBILITY + SOFT DELETE
  status: { type: String, enum: ["active", "inactive"], default: "active" },

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
    // Nullify fields that shouldn't exist for borrowed courses
    this.courseCode = null;
    this.title = null;
    this.description = null;
    this.unit = null;
    // this.level = null;
    this.semester = null;
    this.faculty = null;
  }

  next();
});

// 🔑 PARTIAL INDEX for unique courseCode (ignores nulls)
courseSchema.index(
  { courseCode: 1 },
  { unique: true, partialFilterExpression: { courseCode: { $type: "string" } } }
);
// Pre-hook: populate borrowedId for level comparison
// courseSchema.pre(/^find/, function (next) {
//   const filter = this.getFilter();

//   if (filter.level !== undefined) {
//     this._levelFilter = filter.level;

//     // Remove level from query because we handle it in post-hook
//     const { level, ...rest } = filter;
//     this.setQuery(rest);
//   }

//   // Populate borrowedId only for level comparison
//   this.populate({
//     path: "borrowedId",
//     select: "level"
//   });

//   next();
// });

// // Post-hook: filter by level for normal and borrowed courses
// courseSchema.post(/^find/, function (results, next) {
//   if (!this._levelFilter) return next();

//   const level = this._levelFilter;

//   const filtered = results.filter(course => {
//     // Borrowed course → compare original level
//     if (course.borrowedId) {
//       return course.borrowedId.level === level;
//     }

//     // Normal course → compare its own level
//     return course.level === level;
//   });

//   if (this._mongooseOptions.lean) return next(null, filtered);

//   results.splice(0, results.length, ...filtered);
//   next();
// });




export default mongoose.model("Course", courseSchema);
