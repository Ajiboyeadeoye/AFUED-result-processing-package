// computation/controllers/finalComputation.controller.js
import mongoose from "mongoose";
import { ComputationCore } from "../core/computation.core.js";
import ComputationSummary from "../../result/computation.model.js";
import MasterComputation from "../../result/masterComputation.model.js";
import departmentModel from "../../department/department.model.js";
import SemesterService from "../../semester/semester.service.js";
import { addDepartmentJob, queueNotification } from "../../../workers/department.queue.js";
import { randomUUID } from "crypto";
import buildResponse from "../../../utils/responseBuilder.js";
import CarryoverService from "../services/CarryoverService.js";
import BulkWriter from "../services/BulkWriter.js";
import ReportService from "../services/ReportService.js";
import StudentService from "../services/StudentService.js";
import ResultService from "../services/ResultService.js";
import GPACalculator from "../services/GPACalculator.js";
import AcademicStandingEngine from "../services/AcademicStandingEngine.js";

/**
 * Process final department job
 */
export const processFinalDepartmentJob = async (job) => {
  const {
    departmentId,
    masterComputationId,
    computedBy,
    jobId,
    isRetry = false
  } = job.data;

  console.log(`Processing final department job: ${jobId} for department ${departmentId}`);

  // Initialize services
  const bulkWriter = new BulkWriter();

  // Get department and semester
  const department = await StudentService.getDepartmentDetails(departmentId);
  if (!department) {
    throw new Error(`Department ${departmentId} not found`);
  }

  const activeSemester = await SemesterService.getActiveDepartmentSemester(departmentId);
  if (!activeSemester) {
    throw new Error(`No active semester found for department: ${department.name}`);
  }

  if (activeSemester.isLocked) {
    throw new Error(`Semester ${activeSemester.name} for ${department.name} is already locked`);
  }

  // Initialize computation summary
  let computationSummary = await initializeComputationSummary(
    departmentId,
    activeSemester._id,
    masterComputationId,
    computedBy,
    isRetry
  );

  try {
    // Create core computation engine
    const computationCore = new ComputationCore({
      isPreview: false,
      purpose: 'final',
      computedBy,
      computationSummary,
      department,
      activeSemester,
      masterComputationId
    });

    // Get student IDs
    const studentIds = await StudentService.getStudentIds(departmentId);
    console.log(`Processing ${studentIds.length} students for department ${department.name}`);

    // 🔧 FIX 1: Initialize the results buffer if needed
    if (!computationCore.buffers.allResults) {
      computationCore.buffers.allResults = [];
    }

    // Process students in batches
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const studentBatch = studentIds.slice(i, i + BATCH_SIZE);

      // Get student results
      const [students, resultsByStudent] = await Promise.all([
        StudentService.getStudentsWithDetails(studentBatch),
        ResultService.getResultsByStudents(studentBatch, activeSemester._id)
      ]);

      for (const student of students) {
        computationCore.counters.totalStudents++;

        try {
          const studentResults = resultsByStudent[student._id.toString()] || [];

          if (!studentResults || studentResults.length === 0) {
            await CarryoverService.handleMissingResults(
              student._id,
              department._id,
              activeSemester._id,
              computationSummary._id
            );
            continue;
          }

          // 🔧 FIX 2: Add results to buffer BEFORE processing
          computationCore.buffers.allResults.push(...studentResults);

          // Process student using core
          const result = await computationCore.processSingleStudent(student, studentResults);

          // Store results for later use
          result.results = studentResults;
          result.student = student;

          // Process final actions for each student
          await processFinalStudentActions(
            result,
            computationCore,
            bulkWriter,
            department,
            activeSemester,
            computedBy,
            computationSummary
          );

        } catch (error) {
          computationCore.handleStudentProcessingError(student, error);
        }
      }

      // Process bulk operations
      if (bulkWriter.shouldFlush()) {
        await bulkWriter.executeBulkWrites();
      }
    }

    // Execute any remaining bulk operations
    await bulkWriter.executeBulkWrites();

    // 🔧 FIX 3: Build keyToCourses explicitly before finalization
    console.log(`📊 Building keyToCourses from ${computationCore.buffers.allResults.length} results`);
    await computationCore.buildKeyToCourses();

    // Finalize computation
    await finalizeFinalComputation(
      computationCore,
      computationSummary,
      department,
      activeSemester,
      computedBy,
      masterComputationId,
      bulkWriter
    );

    console.log(`✅ Final computation completed for department ${department.name}`);

    return {
      success: true,
      summaryId: computationSummary._id,
      department: department.name,
      studentsProcessed: computationCore.counters.studentsWithResults,
      // Debug info:
      keyToCoursesBuilt: !!computationCore.buffers.keyToCoursesByLevel,
      totalResults: computationCore.buffers.allResults.length,
      keyToCoursesLevels: Object.keys(computationCore.buffers.keyToCoursesByLevel || {}).length
    };

  } catch (error) {
    console.error(`Department job failed:`, error);
    await handleJobFailure(computationSummary, department, activeSemester, error);
    throw error;
  }
};

