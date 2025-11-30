import mongoose from "mongoose";

const levelSettingsSchema = new mongoose.Schema({
  level: { type: Number, required: true }, // 100, 200, 300, 400
  minUnits: { type: Number, default: 12 },
  maxUnits: { type: Number, default: 24 },
  minCourses: { type: Number, default: 4 },
  maxCourses: { type: Number, default: 6 },
});

const semesterSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ["first", "second", "summer"],
    required: true,
  },
  session: {
    type: String,
    required: true,
    match: /^\d{4}\/\d{4}$/,
  },
  academicSemester: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "AcademicSemester",
  required: true,
},
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  levelSettings: [levelSettingsSchema], // per level min/max units & courses
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  isActive: { type: Boolean, default: false },
  isRegistrationOpen: { type: Boolean, default: false },
  isResultsPublished: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // usually super admin
  registrationDeadline: { type: Date},
  lateRegistrationDate: {type: Date}
}, { timestamps: true });

// Only one active semester per department
semesterSchema.index({ department: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const Semester = mongoose.model("Semester", semesterSchema);
export default Semester;
