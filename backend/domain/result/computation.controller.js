import mongoose from "mongoose";
import Result from "./result.model.js";
import ComputationSummary from "./computation.model.js";
import MasterComputation from "./masterComputation.model.js";
import CarryoverCourse from "./carryover.model.js";
// import studentSemseterResultModel from "./studentSemesterResult.model.js";
import studentModel from "../student/student.model.js";
import departmentModel from "../department/department.model.js";
import Semester from "../semester/semester.model.js";
import courseModel from "../course/course.model.js";
import { addDepartmentJob, departmentQueue, queueNotification } from "../../workers/department.queue.js";
import studentSemseterResultModel from "../student/student.semseterResult.model.js";
import { randomUUID } from "crypto";
import buildResponse from "../../utils/responseBuilder.js";

// ==================== CONFIGURATION ====================
const ACADEMIC_RULES = {
  PROBATION_THRESHOLD: 1.50,
  TERMINATION_THRESHOLD: 1.00,
  PROBATION_SEMESTER_LIMIT: 2,
  CARRYOVER_LIMIT: 5,
  EXCELLENT_GPA: 4.50,
  GOOD_GPA: 2.00
};

// ==================== EXISTING UTILITY FUNCTIONS (UNCHANGED) ====================

const getGradeClassification = (gpa) => {
  if (gpa >= 4.50) return "firstClass";
  if (gpa >= 3.50) return "secondClassUpper";
  if (gpa >= 2.40) return "secondClassLower";
  if (gpa >= 1.50) return "thirdClass";
  return "fail";
};

const getActiveSemesterForDepartment = async (departmentId) => {
  return await Semester.findOne({
    department: departmentId,
    isActive: true,
  });
};

const isPassingGrade = (grade) => {
  return grade !== "F";
};

const isCoreCourse = async (courseId) => {
  try {
    const course = await courseModel.findById(courseId).select("courseType isCoreCourse");
    return course ? (course.isCoreCourse === true || course.courseType === "core") : false;
  } catch (error) {
    console.error(`Error checking if course ${courseId} is core:`, error);
    return true;
  }
};

const addToCarryoverBuffer = async (
  studentId,
  courseId,
  semesterId,
  departmentId,
  resultId,
  grade,
  score,
  computationBatchId,
  createdBy = null,
  reason = "Failed"
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const courseIsCore = await isCoreCourse(courseId);

    if (!courseIsCore) {
      await session.commitTransaction();
      return null;
    }

    const existingCarryover = await CarryoverCourse.findOne({
      student: studentId,
      course: courseId,
      semester: semesterId,
      cleared: false
    }).session(session);

    if (existingCarryover) {
      await session.commitTransaction();
      return existingCarryover;
    }

    const carryover = new CarryoverCourse({
      student: studentId,
      course: courseId,
      semester: semesterId,
      department: departmentId,
      result: resultId,
      grade,
      score,
      reason,
      isCoreCourse: true,
      cleared: false,
      createdBy,
      computationBatch: computationBatchId
    });

    await carryover.save({ session });

    await studentModel.findByIdAndUpdate(
      studentId,
      {
        $addToSet: { carryoverCourses: courseId },
        $inc: { totalCarryovers: 1 }
      },
      { session }
    );

    await session.commitTransaction();
    return carryover;

  } catch (error) {
    await session.abortTransaction();
    console.error(`Failed to add to carryover buffer:`, error);
    throw error;
  } finally {
    session.endSession();
  }
};

const handleMissingResults = async (studentId, departmentId, semesterId, computationBatchId) => {
  try {
    const student = await studentModel.findById(studentId).select("level");
    if (!student) return;

    const departmentCourses = await courseModel.find({
      department: departmentId,
      isCoreCourse: true,
      level: student.level
    }).select("_id title courseCode");

    for (const course of departmentCourses) {
      const existingResult = await Result.findOne({
        studentId,
        courseId: course._id,
        semester: semesterId,
        deletedAt: null
      });

      if (!existingResult) {
        try {
          await addToCarryoverBuffer(
            studentId,
            course._id,
            semesterId,
            departmentId,
            null,
            "F",
            0,
            computationBatchId,
            null,
            "NotRegistered"
          );
        } catch (error) {
          console.error(`Failed to add missing course ${course._id} to carryover:`, error);
        }
      }
    }
  } catch (error) {
    console.error("Error handling missing results:", error);
  }
};

// ==================== NEW FUNCTIONS ADDED ====================

const calculateGradeAndPoints = (score) => {
  if (score >= 70) return { grade: "A", point: 5 };
  if (score >= 60) return { grade: "B", point: 4 };
  if (score >= 50) return { grade: "C", point: 3 };
  if (score >= 45) return { grade: "D", point: 2 };
  return { grade: "F", point: 0 };
};

const determineAcademicStanding = async (student, semesterGPA, cgpa, carryoverCount, currentSemesterId) => {
  let probationStatus = student.probationStatus || "none";
  let terminationStatus = student.terminationStatus || "none";
  let remark = "good";
  let actionTaken = null;

  // Check for termination due to excessive carryovers
  if (carryoverCount >= ACADEMIC_RULES.CARRYOVER_LIMIT) {
    terminationStatus = "terminated";
    remark = "terminated";
    actionTaken = "terminated_carryover_limit";
  }
  // Check CGPA termination rule (if on probation and CGPA below threshold)
  else if (probationStatus === "probation" && cgpa < ACADEMIC_RULES.TERMINATION_THRESHOLD) {
    // Check previous semester results for consecutive probation
    const previousResults = await studentSemseterResultModel.find({
      studentId: student._id,
      semesterId: { $ne: currentSemesterId }
    }).sort({ createdAt: -1 }).limit(ACADEMIC_RULES.PROBATION_SEMESTER_LIMIT);

    const consecutiveProbationCount = previousResults.filter(r =>
      r.remark === "probation" || r.gpa < ACADEMIC_RULES.PROBATION_THRESHOLD
    ).length;

    if (consecutiveProbationCount >= ACADEMIC_RULES.PROBATION_SEMESTER_LIMIT - 1) {
      terminationStatus = "withdrawn";
      remark = "withdrawn";
      actionTaken = "withdrawn_cgpa_low";
    }
  }
  // Check for probation
  else if (semesterGPA < ACADEMIC_RULES.PROBATION_THRESHOLD && terminationStatus === "none") {
    if (probationStatus === "none") {
      probationStatus = "probation";
      actionTaken = "placed_on_probation";
    }
    remark = "probation";
  }
  // Check for probation lifting
  else if (probationStatus === "probation" && semesterGPA >= ACADEMIC_RULES.GOOD_GPA) {
    probationStatus = "probation_lifted";
    actionTaken = "probation_lifted";
  }
  // Check for excellent performance
  else if (semesterGPA >= ACADEMIC_RULES.EXCELLENT_GPA) {
    remark = "excellent";
  }

  return {
    probationStatus,
    terminationStatus,
    remark,
    actionTaken
  };
};