/**
 * Process final student actions (carryovers, updates, etc.)
 */
async function processFinalStudentActions(
  result,
  computationCore,
  bulkWriter,
  department,
  activeSemester,
  computedBy,
  computationSummary
) {
  const { student, gpaData, cgpaData, academicStanding, isTerminatedOrWithdrawn } = result;

  // Process failed courses (carryovers) if not terminated/withdrawn
  if (gpaData.failedCount > 0 && !isTerminatedOrWithdrawn) {
    await processFailedCourses(
      student,
      gpaData.failedCourses,
      activeSemester._id,
      department._id,
      computationSummary._id,
      computedBy,
      computationCore.counters,
      bulkWriter
    );
  }

  // Update student record
  await updateStudentRecord(student, gpaData, cgpaData, academicStanding, gpaData.failedCount, bulkWriter);

  // Create semester result record
  const semesterResultData = await buildStudentSemesterResult(
    student,
    result.results,
    department,
    activeSemester,
    gpaData,
    cgpaData,
    academicStanding,
    computedBy,
    computationSummary
  );

  bulkWriter.addSemesterResultUpdate(null, semesterResultData);

  // Queue notification
  if (!isTerminatedOrWithdrawn) {
    // bulkWriter.addNotification({
    //   studentId: student._id,
    //   studentName: student.name,
    //   studentEmail: student.email,
    //   semesterGPA: gpaData.semesterGPA,
    //   currentCGPA: cgpaData.cgpa,
    //   studentCarryovers: gpaData.failedCount,
    //   academicStanding,
    //   activeSemesterName: activeSemester.name,
    //   departmentName: department.name
    // });
  }
}

/**
 * Process failed courses (create carryovers)
 */
async function processFailedCourses(
  student,
  failedCourses,
  semesterId,
  departmentId,
  computationSummaryId,
  computedBy,
  counters,
  bulkWriter
) {
  if (failedCourses.length === 0) {
    return;
  }

  console.log(`Processing ${failedCourses.length} failed courses for student ${student._id}`);

  // Process carryovers
  const carryoverBuffers = await CarryoverService.processFailedCourses(
    failedCourses,
    student._id,
    semesterId,
    departmentId,
    computationSummaryId,
    computedBy
  );

  // Update counters based on actual carryovers created
  counters.totalCarryovers += carryoverBuffers.length;
  if (carryoverBuffers.length > 0) {
    counters.affectedStudentsCount++;
  }

  // Add to bulk writer
  for (const carryoverBuffer of carryoverBuffers) {
    bulkWriter.addCarryover(carryoverBuffer);
  }
}

/**
 * Update student record in database
 */
async function updateStudentRecord(student, gpaData, cgpaData, academicStanding, failedCount, bulkWriter) {
  const updates = {
    set: {
      gpa: gpaData.semesterGPA,
      cgpa: cgpaData.cgpa,
      lastGPAUpdate: new Date(),
      probationStatus: academicStanding.probationStatus,
      terminationStatus: academicStanding.terminationStatus
    },
    increment: {
      totalCarryovers: failedCount
    }
  };

  // Add to bulk writer
  bulkWriter.addStudentUpdate(student._id, updates);
}

/**
 * Build student semester result record
 */
