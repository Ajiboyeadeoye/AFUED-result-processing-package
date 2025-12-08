import mongoose from "mongoose";
import Student from "../student/student.model.js";
import Course from "../course/course.model.js"; // ensure correct path

/* ------------------------------
   ResultHistory (unchanged)
   ------------------------------ */
const resultHistorySchema = new mongoose.Schema({
  resultId: { type: mongoose.Schema.Types.ObjectId, ref: "Result", required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  when: { type: Date, default: Date.now },
  op: { type: String, enum: ["create", "update", "delete"], required: true },
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
  reason: { type: String, default: "" }
});

const ResultHistory = mongoose.model("ResultHistory", resultHistorySchema);

/* ------------------------------
   Result (corrected and aligned)
   ------------------------------ */
const resultSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },

  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },

  lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // NEW: proper reference to Semester document
  semester: { type: mongoose.Schema.Types.ObjectId, ref: "Semester", required: true },

  // Marks
  ca: { type: Number, min: 0, max: 40, default: 0 },
  exam: { type: Number, min: 0, max: 60, default: 0 },
  score: { type: Number, min: 0, max: 100, required: true },

  // Grade
  grade: { type: String, enum: ["A", "B", "C", "D", "E", "F"] },
  gradePoint: { type: Number, default: 0 },
  remark: { type: String, default: "" },

  // Approval
  approved: { type: Boolean, default: false },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  locked: { type: Boolean, default: false },

  // Soft delete
  deletedAt: { type: Date, default: null },

  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Optional denormalized course info
  courseUnit: Number,
  courseCode: String,
  courseTitle: String,
  courseDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" }
}, { timestamps: true });

/* ------------------------------
   FIXED UNIQUE INDEX
   (session removed)
   ------------------------------ */
resultSchema.index(
  { studentId: 1, courseId: 1, semester: 1 },
  { unique: true }
);

/* ------------------------------
   Pre-save logic (unchanged except session removed)
   ------------------------------ */
resultSchema.pre("save", async function (next) {
  const totalScore = (this.ca + this.exam) || this.score || 0;
  this.score = totalScore;

  const { grade, gradePoint } = computeGradeAndPoint(totalScore);
  this.grade = grade;
  this.gradePoint = gradePoint;

  // Hydrate course info if missing
  if ((!this.courseUnit || !this.courseCode || !this.courseTitle) && this.courseId) {
    try {
      const course = await Course.findById(this.courseId)
        .select("unit courseCode title department")
        .lean();

      if (course) {
        this.courseUnit = course.unit;
        this.courseCode = course.courseCode;
        this.courseTitle = course.title;
        this.courseDepartmentId = course.department;
      }
    } catch (e) {}
  }

  next();
});

/* ------------------------------
   Prevent modification if locked/approved
   (applies to findOneAndUpdate / updateOne)
   ------------------------------ */
async function denyIfLockedOrApproved(query, update) {
  // fetch current doc
  const current = await this.model.findOne(this.getQuery()).lean();
  if (!current) return;

  // if locked/approved, only allow metadata update if caller intentionally bypasses
  const tryingToChangeScores = ("ca" in update) || ("exam" in update) || ("score" in update) || ("grade" in update) || ("gradePoint" in update);
  if ((current.locked || current.approved) && tryingToChangeScores) {
    const err = new Error("Result is locked or approved and cannot be modified.");
    err.status = 403;
    throw err;
  }
}

resultSchema.pre("findOneAndUpdate", async function (next) {
  try {
    await denyIfLockedOrApproved.call(this);
    // create history entry capturing before and after (after will be saved in post)
    const before = await this.model.findOne(this.getQuery()).lean();
    this.setOptions({ __resultHistoryBefore: before || null });
    next();
  } catch (err) {
    next(err);
  }
});

resultSchema.post("findOneAndUpdate", async function (res) {
  try {
    const before = this.getOptions?.().__resultHistoryBefore || this.options?.__resultHistoryBefore || null;
    const after = await this.model.findOne(this.getQuery()).lean();
    if (before || after) {
      await ResultHistory.create({
        resultId: after?._id || before?._id,
        changedBy: this.getOptions?.().__changedBy || null,
        op: "update",
        before,
        after
      }).catch(() => {});
    }
  } catch (err) {
    // swallow history errors
    console.error("Result post-findOneAndUpdate history error:", err.message);
  }
});

/* ------------------------------
   Post-save: write history + recalc GPA
   ------------------------------ */
resultSchema.post("save", async function (doc) {
  try {
    // create history record (create or update)
    await ResultHistory.create({
      resultId: doc._id,
      changedBy: doc.createdBy || null,
      op: this.isNew ? "create" : "update",
      before: null,
      after: doc.toObject()
    }).catch(() => {});

    // Recalculate weighted GPA for student using aggregation (efficient)
    // Weighted GPA = sum(gradePoint * unit) / sum(unit)
    await this.constructor.recalcGPA(doc.studentId);
  } catch (err) {
    console.error("Result post-save error:", err.message);
  }
});

/* ------------------------------
   Soft delete/history integration
   ------------------------------ */