const createOrUpdateStudentSemesterResult = async (
  studentId,
  departmentId,
  semesterId,
  semesterResults,
  semesterGPA,
  cgpa,
  semesterTotalUnits,
  semesterTotalPoints,
  carryoverCount,
  remark,
  computedBy,
  computationSummaryId
) => {
  try {
    const existingResult = await studentSemseterResultModel.findOne({
      studentId,
      semesterId
    });

    const courseDetails = await Promise.all(semesterResults.map(async (result) => {
      const { grade, point } = calculateGradeAndPoints(result.score);
      const courseIsCore = await isCoreCourse(result.courseId);

      return {
        courseId: result.courseId?._id || result.courseId,
        courseUnit: result.courseUnit || 1,
        score: result.score,
        grade,
        gradePoint: point,
        isCoreCourse: courseIsCore,
        isCarryover: result.isCarryover || false
      };
    }));

    const resultData = {
      studentId,
      departmentId,
      semesterId,
      courses: courseDetails,
      gpa: semesterGPA,
      cgpa,
      totalUnits: semesterTotalUnits,
      totalPoints: semesterTotalPoints,
      carryoverCount,
      remark,
      computedBy,
      computationSummaryId,
      status: "processed"
    };

    if (existingResult) {
      await studentSemseterResultModel.findByIdAndUpdate(existingResult._id, resultData);
      return existingResult._id;
    } else {
      const studentSemesterResult = new studentSemseterResultModel(resultData);
      await studentSemesterResult.save();
      return studentSemesterResult._id;
    }
  } catch (error) {
    console.error(`Error creating/updating semester result for student ${studentId}:`, error);
    throw error;
  }
};

async function calculateStudentCGPA(studentId, currentSemesterId, semesterGPA, semesterTotalPoints, semesterTotalUnits) {
  try {
    const previousResults = await studentSemseterResultModel.find({
      studentId,
      semesterId: { $ne: currentSemesterId }
    }).select("gpa totalUnits totalPoints");

    let totalPoints = semesterTotalPoints;
    let totalUnits = semesterTotalUnits;

    for (const result of previousResults) {
      totalPoints += result.totalPoints || 0;
      totalUnits += result.totalUnits || 0;
    }

    if (totalUnits === 0) {
      return { cgpa: 0, totalUnits: 0, totalPoints: 0 };
    }

    const cgpa = parseFloat((totalPoints / totalUnits).toFixed(2));
    return { cgpa, totalUnits, totalPoints };
  } catch (error) {
    console.error(`Error calculating CGPA for student ${studentId}:`, error);
    return { cgpa: 0, totalUnits: 0, totalPoints: 0 };
  }
}


// ==================== DEPARTMENT JOB PROCESSOR ====================

