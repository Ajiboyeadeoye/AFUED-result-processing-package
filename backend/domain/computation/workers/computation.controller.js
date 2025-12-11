// computation/workers/computation.controller.js
import mongoose from "mongoose";
import { ACADEMIC_RULES, BATCH_SIZE, NOTIFICATION_BATCH_SIZE } from "../utils/computationConstants.js";
import StudentService from "../services/StudentService.js";
import ResultService from "../services/ResultService.js";
import GPACalculator from "../services/GPACalculator.js";
import AcademicStandingEngine from "../services/AcademicStandingEngine.js";
import CarryoverService from "../services/CarryoverService.js";
import SummaryListBuilder from "../services/SummaryListBuilder.js";
import BulkWriter from "../services/BulkWriter.js";
import ReportService from "../services/ReportService.js";
import Result from "../../result/result.model.js";
import ComputationSummary from "../../result/computation.model.js";
import MasterComputation from "../../result/masterComputation.model.js";
import CarryoverCourse from "../../result/carryover.model.js";
import studentSemseterResultModel from "../../student/student.semseterResult.model.js";
// import studentModel from "../../student/student.model.js";
import departmentModel from "../../department/department.model.js";
import Semester from "../../semester/semester.model.js";
import courseModel from "../../course/course.model.js";
import { addDepartmentJob, departmentQueue, queueNotification } from "../../../workers/department.queue.js";
import { randomUUID } from "crypto";
import buildResponse from "../../../utils/responseBuilder.js";
import studentModel from "../../student/student.model.js";

// ==================== DEPARTMENT JOB PROCESSOR ====================

/**
 * Updates the master computation document with department summary stats.
 * If master computation is not found, it just logs a warning.
 */
export async function updateMasterComputation(masterComputationId, summaryId, departmentName, stats) {
    if (!masterComputationId) {
        console.warn(`No masterComputationId provided for department ${departmentName}`);
        return;
    }

    const masterComp = await MasterComputation.findById(masterComputationId);
    if (!masterComp) {
        console.warn(`MasterComputation ${masterComputationId} not found for department ${departmentName}`);
        return;
    }

    // Ensure there's a "departmentSummaries" field in MasterComputation schema
    masterComp.departmentSummaries = masterComp.departmentSummaries || {};

    masterComp.departmentSummaries[departmentName] = {
        summaryId,
        ...stats,
        updatedAt: new Date()
    };
    masterComp.departmentsProcessed = (masterComp.departmentsProcessed || 0) + 1;

    if (masterComp.departmentsProcessed >= masterComp.totalDepartments) {
        // Check for errors
        const hasErrors = Object.values(masterComp.departmentSummaries)
            .some(dept => dept.failedStudentsCount > 0);

        masterComp.status = hasErrors ? "completed_with_errors" : "completed";
        masterComp.completedAt = new Date();
        masterComp.duration = Date.now() - masterComp.startedAt.getTime();
    }
    await masterComp.save();
    console.log(`✅ Master computation updated for department ${departmentName}`);
}

