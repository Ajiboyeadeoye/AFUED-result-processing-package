import mongoose from "mongoose";
// 🔥 IMPORTANT: Clear cached model to force schema refresh
delete mongoose.connection.models['ComputationSummary'];
delete mongoose.models['ComputationSummary'];
// Define a subdocument schema
const courseKeySchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course"
  },
  courseCode: String,
  title: String,
  unit: Number,
  level: Number,
  type: String,
  isCoreCourse: Boolean,
  isBorrowed: Boolean
}, { _id: false });  // No _id for subdocuments
const computationSummarySchema = new mongoose.Schema({
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true
  },


// Then use it in your main schema
keyToCoursesByLevel: {
  type: Map,
  of: [courseKeySchema],  // Use the subdocument schema
  default: new Map()
},
  semester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Semester",
    required: true
  },

  // Master computation reference
  masterComputationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MasterComputation"
  },

  // Student performance summaries organized by level
  studentSummariesByLevel: {
    type: Map,
    of: [{
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
      matricNumber: String,
      name: String,
      level: String,

      // Current semester performance
      currentSemester: {
        tcp: { type: Number, default: 0 },
        tnu: { type: Number, default: 0 },
        gpa: { type: Number, default: 0 }
      },

      // Previous performance
      previousPerformance: {
        cumulativeTCP: { type: Number, default: 0 },
        cumulativeTNU: { type: Number, default: 0 },
        cumulativeGPA: { type: Number, default: 0 },
        previousSemesterGPA: { type: Number, default: 0 }
      },

      // Cumulative performance
      cumulativePerformance: {
        totalTCP: { type: Number, default: 0 },
        totalTNU: { type: Number, default: 0 },
        cgpa: { type: Number, default: 0 }
      },

      // Course results
      courseResults: [{
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
        courseCode: String,
        courseTitle: String,
        unitLoad: Number,
        score: Number,
        grade: String,
        gradePoint: Number,
        creditPoint: Number,
        status: {
          type: String,
          enum: ["passed", "failed", "outstanding"],
          default: "passed"
        }
      }],

      // Outstanding courses
      outstandingCourses: [{
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
        courseCode: String,
        courseTitle: String,
        unitLoad: Number,
        fromSemester: String,
        attempts: { type: Number, default: 1 }
      }],

      // Academic status
      academicStatus: {
        type: String,
        enum: ["good", "probation", "withdrawal", "terminated"],
        default: "good"
      }
    }],
    default: new Map()
  },

  // Overall department statistics
  totalStudents: { type: Number, default: 0 },
  studentsWithResults: { type: Number, default: 0 },
  studentsProcessed: { type: Number, default: 0 },

  averageGPA: { type: Number, default: 0 },
  highestGPA: { type: Number, default: 0 },
  lowestGPA: { type: Number, default: 0 },

  // Overall grade distribution
  gradeDistribution: {
    firstClass: { type: Number, default: 0 },
    secondClassUpper: { type: Number, default: 0 },
    secondClassLower: { type: Number, default: 0 },
    thirdClass: { type: Number, default: 0 },
    fail: { type: Number, default: 0 }
  },

  // Summary of results by level
  summaryOfResultsByLevel: {
    type: Map,
    of: {
      totalStudents: { type: Number, default: 0 },
      studentsWithResults: { type: Number, default: 0 },

      gpaStatistics: {
        average: { type: Number, default: 0 },
        highest: { type: Number, default: 0 },
        lowest: { type: Number, default: 0 }
      },

      classDistribution: {
        firstClass: { type: Number, default: 0 },
        secondClassUpper: { type: Number, default: 0 },
        secondClassLower: { type: Number, default: 0 },
        thirdClass: { type: Number, default: 0 },
        pass: { type: Number, default: 0 },
        fail: { type: Number, default: 0 }
      }
    },
    default: new Map()
  },

  // Student lists by level
  studentListsByLevel: {
    type: Map,
    of: {
      passList: [{
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
        matricNumber: String,
        name: String,
        gpa: Number
      }],
      probationList: [{
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
        matricNumber: String,
        name: String,
        gpa: Number,
        remarks: String
      }],
      withdrawalList: [{
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
        matricNumber: String,
        name: String,
        reason: String,
        remarks: String
      }],
      terminationList: [{
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
        matricNumber: String,
        name: String,
        reason: String,
        remarks: String
      }]
    },
    default: new Map()
  },

  // Status tracking
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "completed",
      "completed_with_errors",
      "failed",
      "cancelled"
    ],
    default: "pending"
  },

  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  duration: { type: Number },

  error: { type: String },
  retryCount: { type: Number, default: 0 },
  lastRetryAt: Date,

  computedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  // Preview/final tracking
  isFinal: {
    type: Boolean,
    default: false
  },

  isPreview: {
    type: Boolean,
    default: false
  },

  purpose: {
    type: String,
    enum: ["final", "preview", "simulation"],
    default: "final"
  },

  // Master sheet data
  masterSheetDataByLevel: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },

  masterSheetGenerated: {
    type: Boolean,
    default: false
  },

  masterSheetGeneratedAt: Date
}, { timestamps: true });