export const processDepartmentJob = async (job) => {
  const {
    departmentId,
    masterComputationId,
    computedBy,
    jobId,
    isRetry = false
  } = job.data;

  console.log(`Processing department job: ${jobId} for department ${departmentId}`);

  const department = await departmentModel.findById(departmentId);
  if (!department) {
    throw new Error(`Department ${departmentId} not found`);
  }

  const activeSemester = await getActiveSemesterForDepartment(departmentId);
  if (!activeSemester) {
    throw new Error(`No active semester found for department: ${department.name}`);
  }

  if (activeSemester.isLocked) {
    throw new Error(`Semester ${activeSemester.name} for ${department.name} is already locked`);
  }

  let computationSummary;
  if (isRetry) {
    computationSummary = await ComputationSummary.findOne({
      department: departmentId,
      semester: activeSemester._id,
      masterComputationId
    });

    if (computationSummary) {
      computationSummary.status = "processing";
      computationSummary.retryCount = (computationSummary.retryCount || 0) + 1;
      computationSummary.lastRetryAt = new Date();
      await computationSummary.save();
    }
  }

  if (!computationSummary) {
    computationSummary = new ComputationSummary({
      department: departmentId,
      semester: activeSemester._id,
      masterComputationId,
      status: "processing",
      computedBy,
      startedAt: new Date()
    });
    await computationSummary.save();
  }

  // Initialize counters and buffers for bulk operations
  let totalStudents = 0;
  let studentsWithResults = 0;
  let totalGPA = 0;
  let highestGPA = 0;
  let lowestGPA = 5.0;
  let totalCarryovers = 0;
  let affectedStudentsCount = 0;

  const gradeDistribution = {
    firstClass: 0,
    secondClassUpper: 0,
    secondClassLower: 0,
    thirdClass: 0,
    fail: 0
  };

  // Buffers for new lists
  const passListBuffer = [];
  const probationListBuffer = [];
  const withdrawalListBuffer = [];
  const terminationListBuffer = [];
  const carryoverStudentsBuffer = [];

  const levelStats = {};
  const batchSize = 100;
  const notificationBatchSize = 50;
  
  // Buffers for bulk operations
  const studentUpdates = [];
  const carryoverBuffers = [];
  const semesterResultUpdates = [];
  const notificationQueue = [];
  const failedStudentsBuffer = [];
  
  // Memory-efficient tracking
  const processedStudentIds = new Set();

  try {
    const studentCount = await studentModel.countDocuments({
      departmentId: departmentId,
      terminationStatus: { $in: ["none", "probation", null] }
    });

    console.log(`Processing ${studentCount} students for department ${department.name}`);

    // Fetch all student IDs
    const studentIds = await studentModel.find({
      departmentId: departmentId,
      terminationStatus: { $in: ["none", "probation", null] }
    }, '_id').lean();

    // Process students in smaller chunks
    for (let i = 0; i < studentIds.length; i += batchSize) {
      const studentBatch = studentIds.slice(i, i + batchSize);
      const studentIdsBatch = studentBatch.map(s => s._id);

      // Bulk fetch student details
      const students = await studentModel.aggregate([
        {
          $match: { _id: { $in: studentIdsBatch } }
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userInfo"
          }
        },
        { $unwind: "$userInfo" },
        {
          $project: {
            _id: 1,
            name: "$userInfo.name",
            email: "$userInfo.email",
            matricNumber: 1,
            level: 1,
            probationStatus: 1,
            terminationStatus: 1,
            cgpa: 1,
            totalCarryovers: 1
          }
        }
      ]);

      // Bulk fetch results for all students in this batch
      const allResults = await Result.find({
        studentId: { $in: studentIdsBatch },
        semester: activeSemester._id,
        deletedAt: null,
      })
        .populate("courseId", "type isCoreCourse code name credits level")
        .lean();

      // Group results by student ID
      const resultsByStudent = allResults.reduce((acc, result) => {
        const studentId = result.studentId.toString();
        if (!acc[studentId]) acc[studentId] = [];
        acc[studentId].push(result);
        return acc;
      }, {});

      // Process each student in parallel
      const batchPromises = students.map(async (student) => {
        totalStudents++;
        const studentIdStr = student._id.toString();

        try {
          const semesterResults = resultsByStudent[studentIdStr];

          if (!semesterResults || semesterResults.length === 0) {
            await handleMissingResults(student._id, departmentId, activeSemester._id, computationSummary._id);
            return null;
          }

          // Initialize level stats if needed
          if (!levelStats[student.level]) {
            levelStats[student.level] = {
              totalStudents: 0,
              totalGPA: 0,
              totalCarryovers: 0,
              highestGPA: 0,
              lowestGPA: 5.0,
              gradeDistribution: { ...gradeDistribution }
            };
          }
          levelStats[student.level].totalStudents++;

          // Calculate semester GPA and identify failed courses
          let semesterTotalPoints = 0;
          let semesterTotalUnits = 0;
          const failedCourses = [];

          for (const result of semesterResults) {
            const score = result.score || 0;
            const { grade, point } = calculateGradeAndPoints(score);
            const courseUnit = result.courseUnit || 1;

            semesterTotalPoints += (point * courseUnit);
            semesterTotalUnits += courseUnit;

            if (!isPassingGrade(grade)) {
              const courseIsCore = result.courseId?.isCoreCourse || result.courseId?.type === "core";
              
              failedCourses.push({
                courseId: result.courseId?._id || result.courseId,
                resultId: result._id,
                grade,
                score,
                courseUnit,
                courseType: result.courseId?.type || "general",
                courseLevel: result.courseId?.level || student.level
              });
            }
          }

          // Calculate semester GPA
          const semesterGPA = semesterTotalUnits > 0
            ? parseFloat((semesterTotalPoints / semesterTotalUnits).toFixed(2))
            : 0;

          // Calculate CGPA
          const cgpaData = await calculateStudentCGPAOptimized(
            student._id,
            activeSemester._id,
            semesterGPA,
            semesterTotalPoints,
            semesterTotalUnits
          );
          const currentCGPA = cgpaData.cgpa;

          // Process failed courses
          const studentCarryovers = failedCourses.length;
          
          if (studentCarryovers > 0) {
            totalCarryovers += studentCarryovers;
            affectedStudentsCount++;
            levelStats[student.level].totalCarryovers += studentCarryovers;

            // Add to carryover buffer for bulk processing
            for (const failedCourse of failedCourses) {
              carryoverBuffers.push({
                studentId: student._id,
                courseId: failedCourse.courseId,
                semester: activeSemester._id,
                departmentId: departmentId,
                resultId: failedCourse.resultId,
                grade: failedCourse.grade,
                score: failedCourse.score,
                computationSummaryId: computationSummary._id,
                computedBy: computedBy,
                reason: "Failed",
                status: "pending",
                createdAt: new Date()
              });
            }
          }

          // Determine academic standing and add to appropriate lists
          const academicStanding = determineAcademicStandingOptimized(
            student,
            semesterGPA,
            currentCGPA,
            student.totalCarryovers + studentCarryovers
          );

          // Prepare student update
          studentUpdates.push({
            updateOne: {
              filter: { _id: student._id },
              update: {
                $set: {
                  gpa: semesterGPA,
                  cgpa: currentCGPA,
                  lastGPAUpdate: new Date(),
                  probationStatus: academicStanding.probationStatus,
                  terminationStatus: academicStanding.terminationStatus
                },
                $inc: { totalCarryovers: studentCarryovers }
              }
            }
          });

          // Prepare semester result update
          const studentSemesterResultId = await getOrCreateStudentSemesterResultId(
            student._id,
            departmentId,
            activeSemester._id
          );

          semesterResultUpdates.push({
            updateOne: {
              filter: { _id: studentSemesterResultId },
              update: {
                $set: {
                  semesterResults: semesterResults.map(r => ({
                    courseId: r.courseId?._id || r.courseId,
                    score: r.score,
                    grade: r.grade,
                    points: r.points
                  })),
                  semesterGPA: semesterGPA,
                  currentCGPA: currentCGPA,
                  totalUnits: semesterTotalUnits,
                  totalPoints: semesterTotalPoints,
                  carryovers: studentCarryovers,
                  academicStanding: academicStanding.remark,
                  computedBy: computedBy,
                  computationSummaryId: computationSummary._id,
                  updatedAt: new Date()
                }
              },
              upsert: true
            }
          });

          // Update statistics
          studentsWithResults++;
          totalGPA += semesterGPA;
          processedStudentIds.add(student._id.toString());

          // Update high/low GPA
          if (semesterGPA > highestGPA) highestGPA = semesterGPA;
          if (semesterGPA < lowestGPA && semesterGPA > 0) lowestGPA = semesterGPA;

          // Update level stats
          levelStats[student.level].totalGPA += semesterGPA;
          if (semesterGPA > levelStats[student.level].highestGPA) {
            levelStats[student.level].highestGPA = semesterGPA;
          }
          if (semesterGPA < levelStats[student.level].lowestGPA && semesterGPA > 0) {
            levelStats[student.level].lowestGPA = semesterGPA;
          }

          // Update grade distribution
          const classification = getGradeClassification(semesterGPA);
          gradeDistribution[classification]++;
          levelStats[student.level].gradeDistribution[classification]++;

          // Add student to appropriate lists based on academic standing
          const studentListEntry = {
            studentId: student._id,
            matricNumber: student.matricNumber,
            name: student.name,
            gpa: semesterGPA
          };

          switch (academicStanding.remark) {
            case "excellent":
            case "good":
              // Add to pass list if no carryovers and good standing
              if (studentCarryovers === 0) {
                passListBuffer.push(studentListEntry);
              }
              break;
              
            case "probation":
              probationListBuffer.push({
                ...studentListEntry,
                remarks: academicStanding.actionTaken || "Placed on academic probation"
              });
              break;
              
            case "withdrawn":
              withdrawalListBuffer.push({
                ...studentListEntry,
                reason: "Poor academic performance",
                remarks: academicStanding.actionTaken || "Withdrawn due to low CGPA"
              });
              break;
              
            case "terminated":
              terminationListBuffer.push({
                ...studentListEntry,
                reason: "Excessive carryovers or poor performance",
                remarks: academicStanding.actionTaken || "Terminated due to academic standing"
              });
              break;
          }

          // Add to carryover students list if applicable
          if (studentCarryovers > 0) {
            carryoverStudentsBuffer.push({
              studentId: student._id,
              matricNumber: student.matricNumber,
              name: student.name,
              courses: failedCourses.map(fc => fc.courseId),
              notes: `Failed ${studentCarryovers} course(s)`
            });
          }

          // Queue notification for batch processing
          notificationQueue.push({
            studentId: student._id,
            studentName: student.name,
            studentEmail: student.email,
            semesterGPA,
            currentCGPA,
            studentCarryovers,
            academicStanding,
            activeSemesterName: activeSemester.name,
            departmentName: department.name
          });

          return {
            studentId: student._id,
            success: true,
            standing: academicStanding.remark
          };

        } catch (error) {
          console.error(`Error processing student ${student.matricNumber}:`, error);
          
          failedStudentsBuffer.push({
            studentId: student._id,
            matricNumber: student.matricNumber,
            name: student.name,
            error: error.message,
            notified: false
          });

          // Queue error notification
          notificationQueue.push({
            studentId: student._id,
            studentName: student.name,
            studentEmail: student.email,
            error: true,
            errorMessage: error.message,
            activeSemesterName: activeSemester.name,
            departmentName: department.name
          });

          return {
            studentId: student._id,
            success: false,
            error: error.message
          };
        }
      });

      // Process batch results
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Update job progress
      const progress = Math.min(((i + studentBatch.length) / studentIds.length) * 100, 100);
      await job.progress(progress);

      // Process bulk operations for this batch
      await processBulkOperations();
    }

    // Process any remaining bulk operations
    await processBulkOperations();

    // Calculate final averages
    const averageGPA = studentsWithResults > 0 ? totalGPA / studentsWithResults : 0;

    // Calculate level averages
    Object.keys(levelStats).forEach(level => {
      if (levelStats[level].totalStudents > 0) {
        levelStats[level].averageGPA = levelStats[level].totalGPA / levelStats[level].totalStudents;
      }
    });

    // Get detailed carryover info
    const detailedCarryoverInfo = await getDetailedCarryoverInfo(
      carryoverStudentsBuffer,
      activeSemester._id
    );

    // Generate repeat course analysis
    const repeatRanking = await analyzeRepeatCourses(carryoverStudentsBuffer);

    // Update computation summary with all new lists
    await updateComputationSummary(computationSummary, {
      totalStudents,
      studentsWithResults,
      averageGPA,
      highestGPA,
      lowestGPA,
      gradeDistribution,
      totalCarryovers,
      affectedStudentsCount,
      passList: passListBuffer,
      probationList: probationListBuffer,
      withdrawalList: withdrawalListBuffer,
      terminationList: terminationListBuffer,
      carryoverStudents: detailedCarryoverInfo,
      repeatRanking,
      levelStats,
      failedStudents: failedStudentsBuffer
    });

    // Generate report asynchronously
    generateReportAsync(computationSummary._id, department, activeSemester, {
      totalStudents,
      studentsWithResults,
      averageGPA,
      totalCarryovers,
      affectedStudentsCount,
      passListCount: passListBuffer.length,
      probationListCount: probationListBuffer.length,
      withdrawalListCount: withdrawalListBuffer.length,
      terminationListCount: terminationListBuffer.length,
      levelStats
    });

    // Lock semester if successful
    if (failedStudentsBuffer.length === 0) {
      await Semester.findByIdAndUpdate(
        activeSemester._id,
        {
          lockedAt: new Date(),
          lockedBy: computedBy,
          computationSummary: computationSummary._id
        }
      );
      console.log(`Locked semester ${activeSemester.name} for ${department.name}`);
    }

    // Send comprehensive HOD notification with list summaries
    await sendHODNotification(department, activeSemester, computationSummary);

    // Update master computation
    await updateMasterComputation(masterComputationId, computationSummary._id, department.name, {
      studentsWithResults,
      failedStudentsCount: failedStudentsBuffer.length,
      totalCarryovers,
      affectedStudentsCount,
      passListCount: passListBuffer.length,
      probationListCount: probationListBuffer.length,
      withdrawalListCount: withdrawalListBuffer.length,
      terminationListCount: terminationListBuffer.length
    });

    console.log(`✅ Completed department ${department.name}: 
      ${studentsWithResults} students processed
      ${totalCarryovers} carryovers
      ${affectedStudentsCount} students with carryovers
      Pass List: ${passListBuffer.length} students
      Probation List: ${probationListBuffer.length} students
      Withdrawal List: ${withdrawalListBuffer.length} students
      Termination List: ${terminationListBuffer.length} students
      ${failedStudentsBuffer.length} failed students`);

    return {
      success: true,
      summaryId: computationSummary._id,
      department: department.name,
      studentsProcessed: studentsWithResults,
      passListCount: passListBuffer.length,
      probationListCount: probationListBuffer.length,
      withdrawalListCount: withdrawalListBuffer.length,
      terminationListCount: terminationListBuffer.length,
      carryoverCount: totalCarryovers,
      averageGPA,
      semesterLocked: failedStudentsBuffer.length === 0,
      reportGenerated: true
    };

  } catch (error) {
    console.error(`Department job failed:`, error);

    await handleJobFailure(computationSummary, department, activeSemester, error);

    throw error;
  }

  // Helper functions for bulk operations
  async function processBulkOperations() {
    try {
      // Process student updates in bulk
      if (studentUpdates.length > 0) {
        await studentModel.bulkWrite(studentUpdates, { ordered: false });
        studentUpdates.length = 0; // Clear buffer
      }

      // Process carryover buffers in bulk
      if (carryoverBuffers.length > 0) {
        await CarryoverBuffer.insertMany(carryoverBuffers, { ordered: false });
        carryoverBuffers.length = 0; // Clear buffer
      }

      // Process semester result updates in bulk
      if (semesterResultUpdates.length > 0) {
        await StudentSemesterResult.bulkWrite(semesterResultUpdates, { ordered: false });
        semesterResultUpdates.length = 0; // Clear buffer
      }

      // Process notifications in batches
      if (notificationQueue.length > 0) {
        await processNotificationsBatch(notificationQueue.splice(0, notificationBatchSize));
      }

    } catch (error) {
      console.error("Bulk operation failed:", error);
      // Log error but continue - individual student errors are already captured
    }
  }
};