export const processDepartmentJob = async (job) => {
    const {
        departmentId,
        masterComputationId,
        computedBy,
        jobId,
        isRetry = false
    } = job.data;

    console.log(`Processing department job: ${jobId} for department ${departmentId}`);

    // Initialize services
    const bulkWriter = new BulkWriter();

    const resultService = ResultService
    // Get department and semester
    const department = await StudentService.getDepartmentDetails(departmentId);
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

    // Initialize or retrieve computation summary
    let computationSummary = await initializeComputationSummary(
        departmentId,
        activeSemester._id,
        masterComputationId,
        computedBy,
        isRetry
    );

    // Initialize counters and buffers
    const counters = initializeCounters();
    const buffers = initializeBuffers();
    const gradeDistribution = initializeGradeDistribution();
    const levelStats = {};

    // Memory-efficient tracking
    const processedStudentIds = new Set();

    try {
        // Get student IDs for processing
        const studentIds = await StudentService.getStudentIds(departmentId);
        console.log(`Processing ${studentIds.length} students for department ${department.name}`);

        // Process students in batches
        for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
            const studentBatch = studentIds.slice(i, i + BATCH_SIZE);

            // Process batch
            const batchResults = await processStudentBatch(
                studentBatch,
                department,
                activeSemester,
                computationSummary,
                computedBy,
                counters,
                buffers,
                gradeDistribution,
                levelStats,
                processedStudentIds,
                bulkWriter,
                resultService
            );

            // Update job progress
            const progress = Math.min(((i + studentBatch.length) / studentIds.length) * 100, 100);
            // await job.progress(progress);

            // Process bulk operations
            await bulkWriter.executeBulkWrites();
        }

        // Process any remaining bulk operations
        await bulkWriter.executeBulkWrites();

        // Reupdate computation summary due to changes from bulk rewite
        computationSummary = await ComputationSummary.findById(computationSummary._id);
        // Finalize computation
        await finalizeComputation(
            computationSummary,
            counters,
            buffers,
            gradeDistribution,
            levelStats,
            department,
            activeSemester,
            computedBy,
            masterComputationId,
            bulkWriter
        );

        await updateMasterComputationAfterDepartment(
            masterComputationId,
            department.name,
            computationSummary._id,
            {
                studentsProcessed: counters.studentsWithResults,
                passListCount: buffers.passList.length,
                probationListCount: buffers.probationList.length,
                withdrawalListCount: buffers.withdrawalList.length,
                terminationListCount: buffers.terminationList.length,
                carryoverCount: counters.totalCarryovers,
                averageGPA: counters.studentsWithResults > 0
                    ? counters.totalGPA / counters.studentsWithResults
                    : 0,
                failedStudentsCount: buffers.failedStudents.length,
                status: buffers.failedStudents.length > 0
                    ? "completed_with_errors"
                    : "completed"
            }
        );

        console.log(`✅ Completed department ${department.name}: 
      ${counters.studentsWithResults} students processed
      ${counters.totalCarryovers} carryovers
      ${counters.affectedStudentsCount} students with carryovers
      Pass List: ${buffers.passList.length} students
      Probation List: ${buffers.probationList.length} students
      Withdrawal List: ${buffers.withdrawalList.length} students
      Termination List: ${buffers.terminationList.length} students
      ${buffers.failedStudents.length} failed students`);

        return {
            success: true,
            summaryId: computationSummary._id,
            department: department.name,
            studentsProcessed: counters.studentsWithResults,
            passListCount: buffers.passList.length,
            probationListCount: buffers.probationList.length,
            withdrawalListCount: buffers.withdrawalList.length,
            terminationListCount: buffers.terminationList.length,
            carryoverCount: counters.totalCarryovers,
            averageGPA: counters.totalGPA / counters.studentsWithResults,
            semesterLocked: buffers.failedStudents.length === 0,
            reportGenerated: true
        };

    } catch (error) {
        console.error(`Department job failed:`, error);
        await handleJobFailure(computationSummary, department, activeSemester, error);
        throw error;
    }
};

// ==================== HELPER FUNCTIONS ====================

async function getActiveSemesterForDepartment(departmentId) {
    return await Semester.findOne({
        department: departmentId,
        isActive: true,
    });
}

async function initializeComputationSummary(departmentId, semesterId, masterComputationId, computedBy, isRetry) {
    let computationSummary;

    if (isRetry) {
        computationSummary = await ComputationSummary.findOne({
            department: departmentId,
            semester: semesterId,
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
            semester: semesterId,
            masterComputationId,
            status: "processing",
            computedBy,
            startedAt: new Date()
        });
        await computationSummary.save();
    }

    return computationSummary;
}

function initializeCounters() {
    return {
        totalStudents: 0,
        studentsWithResults: 0,
        totalGPA: 0,
        highestGPA: 0,
        lowestGPA: 5.0,
        totalCarryovers: 0,
        affectedStudentsCount: 0
    };
}

function initializeBuffers() {
    return {
        passList: [],
        probationList: [],
        withdrawalList: [],
        terminationList: [],
        carryoverStudents: [],
        failedStudents: [],
        notificationQueue: [],
        notificationBatchSize: NOTIFICATION_BATCH_SIZE
    };
}