resultSchema.methods.softDelete = async function (deletedBy = null, reason = "") {
  this.deletedAt = new Date();
  await this.save();
  await ResultHistory.create({
    resultId: this._id,
    changedBy: deletedBy,
    op: "delete",
    before: null,
    after: this.toObject(),
    reason
  }).catch(() => {});
};

/* ------------------------------
   Static: recalcGPA(studentId)
   - uses aggregation to compute weighted GPA and updates Student.gpa & Student.cgpa
   ------------------------------ */
resultSchema.statics.recalcGPA = async function (studentId) {
  if (!studentId) return null;
  try {
    const Result = this;

    // Filter: non-deleted results for that student
    const pipeline = [
      { $match: { studentId: mongoose.Types.ObjectId(String(studentId)), deletedAt: null } },
      // Only include results that have numeric courseUnit and numeric gradePoint
      { $project: { courseUnit: { $ifNull: ["$courseUnit", 1] }, gradePoint: 1 } },
      {
        $group: {
          _id: null,
          totalUnits: { $sum: "$courseUnit" },
          weightedPoints: { $sum: { $multiply: ["$courseUnit", "$gradePoint"] } }
        }
      }
    ];

    const [agg] = await Result.aggregate(pipeline).allowDiskUse(true);
    if (!agg || !agg.totalUnits) {
      // no results
      await Student.findByIdAndUpdate(studentId, { gpa: null, cgpa: null }, { timestamps: false }).catch(() => {});
      return null;
    }

    const gpa = +(agg.weightedPoints / agg.totalUnits).toFixed(2);
    // For now set gpa and cgpa the same — replace with your school's CGPA logic if different
    await Student.findByIdAndUpdate(studentId, { gpa, cgpa: gpa }, { timestamps: false }).catch(() => {});
    return gpa;
  } catch (err) {
    console.error("Failed to recalcGPA:", err.message);
    return null;
  }
};

// Add this static method to your existing result.model.js
resultSchema.statics.recalcGPA = async function (studentId) {
  if (!studentId) return null;
  try {
    const Result = this;

    const pipeline = [
      { $match: { 
        studentId: mongoose.Types.ObjectId(String(studentId)), 
        deletedAt: null,
        approved: true 
      }},
      { $project: { 
        courseUnit: { $ifNull: ["$courseUnit", 1] }, 
        gradePoint: 1 
      }},
      {
        $group: {
          _id: null,
          totalUnits: { $sum: "$courseUnit" },
          weightedPoints: { $sum: { $multiply: ["$courseUnit", "$gradePoint"] } }
        }
      }
    ];

    const [agg] = await Result.aggregate(pipeline).allowDiskUse(true);
    
    if (!agg || !agg.totalUnits) {
      await Student.findByIdAndUpdate(studentId, { gpa: null, cgpa: null }, { timestamps: false }).catch(() => {});
      return null;
    }

    const cgpa = +(agg.weightedPoints / agg.totalUnits).toFixed(2);
    
    // Get current active semester for student
    const student = await Student.findById(studentId);
    if (!student) return null;
    
    // Find current semester's GPA
    let currentGPA = null;
    const currentSemester = await Semester.findOne({
      department: student.departmentId,
      isActive: true
    });
    
    if (currentSemester) {
      const semesterPipeline = [
        { $match: { 
          studentId: mongoose.Types.ObjectId(String(studentId)), 
          semester: currentSemester._id,
          deletedAt: null, 
          approved: true 
        }},
        { $project: { 
          courseUnit: { $ifNull: ["$courseUnit", 1] }, 
          gradePoint: 1 
        }},
        {
          $group: {
            _id: null,
            totalUnits: { $sum: "$courseUnit" },
            weightedPoints: { $sum: { $multiply: ["$courseUnit", "$gradePoint"] } }
          }
        }
      ];
      
      const [semesterAgg] = await Result.aggregate(semesterPipeline);
      if (semesterAgg && semesterAgg.totalUnits > 0) {
        currentGPA = +(semesterAgg.weightedPoints / semesterAgg.totalUnits).toFixed(2);
      }
    }

    await Student.findByIdAndUpdate(studentId, { 
      gpa: currentGPA, 
      cgpa: cgpa,
      lastGPAUpdate: new Date()
    }, { timestamps: false }).catch(() => {});
    
    return { gpa: currentGPA, cgpa };
  } catch (err) {
    console.error("Failed to recalcGPA:", err.message);
    return null;
  }
};

/* ---------- grade helper ---------- */
function computeGradeAndPoint(score) {
  if (score >= 70) return { grade: 'A', gradePoint: 5 };
  if (score >= 60) return { grade: 'B', gradePoint: 4 };
  if (score >= 50) return { grade: 'C', gradePoint: 3 };
  if (score >= 45) return { grade: 'D', gradePoint: 2 };
  if (score >= 40) return { grade: 'E', gradePoint: 1 };
  return { grade: 'F', gradePoint: 0 };
}
/* ---------------------------------- */

/* ------------------------------
   Export
   ------------------------------ */
const Result = mongoose.models.Result || mongoose.model("Result", resultSchema);
export default Result;