// Updated helper functions for new model structure
const getDetailedCarryoverInfo = async (carryoverStudentsBuffer, semesterId) => {
  if (carryoverStudentsBuffer.length === 0) return [];

  // Limit to first 100 for summary
  const limitedBuffer = carryoverStudentsBuffer.slice(0, 100);
  
  // Get course details for the limited buffer
  const studentIds = limitedBuffer.map(s => s.studentId);
  const courseIds = limitedBuffer.flatMap(s => s.courses || []);
  
  const [students, courses] = await Promise.all([
    studentModel.find({ _id: { $in: studentIds } })
      .populate('_id', 'name matricNumber')
      .lean(),
    courseModel.find({ _id: { $in: courseIds } })
      .select('code name')
      .lean()
  ]);

  // Create a lookup map
  const studentMap = students.reduce((acc, student) => {
    acc[student._id.toString()] = {
      name: student.name,
      matricNumber: student.matricNumber
    };
    return acc;
  }, {});

  const courseMap = courses.reduce((acc, course) => {
    acc[course._id.toString()] = {
      code: course.code,
      name: course.name
    };
    return acc;
  }, {});

  // Build detailed info
  return limitedBuffer.map(student => ({
    studentId: student.studentId,
    matricNumber: studentMap[student.studentId.toString()]?.matricNumber || student.matricNumber,
    name: studentMap[student.studentId.toString()]?.name || student.name,
    courses: student.courses.map(courseId => courseMap[courseId.toString()] || courseId),
    notes: student.notes
  }));
};