function initializeGradeDistribution() {
    return {
        firstClass: 0,
        secondClassUpper: 0,
        secondClassLower: 0,
        thirdClass: 0,
        fail: 0
    };
}

async function processStudentBatch(
    studentIds,
    department,
    activeSemester,
    computationSummary,
    computedBy,
    counters,
    buffers,
    gradeDistribution,
    levelStats,
    processedStudentIds,
    bulkWriter,
    resultService,
) {
    // Fetch student details and results in parallel
    const [students, resultsByStudent] = await Promise.all([
        StudentService.getStudentsWithDetails(studentIds),
        ResultService.getResultsByStudents(studentIds, activeSemester._id)
    ]);

    const batchPromises = students.map(async (student) => {
        counters.totalStudents++;

        try {
            const studentResults = resultsByStudent[student._id.toString()];

            if (!studentResults || studentResults.length === 0) {
                await CarryoverService.handleMissingResults(
                    student._id,
                    department._id,
                    activeSemester._id,
                    computationSummary._id
                );
                return null;
            }

            // Process student results
            const studentResult = await processStudentResults(
                student,
                studentResults,
                department,
                activeSemester,
                computationSummary,
                computedBy,
                counters,
                buffers,
                gradeDistribution,
                levelStats,
                bulkWriter,
                resultService
            );

            processedStudentIds.add(student._id.toString());
            return studentResult;

        } catch (error) {
            return handleStudentProcessingError(student, error, buffers, department, activeSemester);
        }
    });

    return await Promise.allSettled(batchPromises);
}

async function processStudentResults(
    student,
    results,
    department,
    activeSemester,
    computationSummary,
    computedBy,
    counters,
    buffers,
    gradeDistribution,
    levelStats,
    bulkWriter,
    resultService
) {
    // In processStudentResults or batch processing:
    if (buffers.notificationQueue.length >= buffers.notificationBatchSize) {
        await flushNotifications(buffers.notificationQueue);
        buffers.notificationQueue = [];
    }

    async function flushNotifications(notifications) {
        await ReportService.sendStudentNotifications(notifications);
    }
    // Initialize level stats
    if (!levelStats[student.level]) {
        levelStats[student.level] = initializeLevelStats();
    }
    levelStats[student.level].totalStudents++;

    // Calculate semester GPA
    const gpaData = GPACalculator.calculateSemesterGPA(results);

    // Calculate CGPA
    const cgpaData = await GPACalculator.calculateStudentCGPAOptimized(
        student._id,
        activeSemester._id,
        gpaData.semesterGPA,
        gpaData.totalPoints,
        gpaData.totalUnits
    );

    // Process failed courses
    if (gpaData.failedCount > 0) {
        await processFailedCourses(
            student,
            gpaData.failedCourses,
            activeSemester._id,
            department._id,
            computationSummary._id,
            computedBy,
            counters
        );
    }

    // Determine academic standing
    const academicStanding = AcademicStandingEngine.determineAcademicStandingOptimized(
        student,
        gpaData.semesterGPA,
        cgpaData.cgpa,
        student.totalCarryovers + gpaData.failedCount
    );

    // Update student record
    await updateStudentRecord(student, gpaData, cgpaData, academicStanding, gpaData.failedCount, bulkWriter);

    // ✅ CREATE SEMESTER RESULT RECORD
    const semesterResultData = await buildStudentSemesterResult(
        student,
        results,
        department,
        activeSemester,
        gpaData,
        cgpaData,
        academicStanding,
        computedBy,
        computationSummary,
        resultService
    );
    console.log("Smester Result data: ", semesterResultData)

    // Add to bulk writer for batch insertion
    bulkWriter.addSemesterResultUpdate(null, semesterResultData);


    // Update statistics
    updateStatistics(
        student,
        gpaData,
        cgpaData,
        counters,
        gradeDistribution,
        levelStats,
        academicStanding,
        buffers
    );

    // Queue notification
    buffers.notificationQueue.push({
        studentId: student._id,
        studentName: student.name,
        studentEmail: student.email,
        semesterGPA: gpaData.semesterGPA,
        currentCGPA: cgpaData.cgpa,
        studentCarryovers: gpaData.failedCount,
        academicStanding,
        activeSemesterName: activeSemester.name,
        departmentName: department.name
    });

    return {
        studentId: student._id,
        success: true,
        standing: academicStanding.remark
    };
}
async function buildStudentSemesterResult(
    student,
    results,
    department,
    activeSemester,
    gpaData,
    cgpaData,
    academicStanding,
    computedBy,
    computationSummary,
    resultService
) {
    const courseDetails = [];

    // Process each course result
    for (const result of results) {
        const gradeInfo = GPACalculator.calculateGradeAndPoints(result.score);
        const courseDetailsFromDB = await resultService.getCourseDetails(result.courseId?._id || result.courseId);

        courseDetails.push({
            courseId: result.courseId?._id || result.courseId,
            courseUnit: result.courseUnit || courseDetailsFromDB?.unit || 1,
            score: result.score,
            grade: gradeInfo.grade,
            gradePoint: gradeInfo.point,
            isCoreCourse: courseDetailsFromDB?.isCoreCourse || false,
            isCarryover: result.isCarryover || false
        });
    }

    return {
        studentId: student._id,
        departmentId: department._id,
        semesterId: activeSemester._id,
        courses: courseDetails,
        gpa: gpaData.semesterGPA,
        cgpa: cgpaData.cgpa,
        totalUnits: gpaData.totalUnits,
        totalPoints: gpaData.totalPoints,
        carryoverCount: gpaData.failedCount,
        remark: academicStanding.remark,
        status: "processed",
        computedBy,
        computationSummaryId: computationSummary._id
    };
}
function initializeLevelStats() {
    return {
        totalStudents: 0,
        totalGPA: 0,
        totalCarryovers: 0,
        highestGPA: 0,
        lowestGPA: 5.0,
        gradeDistribution: initializeGradeDistribution()
    };
}

