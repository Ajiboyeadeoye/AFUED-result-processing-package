import mongoose from "mongoose";
import Result from "../models/result.model.js";
import Student from "../models/student.model.js";
import Department from "../models/department.model.js";
import Semester from "../models/semester.model.js";
import Course from "../models/course.model.js";
import ComputationSummary from "../models/computation.model.js";
import MasterComputation from "../models/masterComputation.model.js";
import CarryoverCourse from "../models/carryover.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { Queue } from "bull";

// Initialize queues
const departmentQueue = new Queue("department-computation", {
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

const notificationQueue = new Queue("notifications", {
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "fixed",
      delay: 3000
    },
    removeOnComplete: true,
    removeOnFail: true
  }
});

// ==================== UTILITY FUNCTIONS ====================

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
    isLocked: false
  });
};

const calculateStudentGPASemester = async (studentId, semesterId) => {
  const pipeline = [
    {
      $match: {
        studentId: new mongoose.Types.ObjectId(studentId),
        semester: new mongoose.Types.ObjectId(semesterId),
        deletedAt: null,
        approved: true
      }
    },
    {
      $project: {
        courseUnit: { $ifNull: ["$courseUnit", 1] },
        gradePoint: 1
      }
    },
    {
      $group: {
        _id: null,
        totalUnits: { $sum: "$courseUnit" },
        totalPoints: { $sum: { $multiply: ["$courseUnit", "$gradePoint"] } }
      }
    }
  ];

  const [result] = await Result.aggregate(pipeline);
  
  if (!result || result.totalUnits === 0) {
    return { gpa: 0, totalUnits: 0, totalPoints: 0 };
  }

  const gpa = parseFloat((result.totalPoints / result.totalUnits).toFixed(2));
  return { gpa, totalUnits: result.totalUnits, totalPoints: result.totalPoints };
};

const calculateStudentCGPA = async (studentId) => {
  const pipeline = [
    {
      $match: {
        studentId: new mongoose.Types.ObjectId(studentId),
        deletedAt: null,
        approved: true
      }
    },
    {
      $project: {
        courseUnit: { $ifNull: ["$courseUnit", 1] },
        gradePoint: 1
      }
    },
    {
      $group: {
        _id: null,
        totalUnits: { $sum: "$courseUnit" },
        totalPoints: { $sum: { $multiply: ["$courseUnit", "$gradePoint"] } }
      }
    }
  ];

  const [result] = await Result.aggregate(pipeline);
  
  if (!result || result.totalUnits === 0) {
    return { cgpa: 0, totalUnits: 0, totalPoints: 0 };
  }

  const cgpa = parseFloat((result.totalPoints / result.totalUnits).toFixed(2));
  return { cgpa, totalUnits: result.totalUnits, totalPoints: result.totalPoints };
};

const isCoreCourse = async (courseId) => {
  try {
    const course = await Course.findById(courseId).select("courseType isCoreCourse");
    return course ? (course.isCoreCourse === true || course.courseType === "core") : false;
  } catch (error) {
    console.error(`Error checking if course ${courseId} is core:`, error);
    return true; // Default to true if we can't determine
  }
};