async function buildStudentSemesterResult(
  student,
  results,
  department,
  activeSemester,
  gpaData,
  cgpaData,
  academicStanding,
  computedBy,
  computationSummary
) {
  const courseDetails = [];

  // Process each course result
  for (const result of results) {
    const gradeInfo = GPACalculator.calculateGradeAndPoints(result.score);
    const courseUnit = result.courseUnit || result.courseId?.credits || result.courseId?.unit || 1;
    const isCoreCourse = result.courseId?.isCoreCourse || result.courseId?.courseType === "core" || false;

    courseDetails.push({
      courseId: result.courseId?._id || result.courseId,
      courseUnit: courseUnit,
      score: result.score,
      grade: gradeInfo.grade,
      gradePoint: gradeInfo.point,
      isCoreCourse: isCoreCourse,
      isCarryover: result.isCarryover || false
    });
  }

  return {
    studentId: student._id,
    departmentId: department._id,
    semesterId: activeSemester._id,
    session: activeSemester.academicYear || new Date().getFullYear().toString(),
    level: student.level || "100",
    courses: courseDetails,
    gpa: gpaData.semesterGPA,
    cgpa: cgpaData.cgpa,
    totalUnits: gpaData.totalUnits,
    totalPoints: gpaData.totalPoints,
    carryoverCount: gpaData.failedCount,

    // TCP/TNU tracking for master sheet
    previousCumulativeTCP: cgpaData.previousCumulativeTCP,
    previousCumulativeTNU: cgpaData.previousCumulativeTNU,
    currentTCP: gpaData.totalCreditPoints,
    currentTNU: gpaData.totalUnits,
    cumulativeTCP: cgpaData.cumulativeTCP,
    cumulativeTNU: cgpaData.cumulativeTNU,

    remark: academicStanding.remark,
    status: "processed",
    computedBy,
    computationSummaryId: computationSummary._id,
    createdAt: new Date()
  };
}

/**
 * Initialize computation summary
 */
async function initializeComputationSummary(departmentId, semesterId, masterComputationId, computedBy, isRetry) {
  if (isRetry) {
    const computationSummary = await ComputationSummary.findOne({
      department: departmentId,
      semester: semesterId,
      masterComputationId
    });

    if (computationSummary) {
      computationSummary.status = "processing";
      computationSummary.retryCount = (computationSummary.retryCount || 0) + 1;
      computationSummary.lastRetryAt = new Date();
      await computationSummary.save();
      return computationSummary;
    }
  }

  const computationSummary = new ComputationSummary({
    department: departmentId,
    semester: semesterId,
    masterComputationId,
    status: "processing",
    computedBy,
    startedAt: new Date()
  });

  await computationSummary.save();
  return computationSummary;
}

/**
 * Finalize final computation
 */
async function finalizeFinalComputation(
  computationCore,
  computationSummary,
  department,
  activeSemester,
  computedBy,
  masterComputationId,
  bulkWriter
) {
  console.log('🏁 Starting finalizeFinalComputation...');
  
  // ✅ USE THE UNIFIED HANDLER
  const computationHandler = new ComputationHandler({
    isPreview: false,
    purpose: 'final'
  });
  
  const summaryData = await computationHandler.finalizeComputation(
    computationCore,
    computationSummary,
    department,
    activeSemester,
    computedBy,
    masterComputationId,
    bulkWriter
  );
  
  // Send HOD notification
  await ReportService.sendHODNotification(
    department, 
    activeSemester, 
    summaryData
  );
  
  console.log(`✅ [FINALIZE] Computation completed for ${department.name}`);
  return summaryData;
}

/**
 * Handle job failure
 */
export async function handleJobFailure(computationSummary, department, activeSemester, error) {
  if (computationSummary) {
    computationSummary.status = "failed";
    computationSummary.errorMessage = error.message;
    computationSummary.completedAt = new Date();
    await computationSummary.save();
  }

  // Notify HOD about failure
  if (department.hod) {
    await queueNotification(
      "hod",
      department.hod,
      "computation_failed",
      `Results computation failed for ${department.name} - ${activeSemester.name}. Error: ${error.message}`,
      {
        department: department.name,
        semester: activeSemester.name,
        error: error.message
      }
    );
  }
}

/**
 * Handle preview job failure (exported for use in main controller)
 */
export async function handlePreviewJobFailure(computationSummary, department, activeSemester, error) {
  if (computationSummary) {
    computationSummary.status = "failed";
    computationSummary.errorMessage = error.message;
    computationSummary.completedAt = new Date();
    await computationSummary.save();
  }

  console.error(`Preview computation failed for ${department.name}: ${error.message}`);
}

// Import missing constant
import { BATCH_SIZE } from "../utils/computationConstants.js";import { ComputationHandler } from "./computation.handler.js";

