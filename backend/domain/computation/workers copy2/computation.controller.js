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
import studentModel from "../../student/student.model.js";
import departmentModel from "../../department/department.model.js";
import Semester from "../../semester/semester.model.js";
import courseModel from "../../course/course.model.js";
import { addDepartmentJob, departmentQueue, queueNotification } from "../../../workers/department.queue.js";
import { randomUUID } from "crypto";
import buildResponse from "../../../utils/responseBuilder.js";
import SemesterService from "../../semester/semester.service.js";
import { processPreviewDepartmentJob } from "./previewComputation.controller.js";
import { getDepartmentLeadershipDetails } from "../services/helpers.js";

// ==================== DEPARTMENT JOB PROCESSOR ====================

/**
 * Updates the master computation document with department summary stats.
 * Only increments departmentsProcessed once per department.
 */
export async function updateMasterComputationStats(masterComputationId, departmentName, stats) {
    const masterComp = await MasterComputation.findById(masterComputationId);

    if (!masterComp.departmentSummaries) {
        masterComp.departmentSummaries = new Map();
    }

    const wasAlreadyProcessed = masterComp.departmentSummaries.get(departmentName)?.processed;

    if (!wasAlreadyProcessed) {
        masterComp.departmentsProcessed = (masterComp.departmentsProcessed || 0) + 1;
    }

    masterComp.departmentSummaries.set(departmentName, {
        ...stats,
        processed: true,
        updatedAt: new Date()
    });


    // Check if all departments are processed
    if (masterComp.departmentsProcessed >= masterComp.totalDepartments) {
        // Calculate final overall statistics
        const summaries = Array.from(masterComp.departmentSummaries.values());

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

        // Update overall stats
        masterComp.totalStudents = totalStudents;
        masterComp.totalCarryovers = totalCarryovers;
        masterComp.totalFailedStudents = totalFailedStudents;

        if (departmentsWithData > 0) {
            masterComp.overallAverageGPA = parseFloat((totalGPA / departmentsWithData).toFixed(2));
        }

        // Determine final status
        const hasErrors = summaries.some(dept => dept.failedStudentsCount > 0);
        masterComp.status = hasErrors ? "completed_with_errors" : "completed";
        masterComp.completedAt = new Date();
        masterComp.duration = Date.now() - masterComp.startedAt.getTime();
    }

    await masterComp.save();
    console.log(`✅ Updated master computation for ${departmentName}: ${masterComp.departmentsProcessed}/${masterComp.totalDepartments}`);
}