const isPassingGrade = (grade) => {
  return grade !== "F";
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
    
    await Student.findByIdAndUpdate(
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

const queueNotification = async (target, recipientId, templateId, message, metadata = {}) => {
  try {
    await notificationQueue.add({
      target,
      recipientId,
      templateId,
      message,
      metadata,
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error("Failed to queue notification:", error);
    return false;
  }
};

const handleMissingResults = async (studentId, departmentId, semesterId, computationBatchId) => {
  try {
    // Get student's current level
    const student = await Student.findById(studentId).select("level");
    if (!student) return;
    
    // Get all core courses for this department at student's level
    const departmentCourses = await Course.find({
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

// ==================== DEPARTMENT JOB PROCESSOR ====================

const processDepartmentJob = async (job) => {
  const { 
    departmentId, 
    masterComputationId, 
    computedBy, 
    jobId,
    isRetry = false 
  } = job.data;

  console.log(`Processing department job: ${jobId} for department ${departmentId}`);

  const department = await Department.findById(departmentId);
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

  // Find existing summary for retry, or create new
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

  try {
    const batchSize = 50; // Smaller batch size for better memory management
    let totalStudents = 0;
    let studentsWithResults = 0;
    let totalGPA = 0;
    let highestGPA = 0;
    let lowestGPA = 5.0;
    let totalCarryovers = 0;
    
    const gradeDistribution = {
      firstClass: 0,
      secondClassUpper: 0,
      secondClassLower: 0,
      thirdClass: 0,
      fail: 0
    };

    const failedStudents = [];
    const processedStudents = [];

    // Get student count
    const studentCount = await Student.countDocuments({ 
      departmentId: departmentId,
      status: "active"
    });

    console.log(`Processing ${studentCount} students for department ${department.name}`);

    // Process in batches
    for (let skip = 0; skip < studentCount; skip += batchSize) {
      const students = await Student.find({ 
        departmentId: departmentId,
        status: "active"
      })
      .skip(skip)
      .limit(batchSize)
      .select("_id matricNumber name email level");

      for (const student of students) {
        totalStudents++;
        
        try {
          // Get semester results
          const semesterResults = await Result.find({
            studentId: student._id,
            semester: activeSemester._id,
            deletedAt: null,
            approved: true
          })
          .populate("courseId", "courseType isCoreCourse")
          .lean();

          if (!semesterResults || semesterResults.length === 0) {
            await handleMissingResults(student._id, departmentId, activeSemester._id, computationSummary._id);
            continue;
          }

          let semesterTotalPoints = 0;
          let semesterTotalUnits = 0;
          const failedCourses = [];

          // Process each result
          for (const result of semesterResults) {
            const courseId = result.courseId?._id || result.courseId;
            const grade = result.grade;
            const gradePoint = result.gradePoint || 0;
            const courseUnit = result.courseUnit || 1;
            
            semesterTotalPoints += (gradePoint * courseUnit);
            semesterTotalUnits += courseUnit;
            
            if (!isPassingGrade(grade)) {
              const courseIsCore = result.courseId?.isCoreCourse || 
                                  result.courseId?.courseType === "core";
              
              if (courseIsCore) {
                failedCourses.push({
                  courseId,
                  resultId: result._id,
                  grade,
                  score: result.score,
                  courseUnit
                });
              }
            }
          }

          // Calculate semester GPA
          const semesterGPA = semesterTotalUnits > 0 
            ? parseFloat((semesterTotalPoints / semesterTotalUnits).toFixed(2))
            : 0;
          
          // Calculate CGPA
          const cgpaData = await calculateStudentCGPA(student._id);

          // Process failed courses for carryover
          let studentCarryovers = 0;
          for (const failedCourse of failedCourses) {
            try {
              await addToCarryoverBuffer(
                student._id,
                failedCourse.courseId,
                activeSemester._id,
                departmentId,
                failedCourse.resultId,
                failedCourse.grade,
                failedCourse.score,
                computationSummary._id,
                computedBy,
                "Failed"
              );
              
              studentCarryovers++;
              totalCarryovers++;
              
            } catch (error) {
              console.error(`Failed to add carryover:`, error);
            }
          }

          // Update student document
          const studentSession = await mongoose.startSession();
          try {
            studentSession.startTransaction();
            
            await Student.findByIdAndUpdate(
              student._id,
              {
                gpa: semesterGPA,
                cgpa: cgpaData.cgpa,
                lastGPAUpdate: new Date(),
                $inc: { totalCarryovers: studentCarryovers }
              },
              { session: studentSession }
            );
            
            await studentSession.commitTransaction();
            studentsWithResults++;
          } catch (error) {
            await studentSession.abortTransaction();
            throw error;
          } finally {
            studentSession.endSession();
          }

          // Update statistics
          totalGPA += semesterGPA;
          
          if (semesterGPA > highestGPA) {
            highestGPA = semesterGPA;
          }
          
          if (semesterGPA < lowestGPA && semesterGPA > 0) {
            lowestGPA = semesterGPA;
          }

          const classification = getGradeClassification(semesterGPA);
          gradeDistribution[classification]++;

          processedStudents.push({
            studentId: student._id,
            gpa: semesterGPA,
            cgpa: cgpaData.cgpa,
            carryovers: studentCarryovers
          });

          // Queue student notification
          const notificationMessage = studentCarryovers > 0
            ? `Your ${activeSemester.name} results have been computed. GPA: ${semesterGPA.toFixed(2)}, CGPA: ${cgpaData.cgpa.toFixed(2)}. You have ${studentCarryovers} carryover course(s).`
            : `Your ${activeSemester.name} results have been computed. GPA: ${semesterGPA.toFixed(2)}, CGPA: ${cgpaData.cgpa.toFixed(2)}.`;

          await queueNotification(
            "student",
            student._id,
            studentCarryovers > 0 ? "results_with_carryovers" : "results_computed",
            notificationMessage,
            {
              semester: activeSemester.name,
              gpa: semesterGPA,
              cgpa: cgpaData.cgpa,
              carryoverCount: studentCarryovers
            }
          );

        } catch (error) {
          console.error(`Error processing student ${student.matricNumber}:`, error);
          
          failedStudents.push({
            studentId: student._id,
            matricNumber: student.matricNumber,
            name: student.name,
            error: error.message
          });

          await queueNotification(
            "student",
            student._id,
            "computation_failed",
            `Dear ${student.name}, your results computation for ${activeSemester.name} in ${department.name} has failed. Reason: ${error.message}. Please contact your HOD.`,
            {
              department: department.name,
              semester: activeSemester.name,
              reason: error.message
            }
          );
        }
      }

      // Update job progress
      const progress = Math.min((skip + batchSize) / studentCount * 100, 100);
      await job.progress(progress);
    }

    // Calculate average GPA
    const averageGPA = studentsWithResults > 0 ? totalGPA / studentsWithResults : 0;

    // Update computation summary
    computationSummary.status = failedStudents.length > 0 ? "completed_with_errors" : "completed";
    computationSummary.totalStudents = totalStudents;
    computationSummary.studentsWithResults = studentsWithResults;
    computationSummary.averageGPA = parseFloat(averageGPA.toFixed(2));
    computationSummary.highestGPA = parseFloat(highestGPA.toFixed(2));
    computationSummary.lowestGPA = parseFloat(lowestGPA.toFixed(2));
    computationSummary.gradeDistribution = gradeDistribution;
    computationSummary.carryoverStats = {
      totalCarryovers,
      affectedStudents: processedStudents.filter(s => s.carryovers > 0).length
    };
    computationSummary.failedStudents = failedStudents;
    computationSummary.completedAt = new Date();
    computationSummary.duration = Date.now() - computationSummary.startedAt.getTime();
    
    await computationSummary.save();

    // Lock semester if all successful
    if (failedStudents.length === 0) {
      const lockSession = await mongoose.startSession();
      try {
        lockSession.startTransaction();
        
        await Semester.findByIdAndUpdate(
          activeSemester._id,
          {
            isLocked: true,
            lockedAt: new Date(),
            lockedBy: computedBy
          },
          { session: lockSession }
        );
        
        await lockSession.commitTransaction();
        console.log(`Locked semester ${activeSemester.name} for ${department.name}`);
      } catch (error) {
        await lockSession.abortTransaction();
        console.error("Failed to lock semester:", error);
      } finally {
        lockSession.endSession();
      }
    }

    // Queue HOD notification
    if (department.hod) {
      await queueNotification(
        "hod",
        department.hod,
        "department_results_computed",
        `Results computation for ${department.name} - ${activeSemester.name} completed.
        Students: ${studentsWithResults}/${totalStudents}
        Average GPA: ${averageGPA.toFixed(2)}
        Carryovers: ${totalCarryovers} (${computationSummary.carryoverStats.affectedStudents} students)
        ${failedStudents.length > 0 ? `Failed: ${failedStudents.length} students` : ''}`,
        {
          department: department.name,
          semester: activeSemester.name,
          studentsProcessed: studentsWithResults,
          averageGPA: averageGPA.toFixed(2),
          carryoverCount: totalCarryovers,
          failedCount: failedStudents.length
        }
      );
    }

    // Update master computation
    const updateSession = await mongoose.startSession();
    try {
      updateSession.startTransaction();
      
      await MasterComputation.findByIdAndUpdate(
        masterComputationId,
        {
          $push: { departmentSummaries: computationSummary._id },
          $inc: { 
            departmentsProcessed: 1,
            totalStudents: studentsWithResults,
            totalFailedStudents: failedStudents.length,
            totalCarryovers: totalCarryovers
          }
        },
        { session: updateSession }
      );
      
      await updateSession.commitTransaction();
    } catch (error) {
      await updateSession.abortTransaction();
      console.error("Failed to update master computation:", error);
    } finally {
      updateSession.endSession();
    }

    console.log(`Completed department ${department.name}: ${studentsWithResults} students, ${totalCarryovers} carryovers`);
    
    return {
      success: true,
      summaryId: computationSummary._id,
      department: department.name,
      studentsProcessed: studentsWithResults,
      totalCarryovers,
      averageGPA,
      semesterLocked: failedStudents.length === 0
    };

  } catch (error) {
    console.error(`Department job failed:`, error);
    
    computationSummary.status = "failed";
    computationSummary.error = error.message;
    computationSummary.completedAt = new Date();
    computationSummary.duration = Date.now() - computationSummary.startedAt.getTime();
    await computationSummary.save();

    if (department?.hod) {
      await queueNotification(
        "hod",
        department.hod,
        "department_computation_failed",
        `Results computation for ${department.name} failed. Error: ${error.message}`,
        {
          department: department.name,
          error: error.message
        }
      );
    }

    throw error;
  }
};

// ==================== QUEUE SETUP ====================

departmentQueue.process(3, async (job) => {
  return await processDepartmentJob(job);
});

// ==================== MAIN CONTROLLERS ====================

export const computeAllResults = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();
    const computedBy = req.user._id;

    // Get all active departments
    const departments = await Department.find({ 
      status: "active" 
    }).session(session);

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
          approved: true
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

    // Add each department to processing queue
    for (const dept of departmentsToProcess) {
      await departmentQueue.add("department-computation", {
        departmentId: dept.departmentId,
        masterComputationId: masterComputation._id,
        computedBy,
        jobId: `dept-${dept.departmentId}-${Date.now()}`
      }, {
        jobId: `dept-${dept.departmentId}-${masterComputation._id}`,
        priority: 1
      });
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
    const department = await Department.findById(departmentId).select("name code");
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

    const student = await Student.findById(studentId)
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
    await Student.findByIdAndUpdate(
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

export const calculateStudentCGPA = async (req, res) => {
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