// Indexes for performance
computationSummarySchema.index({ department: 1, semester: 1 });
computationSummarySchema.index({ masterComputationId: 1 });
computationSummarySchema.index({ isPreview: 1, purpose: 1 });
computationSummarySchema.index({ status: 1 });
computationSummarySchema.post('save', function (doc) {
  console.log('💾 Document saved:');
  console.log('  ID:', doc._id);
  console.log('  studentListsByLevel type:', typeof doc.studentListsByLevel);

  if (doc.studentListsByLevel instanceof Map) {
    console.log('  Is Map: YES');
    for (const [level, lists] of doc.studentListsByLevel.entries()) {
      console.log(`  Level ${level}:`);
      console.log(`    Pass list: ${lists?.passList?.length || 0} items`);
      console.log(`    Termination list: ${lists?.terminationList?.length || 0} items`);
    }
  } else {
    console.log('  Is Map: NO, type:', doc.studentListsByLevel?.constructor?.name);
    console.log('  Raw value:', JSON.stringify(doc.studentListsByLevel).substring(0, 200));
  }
  // console.log(computationSummarySchema)
  console.log('🔍 [DEBUG] Mongoose Schema Details:');
  const ComputationSummary = mongoose.model('ComputationSummary');
  const schemaPath = ComputationSummary.schema.path('keyToCoursesByLevel');

  console.log('Full schema path:', {
    constructorName: schemaPath.constructor.name,
    instance: schemaPath.instance,
    options: {
      type: schemaPath.options.type,
      of: schemaPath.options.of,
      ofType: schemaPath.options.of ? schemaPath.options.of.constructor.name : 'none'
    },
    caster: {
      instance: schemaPath.caster?.instance,
      constructor: schemaPath.caster?.constructor?.name,
      caster: schemaPath.caster?.caster?.instance
    }
  });

  // // Also check the document's schema
  // console.log('Document schema:', {
  //   hasKeyToCourses: computationSummary.schema.paths.hasOwnProperty('keyToCoursesByLevel'),
  //   pathType: computationSummary.schema.path('keyToCoursesByLevel')?.instance
  // });
});
// Pre-save middleware to initialize Maps
computationSummarySchema.pre('save', function (next) {
  if (!this.studentSummariesByLevel) this.studentSummariesByLevel = new Map();
  if (!this.summaryOfResultsByLevel) this.summaryOfResultsByLevel = new Map();
  if (!this.studentListsByLevel) this.studentListsByLevel = new Map();
  if (!this.masterSheetDataByLevel) this.masterSheetDataByLevel = new Map();
  next();
});

const ComputationSummary = mongoose.model("ComputationSummary", computationSummarySchema);
export default ComputationSummary;