export const processDepartmentJob = async (job) => {
    const {
        departmentId,
        masterComputationId,
        computedBy,
        jobId,
        isRetry = false,
        isPreview = false,
        purpose = 'final',
        isFinal = true
    } = job.data;

    console.log(`Processing department job: ${jobId} for department ${departmentId}`);
    console.log(`Job type: ${isPreview ? 'PREVIEW' : 'FINAL'}, Purpose: ${purpose}, isFinal: ${isFinal}`);

    // FIXED: Clear logic for determining job type
    const isPreviewJob = isPreview || purpose === 'preview' || purpose === 'simulation' || !isFinal;

    // If it's a preview job, use the preview processor
    if (isPreviewJob) {
        console.log(`Routing to preview processor for department ${departmentId}`);
        try {
            const { processPreviewDepartmentJob } = await import('./previewComputation.controller.js');
            return await processPreviewDepartmentJob(job);
        } catch (error) {
            console.error(`Failed to load preview processor: ${error}`);
            throw new Error(`Preview processing failed: ${error.message}`);
        }
    }

    // Continue with regular processing for final jobs
    console.log(`Processing as FINAL job for department ${departmentId}`);

    // Initialize services
    const bulkWriter = new BulkWriter();

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

    // Initialize counters and buffers - UPDATED for level-based organization
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
                bulkWriter
            );

            // Update job progress
            const progress = Math.min(((i + studentBatch.length) / studentIds.length) * 100, 100);
            // await job.progress(progress); // Commented out as job object might not have progress method

            // Process bulk operations if buffer is full
            if (bulkWriter.shouldFlush()) {
                await bulkWriter.executeBulkWrites();
            }
        }

        // Process any remaining bulk operations
        await bulkWriter.executeBulkWrites();

        // Re-fetch computation summary due to changes from bulk write
        computationSummary = await ComputationSummary.findById(computationSummary._id);

        // Finalize computation - UPDATED for level-based organization
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

        // Send any remaining notifications
        if (buffers.notificationQueue.length > 0) {
            await ReportService.sendStudentNotifications(buffers.notificationQueue);
        }

        // Update master computation - ONLY CALL THIS ONCE
        await updateMasterComputationStats(
            masterComputationId,
            department.name,
            {
                studentsProcessed: counters.studentsWithResults,
                passListCount: buffers.flatLists.passList.length,
                probationListCount: buffers.flatLists.probationList.length,
                withdrawalListCount: buffers.flatLists.withdrawalList.length,
                terminationListCount: buffers.flatLists.terminationList.length,
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
      Pass List: ${buffers.flatLists.passList.length} students
      Probation List: ${buffers.flatLists.probationList.length} students
      Withdrawal List: ${buffers.flatLists.withdrawalList.length} students
      Termination List: ${buffers.flatLists.terminationList.length} students
      ${buffers.failedStudents.length} failed students`);

        return {
            success: true,
            summaryId: computationSummary._id,
            department: department.name,
            studentsProcessed: counters.studentsWithResults,
            passListCount: buffers.flatLists.passList.length,
            probationListCount: buffers.flatLists.probationList.length,
            withdrawalListCount: buffers.flatLists.withdrawalList.length,
            terminationListCount: buffers.flatLists.terminationList.length,
            carryoverCount: counters.totalCarryovers,
            averageGPA: counters.studentsWithResults > 0 ? counters.totalGPA / counters.studentsWithResults : 0,
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
    return await SemesterService.getActiveDepartmentSemester(departmentId);
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
            return computationSummary;
        }
    }

    // Create new summary
    computationSummary = new ComputationSummary({
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
        // Level-based organization
        studentSummariesByLevel: {}, // { [level]: [studentSummary] }
        listEntriesByLevel: {}, // { [level]: [listEntry] }
        keyToCoursesByLevel: {}, // { [level]: [course] }

        // Old flat lists for backward compatibility (deprecated but still used in some places)
        flatLists: {
            passList: [],
            probationList: [],
            withdrawalList: [],
            terminationList: [],
            carryoverStudents: [],
        },

        // Other buffers
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
    bulkWriter
) {
    // Fetch student details and results in parallel
    const [students, resultsByStudent] = await Promise.all([
        StudentService.getStudentsWithDetails(studentIds),
        ResultService.getResultsByStudents(studentIds, activeSemester._id)
    ]);

    const batchPromises = students.map(async (student) => {
        counters.totalStudents++;

        // Check if already processed (for retry scenarios)
        if (processedStudentIds.has(student._id.toString())) {
            return null;
        }

        try {
            const studentResults = resultsByStudent[student._id.toString()] || [];

            if (!studentResults || studentResults.length === 0) {
                await CarryoverService.handleMissingResults(
                    student._id,
                    department._id,
                    activeSemester._id,
                    computationSummary._id
                );
                return null;
            }

            // Process student results - UPDATED for level-based organization
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
                bulkWriter
            );

            processedStudentIds.add(student._id.toString());
            return studentResult;

        } catch (error) {
            return handleStudentProcessingError(student, error, buffers, department, activeSemester);
        }
    });

    return await Promise.allSettled(batchPromises);
}

async function flushNotifications(notifications) {
    if (notifications.length === 0) return;
    await ReportService.sendStudentNotifications(notifications);
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
    bulkWriter
) {
    // Calculate semester GPA with detailed breakdown for master sheet
    const gpaData = GPACalculator.calculateSemesterGPA(results);

    // Calculate CGPA with TCP/TNU for master sheet
    const cgpaData = await GPACalculator.calculateStudentCGPAWithTCP(
        student._id,
        activeSemester._id,
        gpaData.totalCreditPoints,
        gpaData.totalUnits
    );

    // Determine academic standing
    const academicStanding = await AcademicStandingEngine.determineAcademicStanding(
        student,
        gpaData.semesterGPA,
        cgpaData.cgpa,
        student.totalCarryovers + gpaData.failedCount
    );

    // ✅ CRITICAL FIX: Check if student is terminated/withdrawn BEFORE calculating outstanding courses
    const academicRemark = (academicStanding.remark || '').toUpperCase();
    const academicStatus = (academicStanding.status || '').toLowerCase();

    const isTerminatedOrWithdrawn =
        academicRemark.includes('TERMINATED') ||
        academicRemark.includes('WITHDRAW') ||
        academicStatus.includes('terminated') ||
        academicStatus.includes('withdraw') ||
        academicStatus.includes('withdrawal');

    let outstandingCourses = [];

    // Only calculate outstanding courses if NOT in termination/withdrawal status
    if (!isTerminatedOrWithdrawn) {
        // Calculate outstanding courses for active students
        outstandingCourses = await GPACalculator.calculateOutstandingCourses(
            student._id,
            activeSemester._id
        );

        console.log(`✅ Calculated ${outstandingCourses.length} outstanding courses for ${student.matricNumber}`);
    } else {
        // Skip outstanding courses for terminated/withdrawn students
        console.log(`⚠️ Skipping outstanding courses for ${student.matricNumber} - Status: ${academicStanding.remark}`);
    }

    // Calculate academic history for MMS2 (calculate regardless of status)
    const academicHistory = await GPACalculator.calculateAcademicHistory(student._id);

    // Build student summary for master sheet - UPDATED for level-based organization
    const studentLevel = student.level || "100";
    const studentSummary = SummaryListBuilder.buildStudentSummary(
        student,
        gpaData,
        cgpaData,
        academicStanding,
        outstandingCourses, // This will be empty array for terminated/withdrawn students
        academicHistory
    );



    // Add to level-based buffers
    if (!buffers.studentSummariesByLevel[studentLevel]) {
        buffers.studentSummariesByLevel[studentLevel] = [];
    }
    buffers.studentSummariesByLevel[studentLevel].push(studentSummary.summary || studentSummary);

    // Build list entries - UPDATED for level-based organization
    const wasPreviouslyTerminated = student.terminationStatus === 'terminated';
    const listEntries = SummaryListBuilder.addStudentToLists(
        student,
        academicStanding,
        gpaData.semesterGPA,
        cgpaData.cgpa,
        gpaData.failedCount,
        gpaData.failedCourses,
        wasPreviouslyTerminated
    );

    // Add to level-based buffers
    if (!buffers.listEntriesByLevel[studentLevel]) {
        buffers.listEntriesByLevel[studentLevel] = [];
    }
    buffers.listEntriesByLevel[studentLevel].push(listEntries);

    // Also add to flat lists for backward compatibility
    if (listEntries.passList) buffers.flatLists.passList.push(listEntries.passList);
    if (listEntries.probationList) buffers.flatLists.probationList.push(listEntries.probationList);
    if (listEntries.withdrawalList) buffers.flatLists.withdrawalList.push(listEntries.withdrawalList);
    if (listEntries.terminationList) buffers.flatLists.terminationList.push(listEntries.terminationList);
    if (listEntries.carryoverList) buffers.flatLists.carryoverStudents.push(listEntries.carryoverList);

    // Build key to courses for this level if not already built
    if (!buffers.keyToCoursesByLevel[studentLevel]) {
        buffers.keyToCoursesByLevel[studentLevel] = await SummaryListBuilder.buildKeyToCoursesByLevel(results);
    }

    // Flush notifications if buffer is full
    if (buffers.notificationQueue.length >= buffers.notificationBatchSize) {
        await flushNotifications(buffers.notificationQueue);
        buffers.notificationQueue = [];
    }

    // Initialize level stats if not exists
    if (!levelStats[studentLevel]) {
        levelStats[studentLevel] = initializeLevelStats();
    }
    levelStats[studentLevel].totalStudents++;

    // Process failed courses (still process carryovers even if terminated?)
    if (gpaData.failedCount > 0 && !isTerminatedOrWithdrawn) {
        await processFailedCourses(
            student,
            gpaData.failedCourses,
            activeSemester._id,
            department._id,
            computationSummary._id,
            computedBy,
            counters,
            bulkWriter
        );
    } else if (gpaData.failedCount > 0 && isTerminatedOrWithdrawn) {
        console.log(`⚠️ Skipping carryover processing for terminated/withdrawn student: ${student.matricNumber}`);
    }

    // Update student record
    await updateStudentRecord(student, gpaData, cgpaData, academicStanding, gpaData.failedCount, bulkWriter);

    // CREATE SEMESTER RESULT RECORD
    const semesterResultData = await buildStudentSemesterResult(
        student,
        results,
        department,
        activeSemester,
        gpaData,
        cgpaData,
        academicStanding,
        computedBy,
        computationSummary
    );

    // Add to bulk writer for batch insertion
    bulkWriter.addSemesterResultUpdate(null, semesterResultData);

    // Update statistics - UPDATED for level-based organization
    updateStatistics(
        studentLevel,
        student,
        gpaData,
        cgpaData,
        counters,
        gradeDistribution,
        levelStats,
        academicStanding
    );

    // Queue notification (maybe skip for terminated/withdrawn?)
    if (!isTerminatedOrWithdrawn) {
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
    }

    return {
        studentId: student._id,
        success: true,
        standing: academicStanding.remark,
        isTerminatedOrWithdrawn: isTerminatedOrWithdrawn,
        outstandingCoursesCount: outstandingCourses.length,
        level: studentLevel,
        isPreview: false

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
    computationSummary
) {
    const courseDetails = [];

    // Process each course result
    for (const result of results) {
        const gradeInfo = GPACalculator.calculateGradeAndPoints(result.score);
        // Use populated course data or fallback
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
    counters,
    bulkWriter
) {
    if (failedCourses.length === 0) {
        return;
    }

    console.log(`Processing ${failedCourses.length} failed courses for student ${student._id}`);

    // Check if student is terminated/withdrawn
    // Note: This check might be redundant since we should check before calling this function
    // But it's good to have a safety check

    // Process carryovers
    const carryoverBuffers = await CarryoverService.processFailedCourses(
        failedCourses,
        student._id,
        semesterId,
        departmentId,
        computationSummaryId,
        computedBy
    );

    // Update counters based on actual carryovers created (core courses only)
    counters.totalCarryovers += carryoverBuffers.length;
    if (carryoverBuffers.length > 0) {
        counters.affectedStudentsCount++;
    }

    // DEBUG: Log what's being added to bulk writer
    console.log(`Adding ${carryoverBuffers.length} carryovers to bulk writer for student ${student._id}`);

    // Add to bulk writer
    for (const carryoverBuffer of carryoverBuffers) {
        bulkWriter.addCarryover(carryoverBuffer);
    }
}

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

function updateStatistics(
    studentLevel,
    student,
    gpaData,
    cgpaData,
    counters,
    gradeDistribution,
    levelStats,
    academicStanding
) {
    counters.studentsWithResults++;
    counters.totalGPA += gpaData.semesterGPA;

    // Update high/low GPA
    if (gpaData.semesterGPA > counters.highestGPA) counters.highestGPA = gpaData.semesterGPA;
    if (gpaData.semesterGPA < counters.lowestGPA && gpaData.semesterGPA > 0) {
        counters.lowestGPA = gpaData.semesterGPA;
    }

    // Update level stats
    const levelStat = levelStats[studentLevel];
    levelStat.totalGPA += gpaData.semesterGPA;
    if (gpaData.semesterGPA > levelStat.highestGPA) {
        levelStat.highestGPA = gpaData.semesterGPA;
    }
    if (gpaData.semesterGPA < levelStat.lowestGPA && gpaData.semesterGPA > 0) {
        levelStat.lowestGPA = gpaData.semesterGPA;
    }

    // Update grade distribution
    const classification = GPACalculator.getGradeClassification(gpaData.semesterGPA);
    gradeDistribution[classification]++;
    levelStat.gradeDistribution[classification]++;
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
    // Re-fetch computation summary due to changes from bulk write
    computationSummary = await ComputationSummary.findById(computationSummary._id);

    // Group data by level using SummaryListBuilder
    const groupedStudentSummaries = SummaryListBuilder.groupStudentSummariesByLevel(
        buffers.studentSummariesByLevel
    );

    const groupedLists = SummaryListBuilder.groupListsByLevel(
        buffers.listEntriesByLevel
    );

    // DEBUG: Check groupedLists structure
    console.log('🔍 [FINALIZE] Grouped lists structure:', Object.keys(groupedLists));
    if (groupedLists.passList && groupedLists.passList['100']) {
        console.log(`  Level 100 pass list: ${groupedLists.passList['100'].length} items`);
    }
    if (groupedLists.terminationList && groupedLists.terminationList['100']) {
        console.log(`  Level 100 termination list: ${groupedLists.terminationList['100'].length} items`);
    }

    // Calculate summary statistics with level-based organization
    const summaryStats = SummaryListBuilder.buildSummaryStatsByLevel(
        counters,
        gradeDistribution,
        levelStats
    );

    // Build summary of results by level
    const summaryOfResultsByLevel = {};
    for (const [level, stats] of Object.entries(levelStats)) {
        if (stats.totalStudents > 0) {
            const averageGPA = stats.totalGPA / stats.totalStudents;
            summaryOfResultsByLevel[level] = {
                totalStudents: stats.totalStudents,
                studentsWithResults: stats.totalStudents,

                gpaStatistics: {
                    average: parseFloat(averageGPA.toFixed(2)),
                    highest: parseFloat(stats.highestGPA.toFixed(2)),
                    lowest: parseFloat(stats.lowestGPA.toFixed(2)),
                    standardDeviation: 0 // Can be calculated if needed
                },

                classDistribution: stats.gradeDistribution
            };
        }
    }

    // Get detailed carryover info from database (not just buffers)
    const carryoverDetails = await CarryoverCourse.find({
        semester: activeSemester._id,
        department: department._id
    })
        .populate('course', 'courseCode title unit')
        .populate('student', 'matricNumber name level')
        .limit(100)
        .lean();

    // Group carryovers by level
    const carryoverStatsByLevel = {};
    for (const carryover of carryoverDetails) {
        const studentLevel = carryover.student?.level || "100";
        if (!carryoverStatsByLevel[studentLevel]) {
            carryoverStatsByLevel[studentLevel] = {
                totalCarryovers: 0,
                affectedStudentsCount: 0,
                affectedStudents: []
            };
        }

        carryoverStatsByLevel[studentLevel].totalCarryovers++;

        // Check if student already counted
        const studentIndex = carryoverStatsByLevel[studentLevel].affectedStudents
            .findIndex(s => s.studentId?.toString() === carryover.student?._id?.toString());

        if (studentIndex === -1) {
            carryoverStatsByLevel[studentLevel].affectedStudentsCount++;
            carryoverStatsByLevel[studentLevel].affectedStudents.push({
                studentId: carryover.student?._id,
                matricNumber: carryover.student?.matricNumber,
                name: carryover.student?.name,
                courseCode: carryover.course?.courseCode,
                courseTitle: carryover.course?.title
            });
        }
    }

    // Prepare student lists by level
    const studentListsByLevel = {};

    // Get all unique levels from groupedLists
    const allLevels = new Set();

    // Collect levels from each list type in groupedLists
    for (const listType of ['passList', 'probationList', 'withdrawalList', 'terminationList', 'carryoverStudents']) {
        const listData = groupedLists[listType];
        if (listData && typeof listData === 'object') {
            Object.keys(listData).forEach(level => allLevels.add(level));
        }
    }

    // Also include levels from student summaries
    for (const level in groupedStudentSummaries) {
        allLevels.add(level);
    }

    console.log(`📊 [FINALIZE] All levels found:`, Array.from(allLevels));

    // Create structure for each level
    for (const level of allLevels) {
        studentListsByLevel[level] = {
            passList: (groupedLists.passList && groupedLists.passList[level]) || [],
            probationList: (groupedLists.probationList && groupedLists.probationList[level]) || [],
            withdrawalList: (groupedLists.withdrawalList && groupedLists.withdrawalList[level]) || [],
            terminationList: (groupedLists.terminationList && groupedLists.terminationList[level]) || [],
            carryoverStudents: (groupedLists.carryoverStudents && groupedLists.carryoverStudents[level]) || []
        };

        console.log(`  Level ${level}:`);
        console.log(`    Pass: ${studentListsByLevel[level].passList.length} students`);
        console.log(`    Probation: ${studentListsByLevel[level].probationList.length} students`);
        console.log(`    Termination: ${studentListsByLevel[level].terminationList.length} students`);
        console.log(`    Carryover: ${studentListsByLevel[level].carryoverStudents.length} students`);
    }

    // ✅ FIX: Handle keyToCoursesByLevel - Fix nested structure
    // In finalizeComputation function, replace lines 911-990 with:

    // Build key to courses using the SummaryListBuilder method
    let rawKeyToCourses = {};

    // Collect all results from all levels if needed
    if (!buffers.allResults) {
        buffers.allResults = [];
        // You might need to collect results from processed students
    }

    // Use the builder method to ensure consistent structure
    rawKeyToCourses = await SummaryListBuilder.buildKeyToCoursesByLevel(buffers.allResults);

    // Debug: Check structure
    console.log('🔍 [FINALIZE] Raw keyToCourses structure:', Object.keys(rawKeyToCourses));

    // Convert to Map for Mongoose schema
    const keyToCoursesMap = new Map();
    for (const [level, courses] of Object.entries(rawKeyToCourses)) {
        if (Array.isArray(courses)) {
            keyToCoursesMap.set(level, courses);
        } else if (courses && typeof courses === 'object') {
            // Handle nested structure
            if (courses[level] && Array.isArray(courses[level])) {
                keyToCoursesMap.set(level, courses[level]);
            } else {
                console.warn(`⚠️ Level ${level}: Invalid courses structure, using empty array`);
                keyToCoursesMap.set(level, []);
            }
        } else {
            keyToCoursesMap.set(level, []);
        }
    }

    // Debug final structure
    console.log('🔍 [FINALIZE] Final keyToCoursesByLevel structure:');
    for (const [level, courses] of keyToCoursesMap.entries()) {
        console.log(`  Level ${level}: ${courses.length} courses`);
        if (courses.length > 0) {
            console.log(`    First course: ${courses[0].courseCode} - ${courses[0].title}`);
        }
    }

    const departmentDetails = await getDepartmentLeadershipDetails(
        department._id,
        activeSemester._id
    );

    // Prepare summary data for computation summary
    const summaryData = {
        ...summaryStats,
         departmentDetails,

        // Level-based data
        studentSummariesByLevel: groupedStudentSummaries,
        keyToCoursesByLevel: Object.fromEntries(keyToCoursesMap), // Use fixed structure
        studentListsByLevel,
        carryoverStatsByLevel,
        summaryOfResultsByLevel,

        // Overall data (for backward compatibility and quick access)
        totalStudents: counters.totalStudents,
        studentsWithResults: counters.studentsWithResults,
        studentsProcessed: counters.studentsWithResults,
        averageGPA: counters.studentsWithResults > 0 ?
            parseFloat((counters.totalGPA / counters.studentsWithResults).toFixed(2)) : 0,
        highestGPA: parseFloat(counters.highestGPA.toFixed(2)),
        lowestGPA: parseFloat(counters.lowestGPA.toFixed(2)),

        // Grade distribution in new format
        gradeDistribution: {
            firstClass: gradeDistribution.firstClass || 0,
            secondClassUpper: gradeDistribution.secondClassUpper || 0,
            secondClassLower: gradeDistribution.secondClassLower || 0,
            thirdClass: gradeDistribution.thirdClass || 0,
            fail: gradeDistribution.fail || 0
        },

        // Backward compatible data (deprecated but kept for compatibility)
        passList: buffers.flatLists.passList.slice(0, 100),
        probationList: buffers.flatLists.probationList.slice(0, 100),
        withdrawalList: buffers.flatLists.withdrawalList.slice(0, 100),
        terminationList: buffers.flatLists.terminationList.slice(0, 100),
        carryoverStats: {
            totalCarryovers: counters.totalCarryovers,
            affectedStudentsCount: counters.affectedStudentsCount,
            affectedStudents: buffers.flatLists.carryoverStudents.slice(0, 100).map(co => ({
                studentId: co.studentId,
                matricNumber: co.matricNumber,
                name: co.name,
                courses: co.courses,
                notes: co.notes
            }))
        },

        failedStudents: buffers.failedStudents,
        additionalMetrics: {
            levelStats
        }
    };

    // Update computation summary using BulkWriter
    await bulkWriter.updateComputationSummary(computationSummary._id, summaryData);

    // Lock semester if successful
    if (buffers.failedStudents.length === 0) {
        await SemesterService.lockSemester(activeSemester._id);
        console.log(`✅ Locked semester ${activeSemester.name} for ${department.name}`);
    } else {
        console.log(`⚠️ Semester NOT locked due to ${buffers.failedStudents.length} failed student(s)`);
    }

    // Send HOD notification with actual data
    await ReportService.sendHODNotification(department, activeSemester, {
        ...summaryStats,
        studentsWithResults: counters.studentsWithResults,
        passList: buffers.flatLists.passList,
        probationList: buffers.flatLists.probationList,
        withdrawalList: buffers.flatLists.withdrawalList,
        terminationList: buffers.flatLists.terminationList,
        carryoverStats: {
            totalCarryovers: counters.totalCarryovers,
            affectedStudentsCount: counters.affectedStudentsCount
        },
        failedStudents: buffers.failedStudents,
        _id: computationSummary._id
    });

    // Send student notifications
    if (buffers.notificationQueue.length > 0) {
        await ReportService.sendStudentNotifications(buffers.notificationQueue);
    }

    console.log(`✅ [FINALIZE] Computation completed for ${department.name}`);
}

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

// ==================== CONTROLLER FUNCTIONS ====================

export const computeAllResults = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();
        const computedBy = req.user._id;
        const {
            isRetry = false,
            isPreview = false,
            purpose = 'final',
            isFinal = true
        } = req.body
        console.log("Computed by:", computedBy)

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

        // Get the active semester
        const activeSemester = await SemesterService.getActiveAcademicSemester();
        // Create master computation record
        if (!activeSemester) {
            await session.abortTransaction();
            return buildResponse(res, 400, "No active academic semester found");
        }
        const masterComputation = new MasterComputation({
            semester: activeSemester._id,
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
            const uniqueJobId = `dept-${dept.departmentId}-${masterComputation._id}-${Date.now()}-${randomUUID()}`;
            await addDepartmentJob(
                {
                    departmentId: dept.departmentId,
                    masterComputationId: masterComputation._id,
                    computedBy,
                    jobId: uniqueJobId,
                    priority: 1,
                    isRetry,
                    isPreview,
                    purpose,
                    isFinal,
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
                    masterComputationId: masterComputationId
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
            .lean();

        if (!masterComputation) {
            return buildResponse(res, 404, "Computation record not found");
        }

        // Get computation summaries for this master
        const summaries = await ComputationSummary.find({
            masterComputationId: masterComputationId
        })
            .populate("department", "name code")
            .populate("semester", "name academicYear isActive isLocked")
            .lean();

        return buildResponse(res, 200, "Computation status retrieved", {
            masterComputation,
            summaries,
            progress: {
                percentage: masterComputation.totalDepartments > 0
                    ? (masterComputation.departmentsProcessed / masterComputation.totalDepartments * 100).toFixed(1)
                    : 0,
                processed: masterComputation.departmentsProcessed,
                total: masterComputation.totalDepartments
            }
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

        // Check if queue is available
        if (!departmentQueue) {
            await session.abortTransaction();
            return buildResponse(res, 500, "Job queue not available");
        }

        // Remove queued jobs (if queue methods exist)
        try {
            const waitingJobs = await departmentQueue.getWaiting();
            const activeJobs = await departmentQueue.getActive();

            const jobsToRemove = [...waitingJobs, ...activeJobs].filter(job =>
                job.data.masterComputationId === masterComputationId
            );

            for (const job of jobsToRemove) {
                await job.remove();
            }
        } catch (queueError) {
            console.warn("Could not remove jobs from queue:", queueError);
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
            masterComputationId
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
            masterComputationId: masterComputationId,
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
            const uniqueJobId = `retry-${summary.department}-${masterComputationId}-${Date.now()}`;

            const jobData = {
                departmentId: summary.department,
                masterComputationId,
                computedBy,
                jobId: uniqueJobId,
                isRetry: true
            };

            await addDepartmentJob(jobData);
            retryJobs.push(uniqueJobId);
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

// Rest of the functions remain the same...

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
        const semester = await SemesterService.getSemesterById(semesterId);

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
                .populate("semester", "name")
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

        // Get student results
        const results = await Result.find({
            studentId,
            semester: semesterId,
            deletedAt: null
        })
            .populate("courseId", "credits unit")
            .lean();

        const gpaData = GPACalculator.calculateSemesterGPA(results);

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

        // Get all semester results for the student
        const semesterResults = await studentSemseterResultModel.find({
            studentId,
            isPreview: false
        }).lean();

        let totalPoints = 0;
        let totalUnits = 0;

        for (const result of semesterResults) {
            totalPoints += result.totalPoints || 0;
            totalUnits += result.totalUnits || 0;
        }

        const cgpa = totalUnits > 0 ? parseFloat((totalPoints / totalUnits).toFixed(2)) : 0;

        return buildResponse(res, 200, "CGPA calculated", {
            studentId,
            cgpa,
            totalPoints,
            totalUnits,
            semesterResultsCount: semesterResults.length
        });
    } catch (error) {
        return buildResponse(res, 500, "Failed to calculate CGPA", null, true, error);
    }
};