const analyzeRepeatCourses = async (carryoverStudentsBuffer) => {
  if (carryoverStudentsBuffer.length === 0) return {};

  // Collect all course IDs
  const allCourses = carryoverStudentsBuffer.flatMap(s => s.courses || []);
  
  // Count occurrences
  const courseCounts = {};
  allCourses.forEach(courseId => {
    const key = courseId.toString();
    courseCounts[key] = (courseCounts[key] || 0) + 1;
  });

  // Get course details for top repeated courses
  const topCourseIds = Object.entries(courseCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([courseId]) => new mongoose.Types.ObjectId(courseId));

  const courses = await courseModel.find({ _id: { $in: topCourseIds } })
    .select('code name')
    .lean();

  // Build ranking with course details
  const ranking = {};
  courses.forEach(course => {
    const count = courseCounts[course._id.toString()] || 0;
    ranking[course.code] = {
      name: course.name,
      count: count,
      percentage: ((count / carryoverStudentsBuffer.length) * 100).toFixed(1) + '%'
    };
  });

  return ranking;
};

const updateComputationSummary = async (summary, data) => {
  summary.status = data.failedStudents.length > 0 ? "completed_with_errors" : "completed";
  summary.totalStudents = data.totalStudents;
  summary.studentsWithResults = data.studentsWithResults;
  summary.studentsProcessed = data.studentsWithResults - data.failedStudents.length;
  summary.averageGPA = parseFloat(data.averageGPA.toFixed(2));
  summary.highestGPA = parseFloat(data.highestGPA.toFixed(2));
  summary.lowestGPA = parseFloat(data.lowestGPA.toFixed(2));
  summary.gradeDistribution = data.gradeDistribution;
  
  // Updated carryover stats with detailed info
  summary.carryoverStats = {
    totalCarryovers: data.totalCarryovers,
    affectedStudentsCount: data.affectedStudentsCount,
    affectedStudents: data.carryoverStudents.slice(0, 100) // Limit to 100
  };
  
  // New lists
  summary.passList = data.passList.slice(0, 100); // Limit to 100
  summary.probationList = data.probationList.slice(0, 100);
  summary.withdrawalList = data.withdrawalList.slice(0, 50);
  summary.terminationList = data.terminationList.slice(0, 50);
  
  summary.failedStudents = data.failedStudents;
  summary.additionalMetrics = {
    levelStats: data.levelStats,
    repeatRanking: data.repeatRanking
  };
  
  summary.completedAt = new Date();
  summary.duration = Date.now() - summary.startedAt.getTime();

  await summary.save();
};

const sendHODNotification = async (department, semester, summary) => {
  if (!department.hod) return;

  const message = `📊 RESULTS COMPUTATION COMPLETE - ${department.name}
    
Semester: ${semester.name}
Processed: ${summary.studentsWithResults}/${summary.totalStudents} students
Average GPA: ${summary.averageGPA.toFixed(2)}

🎓 STUDENT LISTS:
Passed: ${summary.passList.length} students
Probation: ${summary.probationList.length} students
Withdrawal: ${summary.withdrawalList.length} students
Termination: ${summary.terminationList.length} students

📚 CARRYOVER ANALYSIS:
Total Carryovers: ${summary.carryoverStats.totalCarryovers}
Affected Students: ${summary.carryoverStats.affectedStudentsCount}

⚠️ FAILED PROCESSING: ${summary.failedStudents.length}
${summary.failedStudents.length > 0 ? 'Check dashboard for details' : 'All students processed successfully'}

View detailed report in the dashboard.`;

  await queueNotification(
    "hod",
    department.hod,
    "department_results_computed",
    message,
    {
      department: department.name,
      semester: semester.name,
      summaryId: summary._id,
      passListCount: summary.passList.length,
      probationListCount: summary.probationList.length,
      withdrawalListCount: summary.withdrawalList.length,
      terminationListCount: summary.terminationList.length
    }
  );
};

const generateReportAsync = async (summaryId, department, semester, data) => {
  // Run in background
  process.nextTick(async () => {
    try {
      await generateComputationReport(summaryId, {
        department,
        semester,
        ...data
      });
    } catch (error) {
      console.error("Async report generation failed:", error);
    }
  });
};

const generateComputationReport = async (summaryId, data) => {
  try {
    const summary = await ComputationSummary.findById(summaryId)
      .populate('department', 'name code')
      .populate('semester', 'name')
      .populate('passList.studentId', 'matricNumber name')
      .populate('probationList.studentId', 'matricNumber name')
      .populate('withdrawalList.studentId', 'matricNumber name')
      .populate('terminationList.studentId', 'matricNumber name')
      .populate('carryoverStats.affectedStudents.studentId', 'matricNumber name')
      .lean();

    const reportData = {
      title: `Academic Results Computation Report - ${data.department.name}`,
      semester: data.semester.name,
      generatedAt: new Date(),
      executiveSummary: {
        totalStudents: summary.totalStudents,
        processedStudents: summary.studentsProcessed,
        successRate: ((summary.studentsProcessed / summary.totalStudents) * 100).toFixed(1) + '%',
        averageGPA: summary.averageGPA,
        highestGPA: summary.highestGPA,
        lowestGPA: summary.lowestGPA
      },
      studentLists: {
        passList: {
          count: summary.passList.length,
          students: summary.passList.map(s => ({
            matricNumber: s.matricNumber,
            name: s.name,
            gpa: s.gpa
          }))
        },
        probationList: {
          count: summary.probationList.length,
          students: summary.probationList.map(s => ({
            matricNumber: s.matricNumber,
            name: s.name,
            gpa: s.gpa,
            remarks: s.remarks
          }))
        },
        withdrawalList: {
          count: summary.withdrawalList.length,
          students: summary.withdrawalList.map(s => ({
            matricNumber: s.matricNumber,
            name: s.name,
            reason: s.reason,
            remarks: s.remarks
          }))
        },
        terminationList: {
          count: summary.terminationList.length,
          students: summary.terminationList.map(s => ({
            matricNumber: s.matricNumber,
            name: s.name,
            reason: s.reason,
            remarks: s.remarks
          }))
        }
      },
      analysis: {
        gradeDistribution: summary.gradeDistribution,
        carryoverAnalysis: summary.carryoverStats,
        levelPerformance: summary.additionalMetrics?.levelStats || {},
        failedStudents: summary.failedStudents.length
      },
      recommendations: generateReportRecommendations(summary)
    };

    // Store report
    await ComputationReport.create({
      computationSummary: summaryId,
      reportData,
      generatedBy: summary.computedBy,
      status: "generated"
    });

    console.log(`Generated comprehensive report for summary ${summaryId}`);
    
  } catch (error) {
    console.error("Failed to generate report:", error);
  }
};