async function processFailedCourses(
    student,
    failedCourses,
    semesterId,
    departmentId,
    computationSummaryId,
    computedBy,
    counters
) {
    counters.totalCarryovers += failedCourses.length;
    counters.affectedStudentsCount++;

    // Process carryovers
    const carryoverBuffers = await CarryoverService.processFailedCourses(
        failedCourses,
        student._id,
        semesterId,
        departmentId,
        computationSummaryId,
        computedBy
    );

    // Add to bulk writer (implementation depends on your BulkWriter interface)
    // bulkWriter.addCarryovers(carryoverBuffers);
}

async function updateStudentRecord(student, gpaData, cgpaData, academicStanding, failedCount, bulkWriter) {
    // const bulkWriter = new BulkWriter()
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

function updateStatistics(
    student,
    gpaData,
    cgpaData,
    counters,
    gradeDistribution,
    levelStats,
    academicStanding,
    buffers
) {
    counters.studentsWithResults++;
    counters.totalGPA += gpaData.semesterGPA;

    // Update high/low GPA
    if (gpaData.semesterGPA > counters.highestGPA) counters.highestGPA = gpaData.semesterGPA;
    if (gpaData.semesterGPA < counters.lowestGPA && gpaData.semesterGPA > 0) {
        counters.lowestGPA = gpaData.semesterGPA;
    }

    // Update level stats
    levelStats[student.level].totalGPA += gpaData.semesterGPA;
    if (gpaData.semesterGPA > levelStats[student.level].highestGPA) {
        levelStats[student.level].highestGPA = gpaData.semesterGPA;
    }
    if (gpaData.semesterGPA < levelStats[student.level].lowestGPA && gpaData.semesterGPA > 0) {
        levelStats[student.level].lowestGPA = gpaData.semesterGPA;
    }

    // Update grade distribution
    const classification = GPACalculator.getGradeClassification(gpaData.semesterGPA);
    gradeDistribution[classification]++;
    levelStats[student.level].gradeDistribution[classification]++;

    // Add student to appropriate lists
    const listEntries = SummaryListBuilder.addStudentToLists(
        student,
        academicStanding,
        gpaData.semesterGPA,
        gpaData.failedCount,
        gpaData.failedCourses
    );

    // Add to buffers
    if (listEntries.passList) buffers.passList.push(listEntries.passList);
    if (listEntries.probationList) buffers.probationList.push(listEntries.probationList);
    if (listEntries.withdrawalList) buffers.withdrawalList.push(listEntries.withdrawalList);
    if (listEntries.terminationList) buffers.terminationList.push(listEntries.terminationList);
    if (listEntries.carryoverList) buffers.carryoverStudents.push(listEntries.carryoverList);
}

function handleStudentProcessingError(student, error, buffers, department, activeSemester) {
    console.error(`Error processing student ${student.matricNumber}:`, error);

    const failedStudent = {
        studentId: student._id,
        matricNumber: student.matricNumber,
        name: student.name,
        error: error.message,
        notified: false
    };

    buffers.failedStudents.push(failedStudent);

    // Queue error notification
    buffers.notificationQueue.push({
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

async function finalizeComputation(
    computationSummary,
    counters,
    buffers,
    gradeDistribution,
    levelStats,
    department,
    activeSemester,
    computedBy,
    masterComputationId,
    bulkWriter
) {
    computationSummary = await ComputationSummary.findById(computationSummary._id);

    // Calculate final statistics
    const summaryStats = SummaryListBuilder.buildSummaryStats(counters, gradeDistribution, levelStats);

    // Get detailed carryover info
    const detailedCarryoverInfo = await CarryoverService.getDetailedCarryoverInfo(
        buffers.carryoverStudents,
        activeSemester._id
    );

    // Prepare summary data
    const summaryData = {
        ...summaryStats,
        passList: buffers.passList,
        probationList: buffers.probationList,
        withdrawalList: buffers.withdrawalList,
        terminationList: buffers.terminationList,
        carryoverStats: {
            totalCarryovers: counters.totalCarryovers,
            affectedStudentsCount: counters.affectedStudentsCount,
            affectedStudents: detailedCarryoverInfo
        },
        failedStudents: buffers.failedStudents,
        additionalMetrics: {
            levelStats,
            // Add repeat ranking if needed
        }
    };

    // Update computation summary
    await bulkWriter.updateComputationSummary(computationSummary._id, summaryData);

    // // Generate report asynchronously
    // ReportService.generateReportAsync(
    //     computationSummary._id,
    //     department,
    //     activeSemester,
    //     summaryStats
    // );

    // Lock semester if successful
    if (buffers.failedStudents.length === 0) {
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

    // ✅ REFRESH SUMMARY BEFORE SENDING
    computationSummary = await ComputationSummary.findById(computationSummary._id)
        .populate('department', 'name code hod')
        .populate('semester', 'name');

    // ✅ VERIFY DATA IS PRESENT
    if (!computationSummary.averageGPA &&
        !computationSummary.studentsWithResults) {
        console.warn("Summary data incomplete, delaying HOD notification");
        // Optionally retry or queue for later
    }

    await updateMasterComputation(
        masterComputationId,
        computationSummary._id,
        department.name,
        {
            studentsProcessed: counters.studentsWithResults,
            failedStudentsCount: buffers.failedStudents.length,
            totalCarryovers: counters.totalCarryovers,
            affectedStudentsCount: counters.affectedStudentsCount,
            passListCount: buffers.passList.length,
            probationListCount: buffers.probationList.length,
            withdrawalListCount: buffers.withdrawalList.length,
            terminationListCount: buffers.terminationList.length,
            averageGPA: counters.studentsWithResults > 0
                ? counters.totalGPA / counters.studentsWithResults
                : 0
        }
    );


    // Send HOD notification
    await ReportService.sendHODNotification(department, activeSemester, computationSummary);

    // Send student notifications
    await ReportService.sendStudentNotifications(buffers.notificationQueue);

    // Update master computation
    await updateMasterComputation(masterComputationId, computationSummary._id, department.name, {
        studentsWithResults: counters.studentsWithResults,
        failedStudentsCount: buffers.failedStudents.length,
        totalCarryovers: counters.totalCarryovers,
        affectedStudentsCount: counters.affectedStudentsCount,
        passListCount: buffers.passList.length,
        probationListCount: buffers.probationList.length,
        withdrawalListCount: buffers.withdrawalList.length,
        terminationListCount: buffers.terminationList.length
    });
}

async function handleJobFailure(computationSummary, department, activeSemester, error) {
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
                // progress: job.progress(),
                progress: null,
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
/**
 * Update master computation after a department completes
 */
async function updateMasterComputationAfterDepartment(
    masterComputationId,
    departmentName,
    summaryId,
    stats
) {
    try {
        const masterComp = await MasterComputation.findById(masterComputationId);
        if (!masterComp) {
            console.warn(`MasterComputation ${masterComputationId} not found`);
            return;
        }

        // Increment processed count
        masterComp.departmentsProcessed = (masterComp.departmentsProcessed || 0) + 1;

        // Update department summaries
        masterComp.departmentSummaries = masterComp.departmentSummaries || {};
        masterComp.departmentSummaries[departmentName] = {
            summaryId,
            ...stats,
            updatedAt: new Date()
        };

        // Update overall status if all departments are done
        if (masterComp.departmentsProcessed >= masterComp.totalDepartments) {
            // Check if any departments have errors
            const hasErrors = Object.values(masterComp.departmentSummaries)
                .some(dept => dept.failedStudentsCount > 0);

            masterComp.status = hasErrors ? "completed_with_errors" : "completed";
            masterComp.completedAt = new Date();
            masterComp.duration = Date.now() - masterComp.startedAt.getTime();

            // Calculate overall statistics
            await calculateMasterComputationStats(masterComp);
        }

        await masterComp.save();
        console.log(`✅ Master computation updated for department ${departmentName}`);

    } catch (error) {
        console.error(`Failed to update master computation:`, error);
    }
}

/**
 * Update master computation when a department fails
 */
async function updateMasterComputationOnFailure(
    masterComputationId,
    departmentName,
    errorMessage
) {
    try {
        const masterComp = await MasterComputation.findById(masterComputationId);
        if (!masterComp) return;

        // Mark as failed in department summaries
        masterComp.departmentSummaries = masterComp.departmentSummaries || {};
        masterComp.departmentSummaries[departmentName] = {
            error: errorMessage,
            status: "failed",
            updatedAt: new Date()
        };

        // Still increment processed count (even though failed)
        masterComp.departmentsProcessed = (masterComp.departmentsProcessed || 0) + 1;

        // Update overall status if all departments are done
        if (masterComp.departmentsProcessed >= masterComp.totalDepartments) {
            masterComp.status = "completed_with_errors";
            masterComp.completedAt = new Date();
            masterComp.duration = Date.now() - masterComp.startedAt.getTime();
        }

        await masterComp.save();

    } catch (error) {
        console.error(`Failed to update master computation on failure:`, error);
    }
}

/**
 * Calculate overall statistics for master computation
 */
async function calculateMasterComputationStats(masterComp) {
    try {
        const summaries = Object.values(masterComp.departmentSummaries || {});

        if (summaries.length === 0) return;

        // Calculate totals
        let totalStudents = 0;
        let totalGPA = 0;
        let totalCarryovers = 0;
        let totalFailedStudents = 0;
        let departmentsWithData = 0;

        for (const dept of summaries) {
            if (dept.studentsProcessed > 0) {
                totalStudents += dept.studentsProcessed;
                totalGPA += (dept.averageGPA || 0);
                totalCarryovers += (dept.carryoverCount || 0);
                totalFailedStudents += (dept.failedStudentsCount || 0);
                departmentsWithData++;
            }
        }

        // Update master computation with overall stats
        masterComp.totalStudents = totalStudents;
        masterComp.totalCarryovers = totalCarryovers;
        masterComp.totalFailedStudents = totalFailedStudents;

        if (departmentsWithData > 0) {
            masterComp.overallAverageGPA = parseFloat((totalGPA / departmentsWithData).toFixed(2));
        }

        await masterComp.save();

    } catch (error) {
        console.error(`Failed to calculate master computation stats:`, error);
    }
}