// computation/controllers/previewComputation.controller.js

import mongoose from "mongoose";
import { BATCH_SIZE } from "../utils/computationConstants.js";
import StudentService from "../services/StudentService.js";
import ResultService from "../services/ResultService.js";
import GPACalculator from "../services/GPACalculator.js";
import AcademicStandingEngine from "../services/AcademicStandingEngine.js";
import CarryoverService from "../services/CarryoverService.js";
import SummaryListBuilder from "../services/SummaryListBuilder.js";
import BulkWriter from "../services/BulkWriter.js";
import ReportService from "../services/ReportService.js";
import ComputationSummary from "../../result/computation.model.js";
import MasterComputation from "../../result/masterComputation.model.js";
import departmentModel from "../../department/department.model.js";
import SemesterService from "../../semester/semester.service.js";
import { addDepartmentJob } from "../../../workers/department.queue.js";
import { randomUUID } from "crypto";
import buildResponse from "../../../utils/responseBuilder.js";

/**
 * Preview computation - generates mastersheet without affecting students
 */
export const computePreviewResults = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
    const computedBy = req.user._id;
    const { purpose = 'preview', semesterId } = req.body;

    // Validate purpose
    const validPurposes = ['preview', 'simulation'];
    if (!validPurposes.includes(purpose)) {
      return buildResponse(res, 400, `Invalid purpose. Must be one of: ${validPurposes.join(', ')}`);
    }

    // Get all departments or specific department
    const { departmentId } = req.body;
    let departments;

    if (departmentId) {
      // Single department preview
      const department = await departmentModel.findById(departmentId).session(session);
      if (!department) {
        await session.abortTransaction();
        return buildResponse(res, 404, "Department not found");
      }
      departments = [department];
    } else {
      // All departments
      departments = await departmentModel.find({ /* status: "active" */ }).session(session);
    }

    if (departments.length === 0) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No departments found");
    }

    // Find active semester for each department
    const departmentsToProcess = [];

    for (const dept of departments) {
      const activeSemester = await SemesterService.getActiveDepartmentSemester(dept._id);
      if (activeSemester && !activeSemester.isLocked) {
        const hasResults = await mongoose.model('Result').exists({
          courseDepartmentId: dept._id,
          semester: activeSemester._id,
          deletedAt: null,
        }).session(session);

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

    // Create master computation record for preview
    const masterComputation = new MasterComputation({
      semester: departmentsToProcess[0].semesterId, // Use first department's semester
      totalDepartments: departmentsToProcess.length,
      status: "processing",
      computedBy,
      isFinal: false,
      purpose: purpose,
      startedAt: new Date(),
      metadata: {
        departments: departmentsToProcess,
        initiatedBy: {
          userId: computedBy,
          timestamp: new Date().toISOString()
        },
        isPreview: true
      }
    });

    await masterComputation.save({ session });
    await session.commitTransaction();

    // Add each department to processing queue for preview
    for (const dept of departmentsToProcess) {
      const uniqueJobId = `preview-dept-${dept.departmentId}-${masterComputation._id}-${Date.now()}-${randomUUID()}`;
      await addDepartmentJob({
        departmentId: dept.departmentId,
        masterComputationId: masterComputation._id,
        computedBy,
        jobId: uniqueJobId,
        priority: 1,
        isPreview: true,
        purpose: purpose
      });
    }

    return buildResponse(res, 202, "Preview computation started", {
      masterComputationId: masterComputation._id,
      totalDepartments: departmentsToProcess.length,
      purpose: purpose,
      isPreview: true,
      message: "Preview computation has been queued. No student data will be modified.",
      statusEndpoint: `/api/computation/preview/status/${masterComputation._id}`
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Error starting preview computation:", error);
    return buildResponse(res, 500, "Failed to start preview computation", null, true, error);
  } finally {
    session.endSession();
  }
};

/**
 * Process preview department job
 */
export const processPreviewDepartmentJob = async (job) => {
  const {
    departmentId,
    masterComputationId,
    computedBy,
    jobId,
    isPreview = true,
    purpose = 'preview'
  } = job.data;

  console.log(`Processing preview department job: ${jobId} for department ${departmentId}`);

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

  // Initialize preview computation summary with level-based structure
  let computationSummary = new ComputationSummary({
    department: departmentId,
    semester: activeSemester._id,
    masterComputationId,
    status: "processing",
    computedBy,
    isFinal: false,
    isPreview: true,
    purpose: purpose,
    startedAt: new Date()
  });

  await computationSummary.save();

  // Initialize counters and buffers with level-based organization
  const counters = initializeCounters();
  const buffers = initializePreviewBuffers(); // Updated for level-based
  const gradeDistribution = initializeGradeDistribution();
  const levelStats = {};

  try {
    // Get student IDs for processing
    const studentIds = await StudentService.getStudentIds(departmentId);
    console.log(`Processing ${studentIds.length} students for preview in ${department.name}`);

    // Process students in batches
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const studentBatch = studentIds.slice(i, i + BATCH_SIZE);

      // Process batch with preview flag and level-based organization
      const batchResults = await processPreviewStudentBatch(
        studentBatch,
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
    }

    // Finalize preview computation with level-based organization
    await finalizePreviewComputation(
      computationSummary,
      counters,
      buffers,
      gradeDistribution,
      levelStats,
      department,
      activeSemester,
      computedBy,
      masterComputationId
    );

    // Update master computation - ONLY store summary data
    await updatePreviewMasterComputationStats(
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

    console.log(`✅ Preview completed for department ${department.name}: 
      ${counters.studentsWithResults} students previewed
      ${counters.totalCarryovers} potential carryovers
      Pass List: ${buffers.flatLists.passList.length} students
      Probation List: ${buffers.flatLists.probationList.length} students
      Withdrawal List: ${buffers.flatLists.withdrawalList.length} students
      Termination List: ${buffers.flatLists.terminationList.length} students`);

    return {
      success: true,
      summaryId: computationSummary._id,
      department: department.name,
      studentsProcessed: counters.studentsWithResults,
      isPreview: true,
      purpose: purpose
    };

  } catch (error) {
    console.error(`Preview department job failed:`, error);
    await handlePreviewJobFailure(computationSummary, department, activeSemester, error);
    throw error;
  }
};

/**
 * Process preview student batch - no actual data modification
 */
async function processPreviewStudentBatch(
  studentIds,
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
  // Fetch student details and results
  const [students, resultsByStudent] = await Promise.all([
    StudentService.getStudentsWithDetails(studentIds),
    ResultService.getResultsByStudents(studentIds, activeSemester._id)
  ]);

  const batchPromises = students.map(async (student) => {
    counters.totalStudents++;

    try {
      const studentResults = resultsByStudent[student._id.toString()] || [];

      if (!studentResults || studentResults.length === 0) {
        // For preview, just log missing results
        buffers.failedStudents.push({
          studentId: student._id,
          matricNumber: student.matricNumber,
          name: student.name,
          error: "No results found",
          notified: false
        });
        return null;
      }

      // Process student results for preview with level-based organization
      const studentResult = await processPreviewStudentResults(
        student,
        studentResults,
        department,
        activeSemester,
        computationSummary,
        computedBy,
        counters,
        buffers,
        gradeDistribution,
        levelStats
      );

      return studentResult;

    } catch (error) {
      return handleStudentProcessingError(student, error, buffers, department, activeSemester);
    }
  });

  return await Promise.allSettled(batchPromises);
}

/**
 * Process preview student results - no actual updates, with level-based organization
 */
async function processPreviewStudentResults(
  student,
  results,
  department,
  activeSemester,
  computationSummary,
  computedBy,
  counters,
  buffers,
  gradeDistribution,
  levelStats
) {
  const studentLevel = student.level || "100";

  // Initialize level stats for preview
  if (!levelStats[studentLevel]) {
    levelStats[studentLevel] = initializeLevelStats();
  }
  levelStats[studentLevel].totalStudents++;

  // Calculate semester GPA (same as regular)
  const gpaData = GPACalculator.calculateSemesterGPA(results);

  // Calculate CGPA for preview
  const cgpaData = await GPACalculator.calculateStudentCGPAWithTCP(
    student._id,
    activeSemester._id,
    gpaData.totalCreditPoints,
    gpaData.totalUnits
  );

  // For preview: simulate carryovers but don't create them
  if (gpaData.failedCount > 0) {
    // Just count them for statistics
    counters.totalCarryovers += gpaData.failedCount;
    if (gpaData.failedCount > 0) {
      counters.affectedStudentsCount++;
    }
  }

  // Determine academic standing for preview (not final)
  const academicStanding = AcademicStandingEngine.determineAcademicStandingOptimized(
    student,
    gpaData.semesterGPA,
    cgpaData.cgpa,
    student.totalCarryovers + gpaData.failedCount,
    false // isFinal = false
  );

  // Calculate outstanding courses for preview
  const outstandingCourses = await GPACalculator.calculateOutstandingCourses(
    student._id,
    activeSemester._id
  );

  // Calculate academic history for MMS2
  const academicHistory = await GPACalculator.calculateAcademicHistory(student._id);

  // Build student summary for master sheet - organized by level
  const studentSummary = SummaryListBuilder.buildStudentSummary(
    student,
    gpaData,
    cgpaData,
    academicStanding,
    outstandingCourses,
    academicHistory
  );

  // Add to level-based buffers
  if (!buffers.studentSummariesByLevel[studentLevel]) {
    buffers.studentSummariesByLevel[studentLevel] = [];
  }
  // buffers.studentSummariesByLevel[studentLevel].push(studentSummary.summary);
  buffers.studentSummariesByLevel[studentLevel].push(studentSummary);

  // In processStudentResults function, add debugging:
  console.log(`📝 Processing student ${student.matricNumber}:`);
  console.log(`  GPA: ${gpaData.semesterGPA}, CGPA: ${cgpaData.cgpa}`);
  console.log(`  Academic Standing: ${JSON.stringify(academicStanding)}`);
  console.log(`  Carryover Count: ${gpaData.failedCount}`);

  const listEntries = SummaryListBuilder.addStudentToLists(
    student,
    academicStanding,
    gpaData.semesterGPA,
    gpaData.failedCount,
    gpaData.failedCourses
  );

  console.log(`  List Entries: ${JSON.stringify(listEntries)}`);

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

  // Update statistics for preview
  counters.studentsWithResults++;
  counters.totalGPA += gpaData.semesterGPA;

  // Update high/low GPA
  if (gpaData.semesterGPA > counters.highestGPA) counters.highestGPA = gpaData.semesterGPA;
  if (gpaData.semesterGPA < counters.lowestGPA && gpaData.semesterGPA > 0) {
    counters.lowestGPA = gpaData.semesterGPA;
  }

  // Update level stats
  levelStats[studentLevel].totalGPA += gpaData.semesterGPA;
  if (gpaData.semesterGPA > levelStats[studentLevel].highestGPA) {
    levelStats[studentLevel].highestGPA = gpaData.semesterGPA;
  }
  if (gpaData.semesterGPA < levelStats[studentLevel].lowestGPA && gpaData.semesterGPA > 0) {
    levelStats[studentLevel].lowestGPA = gpaData.semesterGPA;
  }

  // Update grade distribution
  const classification = GPACalculator.getGradeClassification(gpaData.semesterGPA);
  gradeDistribution[classification]++;
  levelStats[studentLevel].gradeDistribution[classification]++;


  return {
    studentId: student._id,
    success: true,
    standing: academicStanding.remark,
    level: studentLevel,
    isPreview: true
  };
}

/**
 * Finalize preview computation - no actual updates to student records, with level-based organization
 */
// In previewComputation.controller.js - finalizePreviewComputation function

async function finalizePreviewComputation(
    computationSummary,
    counters,
    buffers,
    gradeDistribution,
    levelStats,
    department,
    activeSemester,
    computedBy,
    masterComputationId
) {
    // Re-fetch computation summary
    computationSummary = await ComputationSummary.findById(computationSummary._id);
    
    // Group data by level using SummaryListBuilder
    const groupedStudentSummaries = SummaryListBuilder.groupStudentSummariesByLevel(
        buffers.studentSummariesByLevel
    );
    
    const groupedLists = SummaryListBuilder.groupListsByLevel(
        buffers.listEntriesByLevel
    );
    
    // DEBUG: Check groupedLists structure
    console.log('🔍 [PREVIEW] Grouped lists structure:', Object.keys(groupedLists));
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
                    standardDeviation: 0
                },
                
                classDistribution: stats.gradeDistribution
            };
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
    
    console.log(`📊 [PREVIEW] All levels found:`, Array.from(allLevels));
    
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
    let rawKeyToCourses = {};
    
    if (buffers.keyToCoursesByLevel) {
        console.log('✅ [PREVIEW] Found keyToCoursesByLevel in buffers');
        rawKeyToCourses = buffers.keyToCoursesByLevel;
        
        // Debug the raw structure
        console.log('🔍 [PREVIEW] Raw keyToCourses structure (first 300 chars):');
        const rawJson = JSON.stringify(rawKeyToCourses);
        console.log(rawJson.substring(0, Math.min(300, rawJson.length)));
    } else if (buffers.allResults && Array.isArray(buffers.allResults)) {
        // Build from results if not available
        console.log('⚠️ [PREVIEW] Building keyToCoursesByLevel from results...');
        rawKeyToCourses = await SummaryListBuilder.buildKeyToCoursesByLevel(buffers.allResults);
    } else {
        console.log('⚠️ [PREVIEW] No keyToCoursesByLevel data available');
    }

    // ✅ FIX: Process and fix nested structure
    const fixedKeyToCourses = {};
    
    for (const level in rawKeyToCourses) {
        let courses = rawKeyToCourses[level];
        
        console.log(`🔍 [PREVIEW] Processing level ${level}: ${typeof courses}`);
        
        // Check if it's nested like {"100": {"100": [...]}}
        if (courses && typeof courses === 'object' && !Array.isArray(courses)) {
            console.log(`  ⚠️ Level ${level} has nested object structure`);
            
            // Try to extract array from nested object
            if (courses[level] && Array.isArray(courses[level])) {
                // Case: {"100": {"100": [...]}}
                courses = courses[level];
                console.log(`  ✅ Extracted ${courses} courses from nested level ${level}`);
            } else {
                // Try to find any array in the object
                const subArrays = Object.values(courses).filter(v => Array.isArray(v));
                if (subArrays.length > 0) {
                    courses = subArrays[0];
                    console.log(`  ✅ Found array with ${courses.length} courses in nested object`);
                } else {
                    courses = [];
                    console.log(`  ⚠️ No array found in nested object, using empty array`);
                }
            }
        }
        
        // Ensure we have an array
        if (Array.isArray(courses)) {
            fixedKeyToCourses[level] = courses.map(course => ({
                courseId: course.courseId || course._id,
                courseCode: course.courseCode || 'N/A',
                title: course.title || 'N/A',
                unit: course.unit || 0,
                level: course.level || parseInt(level),
                type: course.type || 'core',
                isCoreCourse: course.isCoreCourse || false,
                isBorrowed: course.isBorrowed || false
            }));
        } else {
            fixedKeyToCourses[level] = [];
            console.log(`  ⚠️ Level ${level}: Not an array after processing, using empty array`);
        }
    }

    // ✅ Convert to Map for Mongoose schema
    const keyToCoursesMap = new Map();
    for (const [level, courses] of Object.entries(fixedKeyToCourses)) {
        if (Array.isArray(courses)) {
            keyToCoursesMap.set(level, courses);
        }
    }

    // Debug final structure
    console.log('🔍 [PREVIEW] Final keyToCoursesByLevel structure:');
    let totalCourses = 0;
    for (const [level, courses] of keyToCoursesMap.entries()) {
        console.log(`  Level ${level}: ${courses.length} courses`);
        totalCourses += courses.length;
        if (courses.length > 0) {
            console.log(`    First course: ${courses[0].courseCode} - ${courses[0].title}`);
        }
    }
    console.log(`📊 [PREVIEW] Total courses: ${totalCourses}`);
    
    // Prepare carryover stats by level
    const carryoverStatsByLevel = {};
    for (const level of allLevels) {
        const carryoverStudents = studentListsByLevel[level]?.carryoverStudents || [];
        if (carryoverStudents.length > 0) {
            carryoverStatsByLevel[level] = {
                totalCarryovers: carryoverStudents.reduce((sum, student) => sum + (student.courses?.length || 0), 0),
                affectedStudentsCount: carryoverStudents.length,
                affectedStudents: carryoverStudents.slice(0, 100)
            };
        }
    }
    console.log(Object.fromEntries(keyToCoursesMap))
    // Prepare summary data for preview computation summary
    const summaryData = {
        ...summaryStats,
        
        // Level-based data
        studentSummariesByLevel: groupedStudentSummaries,
        keyToCoursesByLevel: Object.fromEntries(keyToCoursesMap), // Use fixed structure
        studentListsByLevel,
        carryoverStatsByLevel,
        summaryOfResultsByLevel,
        
        // Overall data
        totalStudents: counters.totalStudents,
        studentsWithResults: counters.studentsWithResults,
        studentsProcessed: counters.studentsWithResults,
        averageGPA: counters.studentsWithResults > 0 ? 
                   parseFloat((counters.totalGPA / counters.studentsWithResults).toFixed(2)) : 0,
        highestGPA: parseFloat(counters.highestGPA.toFixed(2)),
        lowestGPA: parseFloat(counters.lowestGPA.toFixed(2)),
        
        // Grade distribution
        gradeDistribution: {
            firstClass: gradeDistribution.firstClass || 0,
            secondClassUpper: gradeDistribution.secondClassUpper || 0,
            secondClassLower: gradeDistribution.secondClassLower || 0,
            thirdClass: gradeDistribution.thirdClass || 0,
            fail: gradeDistribution.fail || 0
        },
        
        // Backward compatible data
        passList: buffers.flatLists.passList.slice(0, 100),
        probationList: buffers.flatLists.probationList.slice(0, 100),
        withdrawalList: buffers.flatLists.withdrawalList.slice(0, 100),
        terminationList: buffers.flatLists.terminationList.slice(0, 100),
        carryoverStats: {
            totalCarryovers: counters.totalCarryovers,
            affectedStudentsCount: counters.affectedStudentsCount,
            affectedStudents: buffers.flatLists.carryoverStudents.slice(0, 100)
        },
        
        failedStudents: buffers.failedStudents,
        additionalMetrics: {
            levelStats
        },
        
        // Preview-specific fields
        isPreview: true,
        purpose: "preview"
    };
    
    // Update computation summary (no student updates)
    computationSummary.status = buffers.failedStudents.length > 0 ? "completed_with_errors" : "completed";
    computationSummary.completedAt = new Date();
    computationSummary.duration = Date.now() - computationSummary.startedAt.getTime();
    
    // Set level-based data - Convert objects to Maps
    computationSummary.studentSummariesByLevel = new Map(Object.entries(groupedStudentSummaries));
    computationSummary.keyToCoursesByLevel = keyToCoursesMap; // Use fixed Map
    computationSummary.studentListsByLevel = new Map(Object.entries(studentListsByLevel));
    computationSummary.carryoverStatsByLevel = new Map(Object.entries(carryoverStatsByLevel));
    computationSummary.summaryOfResultsByLevel = new Map(Object.entries(summaryOfResultsByLevel));
    
    // Set overall summary data
    computationSummary.totalStudents = counters.totalStudents;
    computationSummary.studentsWithResults = counters.studentsWithResults;
    computationSummary.studentsProcessed = counters.studentsWithResults;
    computationSummary.averageGPA = summaryData.averageGPA;
    computationSummary.highestGPA = summaryData.highestGPA;
    computationSummary.lowestGPA = summaryData.lowestGPA;
    computationSummary.gradeDistribution = summaryData.gradeDistribution;
    
    // Set backward compatible data
    computationSummary.passList = summaryData.passList;
    computationSummary.probationList = summaryData.probationList;
    computationSummary.withdrawalList = summaryData.withdrawalList;
    computationSummary.terminationList = summaryData.terminationList;
    computationSummary.carryoverStats = summaryData.carryoverStats;
    computationSummary.failedStudents = summaryData.failedStudents;
    
    // DEBUG: Verify before save
    console.log('📤 [PREVIEW] FINAL CHECK before save:');
    console.log(`  Total courses in keyToCourses: ${totalCourses}`);
    
    // ✅ Debug keyToCourses structure before save
    const savedKeyToCoursesMap = computationSummary.keyToCoursesByLevel;
    if (savedKeyToCoursesMap instanceof Map) {
        for (const [level, courses] of savedKeyToCoursesMap.entries()) {
            console.log(`  Level ${level} keyToCourses: ${courses?.length || 0} courses`);
            if (courses?.length > 0) {
                const firstCourse = courses[0];
                console.log(`    Sample course: ${firstCourse.courseCode} - ${firstCourse.title}`);
            }
        }
    }
    
    try {
        await computationSummary.save();
        console.log(`✅ [PREVIEW] Preview saved successfully for ${department.name} - ${activeSemester.name}`);
        console.log(`✅ KeyToCourses saved: ${totalCourses} courses across ${keyToCoursesMap.size} levels`);
    } catch (saveError) {
        console.error('❌ [PREVIEW] Save error:', saveError.message);
        console.error('❌ [PREVIEW] Save error details:', saveError.errors);
        
        // Debug the problematic data
        console.log('❌ [PREVIEW] Problematic keyToCourses data structure:');
        console.log(JSON.stringify(Object.fromEntries(keyToCoursesMap), null, 2));
        
        throw saveError;
    }
}

/**
 * Update preview master computation stats
 */
async function updatePreviewMasterComputationStats(masterComputationId, departmentName, stats) {
  if (!masterComputationId) return;

  const masterComp = await MasterComputation.findById(masterComputationId);
  if (!masterComp) return;

  // Check if this department was already processed
  const wasAlreadyProcessed = masterComp.departmentSummaries?.[departmentName]?.processed;

  // Initialize departmentSummaries if needed
  if (!masterComp.departmentSummaries) {
    masterComp.departmentSummaries = {};
  }

  // Only increment if this department wasn't already processed
  if (!wasAlreadyProcessed) {
    masterComp.departmentsProcessed = (masterComp.departmentsProcessed || 0) + 1;
  }

  // Store department summary
  masterComp.departmentSummaries[departmentName] = {
    ...stats,
    processed: true,
    updatedAt: new Date(),
    isPreview: true
  };

  // Check if all departments are processed
  if (masterComp.departmentsProcessed >= masterComp.totalDepartments) {
    // Calculate final overall statistics
    const summaries = Object.values(masterComp.departmentSummaries || {});

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
}

/**
 * Handle preview job failure
 */
async function handlePreviewJobFailure(computationSummary, department, activeSemester, error) {
  if (computationSummary) {
    computationSummary.status = "failed";
    computationSummary.errorMessage = error.message;
    computationSummary.completedAt = new Date();
    await computationSummary.save();
  }

  console.error(`Preview computation failed for ${department.name}: ${error.message}`);
}

// Helper functions for preview computation
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

function initializePreviewBuffers() {
  return {
    // Level-based organization for preview
    studentSummariesByLevel: {}, // { [level]: [studentSummary] }
    listEntriesByLevel: {}, // { [level]: [listEntry] }
    keyToCoursesByLevel: {}, // { [level]: [course] }

    // Old flat lists for backward compatibility
    flatLists: {
      passList: [],
      probationList: [],
      withdrawalList: [],
      terminationList: [],
      carryoverStudents: [],
    },

    // Other buffers
    failedStudents: [],
    notificationQueue: [], // Not used in preview but kept for structure
    notificationBatchSize: 1000
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

function handleStudentProcessingError(student, error, buffers, department, activeSemester) {
  console.error(`Error processing student ${student.matricNumber} in preview:`, error);

  const failedStudent = {
    studentId: student._id,
    matricNumber: student.matricNumber,
    name: student.name,
    error: error.message,
    notified: false
  };

  buffers.failedStudents.push(failedStudent);

  return {
    studentId: student._id,
    success: false,
    error: error.message,
    isPreview: true
  };
}