const generateReportRecommendations = (summary) => {
  const recommendations = [];
  
  // High probation rate
  if (summary.probationList.length > summary.totalStudents * 0.1) {
    recommendations.push({
      priority: "high",
      title: "High Probation Rate",
      description: `More than 10% of students (${summary.probationList.length}) are on probation. Consider implementing academic support programs.`,
      action: "Review academic support services and consider additional tutoring programs."
    });
  }
  
  // High carryover rate
  if (summary.carryoverStats.affectedStudentsCount > summary.totalStudents * 0.15) {
    recommendations.push({
      priority: "high",
      title: "High Carryover Rate",
      description: `${summary.carryoverStats.affectedStudentsCount} students (${((summary.carryoverStats.affectedStudentsCount / summary.totalStudents) * 100).toFixed(1)}%) have carryover courses.`,
      action: "Review curriculum difficulty and consider course structure adjustments."
    });
  }
  
  // High termination/withdrawal rate
  const criticalStudents = summary.terminationList.length + summary.withdrawalList.length;
  if (criticalStudents > summary.totalStudents * 0.05) {
    recommendations.push({
      priority: "critical",
      title: "High Student Attrition",
      description: `${criticalStudents} students (${((criticalStudents / summary.totalStudents) * 100).toFixed(1)}%) have been withdrawn or terminated.`,
      action: "Immediate review of academic policies and student support systems required."
    });
  }
  
  // Low average GPA
  if (summary.averageGPA < 2.5) {
    recommendations.push({
      priority: "medium",
      title: "Below Average Performance",
      description: `Department average GPA is ${summary.averageGPA.toFixed(2)}, below the recommended threshold.`,
      action: "Consider reviewing teaching methods and assessment strategies."
    });
  }
  
  return recommendations;
};

// Optimized helper functions
const calculateStudentCGPAOptimized = async (studentId, semesterId, semesterGPA, semesterPoints, semesterUnits) => {
  // Use cached aggregation if possible
  // const cacheKey = `cgpa:${studentId}:${semesterId}`;
  // const cached = await redis.get(cacheKey);
  
  // if (cached) {
  //   return JSON.parse(cached);
  // }

  // Calculate with single aggregation
  const result = await Result.aggregate([
    {
      $match: {
        studentId: studentId,
        semester: { $ne: semesterId }, // Exclude current semester
        deletedAt: null
      }
    },
    {
      $group: {
        _id: null,
        totalPoints: { $sum: { $multiply: ["$points", "$courseUnit"] } },
        totalUnits: { $sum: "$courseUnit" }
      }
    }
  ]);

  let totalPoints = result[0]?.totalPoints || 0;
  let totalUnits = result[0]?.totalUnits || 0;

  // Add current semester
  totalPoints += semesterPoints;
  totalUnits += semesterUnits;

  const cgpa = totalUnits > 0 ? parseFloat((totalPoints / totalUnits).toFixed(2)) : 0;

  const data = { cgpa, totalPoints, totalUnits };
  
  // Cache for 1 hour
  // await redis.setex(cacheKey, 3600, JSON.stringify(data));
  
  return data;
};

const determineAcademicStandingOptimized = (student, semesterGPA, currentCGPA, totalCarryovers) => {
  // Simplified logic without DB calls
  const rules = {
    probation: currentCGPA < 1.5 || semesterGPA < 1.0,
    withdrawn: currentCGPA < 1.0 && student.level > 1,
    terminated: totalCarryovers > 8 || (currentCGPA < 0.5 && student.level > 2)
  };

  if (rules.terminated) {
    return {
      probationStatus: "none",
      terminationStatus: "terminated",
      remark: "terminated",
      actionTaken: "terminated_carryover_limit"
    };
  }

  if (rules.withdrawn) {
    return {
      probationStatus: "none",
      terminationStatus: "withdrawn",
      remark: "withdrawn",
      actionTaken: "withdrawn_cgpa_low"
    };
  }

  if (rules.probation) {
    return {
      probationStatus: "probation",
      terminationStatus: "none",
      remark: "probation",
      actionTaken: student.probationStatus === "none" ? "placed_on_probation" : "probation_continued"
    };
  }

  if (currentCGPA >= 4.0) {
    return {
      probationStatus: "none",
      terminationStatus: "none",
      remark: "excellent",
      actionTaken: "none"
    };
  }

  if (currentCGPA >= 3.0) {
    return {
      probationStatus: "none",
      terminationStatus: "none",
      remark: "good",
      actionTaken: "none"
    };
  }

  return {
    probationStatus: "none",
    terminationStatus: "none",
    remark: "good",
    actionTaken: "none"
  };
};

const processNotificationsBatch = async (notifications) => {
  const notificationPromises = notifications.map(async (notification) => {
    if (notification.error) {
      return queueNotification(
        "student",
        notification.studentId,
        "computation_failed",
        `Dear ${notification.studentName}, your results computation for ${notification.activeSemesterName} in ${notification.departmentName} has failed. Reason: ${notification.errorMessage}. Please contact your HOD.`,
        {
          department: notification.departmentName,
          semester: notification.activeSemesterName,
          reason: notification.errorMessage
        }
      );
    } else {
      let notificationType = "results_computed";
      let message = `Your ${notification.activeSemesterName} results have been computed. GPA: ${notification.semesterGPA.toFixed(2)}, CGPA: ${notification.currentCGPA.toFixed(2)}.`;

      if (notification.studentCarryovers > 0) {
        notificationType = "results_with_carryovers";
        message += ` You have ${notification.studentCarryovers} carryover course(s).`;
      }

      if (notification.academicStanding.actionTaken) {
        message += ` Status: ${notification.academicStanding.actionTaken.replace(/_/g, ' ')}.`;
      }

      return queueNotification(
        "specific",
        notification.studentId,
        notificationType,
        message,
        {
          semester: notification.activeSemesterName,
          gpa: notification.semesterGPA,
          cgpa: notification.currentCGPA,
          carryoverCount: notification.studentCarryovers,
          probationStatus: notification.academicStanding.probationStatus,
          terminationStatus: notification.academicStanding.terminationStatus
        }
      );
    }
  });

  await Promise.allSettled(notificationPromises);
};

// Other helper functions remain similar but optimized...

// ==================== MAIN CONTROLLERS ====================

export const computeAllResults = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
    const computedBy = req.user._id;
    console.log(computedBy)


    // Get all active departments
    const departments = await departmentModel.find({
      // status: "active" 
    }).session(session);

    console.log("Total Departments", departments.length)
    if (departments.length === 0) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No active departments found");
    }

    // Find departments with active semesters and results
    const departmentsToProcess = [];

    for (const dept of departments) {
      const activeSemester = await getActiveSemesterForDepartment(dept._id);
      if (activeSemester) {
        const hasResults = await Result.exists({
          courseDepartmentId: dept._id,
          semester: activeSemester._id,
          deletedAt: null,
        });

        if (hasResults) {
          departmentsToProcess.push({
            departmentId: dept._id,
            departmentName: dept.name,
            semesterId: activeSemester._id,
            semesterName: activeSemester.name
          });
        }
      }
    }

    if (departmentsToProcess.length === 0) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No departments have results in their active semesters");
    }

    // Create master computation record
    console.log(computedBy)
    const masterComputation = new MasterComputation({
      totalDepartments: departmentsToProcess.length,
      status: "processing",
      computedBy,
      startedAt: new Date(),
      metadata: {
        departments: departmentsToProcess,
        initiatedBy: {
          userId: computedBy,
          timestamp: new Date().toISOString()
        }
      }
    });

    await masterComputation.save({ session });
    await session.commitTransaction();

    // await departmentQueue.isReady();
    // if (!departmentQueue) {
    //   console.error("Queue not initialized yet");
    //   return;
    // }
    // Add each department to processing queue
    for (const dept of departmentsToProcess) {
      const uniqueJobId = `dept-${dept.departmentId}-${masterComputation._id}-${Date.now()}-${randomUUID()}`;
      await addDepartmentJob(
        {
          departmentId: dept.departmentId,
          masterComputationId: masterComputation._id,
          computedBy,
          jobId: uniqueJobId,
          priority: 1,
        }
      );
    }

    // Start monitoring completion
    setTimeout(() => monitorMasterCompletion(masterComputation._id, computedBy), 10000);

    return buildResponse(res, 202, "Results computation started", {
      masterComputationId: masterComputation._id,
      totalDepartments: departmentsToProcess.length,
      message: "Computation has been queued. Check status using the computation ID.",
      statusEndpoint: `/api/computation/status/${masterComputation._id}`
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("Error starting computation:", error);

    return buildResponse(res, 500, "Failed to start results computation", null, true, error);
  } finally {
    session.endSession();
  }
};

