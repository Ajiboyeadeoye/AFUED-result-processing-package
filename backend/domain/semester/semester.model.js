// import mongoose from "mongoose";

// const semesterSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       enum: ["First Semester", "Second Semester"],
//       required: true,
//     },
//     session: {
//       type: String,
//       required: true,
//       match: /^\d{4}\/\d{4}$/, // Example: 2025/2026
//     },
//     startDate: { type: Date, default: Date.now },
//     endDate: { type: Date },
//     isActive: { type: Boolean, default: false },
//     isRegistrationOpen: { type: Boolean, default: false },
//     isResultsPublished: { type: Boolean, default: false },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   },
//   { timestamps: true }
// );

// // ✅ Ensure only one active semester exists at a time
// semesterSchema.index(
//   { isActive: 1 },
//   { unique: true, partialFilterExpression: { isActive: true } }
// );

// const Semester = mongoose.model("Semester", semesterSchema);

// export default Semester;
import mongoose from "mongoose";

const semesterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ["First Semester", "Second Semester"],
      required: true,
    },

    // Example: "2025/2026"
    session: {
      type: String,
      required: true,
      match: /^\d{4}\/\d{4}$/,
    },

    // Link to department (important for multi-department schools)
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    // Link to academic level (100, 200, 300, 400...)
    level: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Level",
      required: true,
    },

    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },

    isActive: { type: Boolean, default: false },
    isRegistrationOpen: { type: Boolean, default: false },
    isResultsPublished: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

// -----------------------------------------------
// 🔒 Ensure only ONE active semester per department
// -----------------------------------------------
semesterSchema.index(
  { department: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

// -----------------------------------------------
// 🔥 Useful Performance Indexes
// -----------------------------------------------
semesterSchema.index({ session: 1 });
semesterSchema.index({ level: 1 });
semesterSchema.index({ department: 1, session: 1 });

const Semester = mongoose.model("Semester", semesterSchema);

export default Semester;