const monitorMasterCompletion = async (masterComputationId, adminId) => {
  console.log(`Starting monitoring for master computation: ${masterComputationId}`);

  const checkInterval = 30000; // 30 seconds
  const maxDuration = 7200000; // 2 hours

  const startTime = Date.now();
  const intervalId = setInterval(async () => {
    try {
      if (Date.now() - startTime > maxDuration) {
        clearInterval(intervalId);
        console.log(`Monitoring timeout for ${masterComputationId}`);
        return;
      }

      const masterComputation = await MasterComputation.findById(masterComputationId);

      if (!masterComputation) {
        clearInterval(intervalId);
        return;
      }

      // Check if all departments processed
      if (masterComputation.departmentsProcessed >= masterComputation.totalDepartments) {
        clearInterval(intervalId);

        // Get all summaries for final stats
        const summaries = await ComputationSummary.find({
          _id: { $in: masterComputation.departmentSummaries }
        }).select("averageGPA totalStudents failedStudents carryoverStats");

        const totalGPA = summaries.reduce((sum, s) => sum + (s.averageGPA || 0), 0);
        const totalStudents = summaries.reduce((sum, s) => sum + (s.totalStudents || 0), 0);
        const totalFailed = summaries.reduce((sum, s) => sum + (s.failedStudents?.length || 0), 0);
        const totalCarryovers = summaries.reduce((sum, s) => sum + (s.carryoverStats?.totalCarryovers || 0), 0);

        const overallAverageGPA = summaries.length > 0 ? totalGPA / summaries.length : 0;
        const departmentsLocked = summaries.filter(s => !s.failedStudents?.length).length;

        // Finalize master computation
        const finalSession = await mongoose.startSession();
        try {
          finalSession.startTransaction();

          const finalStatus = totalFailed > 0 ? "completed_with_errors" : "completed";

          await MasterComputation.findByIdAndUpdate(
            masterComputationId,
            {
              status: finalStatus,
              overallAverageGPA: parseFloat(overallAverageGPA.toFixed(2)),
              totalStudents,
              totalFailedStudents: totalFailed,
              totalCarryovers,
              departmentsLocked,
              completedAt: new Date(),
              duration: Date.now() - masterComputation.startedAt.getTime()
            },
            { session: finalSession }
          );

          await finalSession.commitTransaction();
        } catch (error) {
          await finalSession.abortTransaction();
          console.error("Failed to finalize master computation:", error);
        } finally {
          finalSession.endSession();
        }

        // Queue admin notification
        await queueNotification(
          "admin",
          adminId,
          "all_results_computed",
          `Results computation completed.
          Departments: ${masterComputation.departmentsProcessed}/${masterComputation.totalDepartments}
          Students: ${totalStudents}
          Average GPA: ${overallAverageGPA.toFixed(2)}
          Carryovers: ${totalCarryovers}
          Failed Students: ${totalFailed}`,
          {
            masterComputationId,
            totalDepartments: masterComputation.totalDepartments,
            processedDepartments: masterComputation.departmentsProcessed,
            totalStudents,
            averageGPA: overallAverageGPA.toFixed(2),
            totalCarryovers,
            failedStudents: totalFailed
          }
        );

        console.log(`Master computation ${masterComputationId} completed`);
      }
    } catch (error) {
      console.error("Error in monitoring:", error);
      clearInterval(intervalId);
    }
  }, checkInterval);
};

export const getComputationStatus = async (req, res) => {
  try {
    const { masterComputationId } = req.params;

    const masterComputation = await MasterComputation.findById(masterComputationId)
      .populate("computedBy", "name email")
      .populate({
        path: "departmentSummaries",
        populate: [
          {
            path: "department",
            select: "name code"
          },
          {
            path: "semester",
            select: "name academicYear isActive isLocked"
          }
        ]
      });

    if (!masterComputation) {
      return buildResponse(res, 404, "Computation record not found");
    }

    // Get queue statistics
    const waitingCount = await departmentQueue.getWaitingCount();
    const activeCount = await departmentQueue.getActiveCount();
    const completedCount = await departmentQueue.getCompletedCount();
    const failedCount = await departmentQueue.getFailedCount();

    // Get active jobs for this computation
    const waitingJobs = await departmentQueue.getWaiting();
    const activeJobs = await departmentQueue.getActive();
console.log(waitingJobs, activeJobs)
    const relatedJobs = [...waitingJobs, ...activeJobs].filter(job =>
      job.data.masterComputationId === masterComputationId
    );

    return buildResponse(res, 200, "Computation status retrieved", {
      masterComputation,
      queueStats: {
        waiting: waitingCount,
        active: activeCount,
        completed: completedCount,
        failed: failedCount
      },
      progress: {
        percentage: masterComputation.totalDepartments > 0
          ? (masterComputation.departmentsProcessed / masterComputation.totalDepartments * 100).toFixed(1)
          : 0,
        processed: masterComputation.departmentsProcessed,
        total: masterComputation.totalDepartments
      },
      activeJobs: relatedJobs.map(job => ({
        departmentId: job.data.departmentId,
        status: job.getState(),
        progress: job.progress(),
        attempts: job.attemptsMade
      }))
    });
  } catch (error) {
    console.log(error)
    return buildResponse(res, 500, "Failed to get computation status", null, true, error);
  }
};

export const cancelComputation = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
    const { masterComputationId } = req.params;
    const computedBy = req.user._id;

    // Remove queued jobs
    const waitingJobs = await departmentQueue.getWaiting();
    const activeJobs = await departmentQueue.getActive();

    const jobsToRemove = [...waitingJobs, ...activeJobs].filter(job =>
      job.data.masterComputationId === masterComputationId
    );

    for (const job of jobsToRemove) {
      await job.remove();
    }

    // Update master computation
    const masterComputation = await MasterComputation.findById(masterComputationId).session(session);
    if (!masterComputation) {
      await session.abortTransaction();
      return buildResponse(res, 404, "Master computation not found");
    }

    masterComputation.status = "cancelled";
    masterComputation.completedAt = new Date();
    masterComputation.duration = Date.now() - masterComputation.startedAt.getTime();

    await masterComputation.save({ session });
    await session.commitTransaction();

    await queueNotification(
      "admin",
      computedBy,
      "computation_cancelled",
      `Results computation cancelled. ID: ${masterComputationId}`,
      { masterComputationId }
    );

    return buildResponse(res, 200, "Computation cancelled successfully", {
      masterComputationId,
      cancelledJobs: jobsToRemove.length
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return buildResponse(res, 500, "Failed to cancel computation", null, true, error);
  } finally {
    session.endSession();
  }
};

export const retryFailedDepartments = async (req, res) => {
  try {
    const { masterComputationId } = req.params;
    const { departmentIds } = req.body;
    const computedBy = req.user._id;

    const masterComputation = await MasterComputation.findById(masterComputationId);
    if (!masterComputation) {
      return buildResponse(res, 404, "Master computation not found");
    }

    // Get failed department summaries
    const failedSummaries = await ComputationSummary.find({
      _id: { $in: masterComputation.departmentSummaries },
      status: { $in: ["failed", "completed_with_errors"] }
    });

    const departmentsToRetry = departmentIds
      ? failedSummaries.filter(s => departmentIds.includes(s.department.toString()))
      : failedSummaries;

    if (departmentsToRetry.length === 0) {
      return buildResponse(res, 400, "No failed departments to retry");
    }

    // Add retry jobs
    const retryJobs = [];
    for (const summary of departmentsToRetry) {
      const job = await departmentQueue.add("department-computation", {
        departmentId: summary.department,
        masterComputationId,
        computedBy,
        jobId: `retry-${summary.department}-${Date.now()}`,
        isRetry: true
      }, {
        jobId: `retry-${summary.department}-${masterComputationId}`,
        priority: 2 // Higher priority for retries
      });
      retryJobs.push(job.id);
    }

    return buildResponse(res, 200, "Failed departments queued for retry", {
      queued: departmentsToRetry.length,
      retryJobs,
      departments: departmentsToRetry.map(s => s.department)
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to retry departments", null, true, error);
  }
};

export const getDepartmentCarryoverStats = async (req, res) => {
  try {
    const { departmentId, semesterId } = req.params;

    const pipeline = [
      {
        $match: {
          department: new mongoose.Types.ObjectId(departmentId),
          semester: new mongoose.Types.ObjectId(semesterId),
          cleared: false
        }
      },
      {
        $group: {
          _id: "$course",
          totalStudents: { $sum: 1 },
          students: { $push: "$student" }
        }
      },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "courseInfo"
        }
      },
      {
        $unwind: "$courseInfo"
      },
      {
        $project: {
          courseCode: "$courseInfo.courseCode",
          courseTitle: "$courseInfo.title",
          courseUnit: "$courseInfo.unit",
          totalStudents: 1,
          students: "$students"
        }
      },
      {
        $sort: { totalStudents: -1 }
      }
    ];

    const carryoverStats = await CarryoverCourse.aggregate(pipeline);

    // Get department info
    const department = await departmentModel.findById(departmentId).select("name code");
    const semester = await Semester.findById(semesterId).select("name academicYear");

    return buildResponse(res, 200, "Carryover statistics retrieved", {
      department,
      semester,
      totalCarryoverCourses: carryoverStats.length,
      totalStudentsWithCarryovers: carryoverStats.reduce((sum, stat) => sum + stat.totalStudents, 0),
      courseBreakdown: carryoverStats
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to get carryover statistics", null, true, error);
  }
};

export const getStudentCarryovers = async (req, res) => {
  try {
    const { studentId } = req.params;

    const carryovers = await CarryoverCourse.find({
      student: studentId,
      cleared: false
    })
      .populate("course", "courseCode title unit")
      .populate("semester", "name academicYear")
      .populate("result", "score grade")
      .sort({ semester: -1, "course.courseCode": 1 });

    const student = await studentModel.findById(studentId)
      .select("matricNumber name level departmentId totalCarryovers")
      .populate("departmentId", "name");

    // Group by semester
    const bySemester = {};
    carryovers.forEach(carryover => {
      const semesterName = carryover.semester?.name || "Unknown";
      if (!bySemester[semesterName]) {
        bySemester[semesterName] = [];
      }
      bySemester[semesterName].push(carryover);
    });

    return buildResponse(res, 200, "Student carryovers retrieved", {
      student,
      totalCarryovers: carryovers.length,
      bySemester,
      allCarryovers: carryovers
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to get student carryovers", null, true, error);
  }
};

export const clearCarryover = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
    const { carryoverId } = req.params;
    const { resultId, remark } = req.body;
    const clearedBy = req.user._id;

    const carryover = await CarryoverCourse.findById(carryoverId).session(session);

    if (!carryover) {
      await session.abortTransaction();
      return buildResponse(res, 404, "Carryover not found");
    }

    if (carryover.cleared) {
      await session.abortTransaction();
      return buildResponse(res, 400, "Carryover is already cleared");
    }

    carryover.cleared = true;
    carryover.clearedAt = new Date();
    carryover.clearedBy = clearedBy;
    carryover.remark = remark;
    if (resultId) carryover.result = resultId;

    await carryover.save({ session });

    // Remove from student's carryover list
    await studentModel.findByIdAndUpdate(
      carryover.student,
      {
        $pull: { carryoverCourses: carryover.course },
        $inc: { totalCarryovers: -1 }
      },
      { session }
    );

    await session.commitTransaction();

    // Notify student
    await queueNotification(
      "student",
      carryover.student,
      "carryover_cleared",
      `Your carryover for ${carryover.course?.courseCode || "course"} has been cleared.`,
      {
        courseId: carryover.course,
        clearedAt: new Date().toISOString()
      }
    );

    return buildResponse(res, 200, "Carryover cleared successfully", carryover);
  } catch (error) {
    await session.abortTransaction();
    return buildResponse(res, 500, "Failed to clear carryover", null, true, error);
  } finally {
    session.endSession();
  }
};

export const getComputationHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [computations, total] = await Promise.all([
      MasterComputation.find(query)
        .populate("computedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MasterComputation.countDocuments(query)
    ]);

    return buildResponse(res, 200, "Computation history retrieved", {
      computations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to get computation history", null, true, error);
  }
};

// GPA Calculation functions
export const calculateSemesterGPA = async (req, res) => {
  try {
    const { studentId, semesterId } = req.params;

    const gpaData = await calculateStudentGPASemester(studentId, semesterId);

    return buildResponse(res, 200, "Semester GPA calculated", {
      studentId,
      semesterId,
      ...gpaData
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to calculate GPA", null, true, error);
  }
};

export const calculateStudentCGPAr = async (req, res) => {
  try {
    const { studentId } = req.params;

    const cgpaData = await calculateStudentCGPA(studentId);

    return buildResponse(res, 200, "CGPA calculated", {
      studentId,
      ...cgpaData
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to calculate CGPA", null, true, error);
  }
};