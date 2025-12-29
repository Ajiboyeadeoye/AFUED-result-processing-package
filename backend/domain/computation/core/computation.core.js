// computation/core/computation.core.js
import mongoose from "mongoose";
import { BATCH_SIZE } from "../utils/computationConstants.js";
import StudentService from "../services/StudentService.js";
import ResultService from "../services/ResultService.js";
import GPACalculator from "../services/GPACalculator.js";
import AcademicStandingEngine from "../services/AcademicStandingEngine.js";
import SummaryListBuilder from "../services/SummaryListBuilder.js";
import { getDepartmentLeadershipDetails } from "../services/helpers.js";

/**
 * Core computation engine - shared logic between preview and final
 */
export class ComputationCore {
  constructor(options = {}) {
    this.isPreview = options.isPreview || false;
    this.purpose = options.purpose || 'final';
    this.computedBy = options.computedBy;
    this.computationSummary = options.computationSummary;
    this.department = options.department;
    this.activeSemester = options.activeSemester;
    this.masterComputationId = options.masterComputationId;

    // Initialize state
    this.counters = this.initializeCounters();
    this.buffers = this.initializeBuffers();
    this.gradeDistribution = this.initializeGradeDistribution();
    this.levelStats = {};
    this.processedStudentIds = new Set();
  }

  // Shared initialization functions
  initializeCounters() {
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

  initializeBuffers() {
    return {
      // Student data
      studentSummaries: [],  // ✅ Array of student summary objects
      studentSummariesByLevel: {}, // ✅ Grouped by level

      // List data
      listEntries: [], // Raw list entries
      listEntriesByLevel: {}, // Grouped by level
      flatLists: {
        passList: [],
        probationList: [],
        withdrawalList: [],
        terminationList: [],
        carryoverStudents: [],
      },

      // Course data
      allResults: [], // All results processed
      keyToCourses: {}, // Course mapping
      keyToCoursesByLevel: {}, // Course mapping by level

      // Other
      failedStudents: [],
      notificationQueue: [],
    };
  }

  initializeGradeDistribution() {
    return {
      firstClass: 0,
      secondClassUpper: 0,
      secondClassLower: 0,
      thirdClass: 0,
      fail: 0
    };
  }

  initializeLevelStats() {
    return {
      totalStudents: 0,
      totalGPA: 0,
      totalCarryovers: 0,
      highestGPA: 0,
      lowestGPA: 5.0,
      gradeDistribution: this.initializeGradeDistribution()
    };
  }

  /**
   * Process a batch of students - shared logic
   */
  async processStudentBatch(studentIds) {
    // Fetch student details and results in parallel
    const [students, resultsByStudent] = await Promise.all([
      StudentService.getStudentsWithDetails(studentIds),
      ResultService.getResultsByStudents(studentIds, this.activeSemester._id)
    ]);

    const batchResults = [];

    for (const student of students) {
      this.counters.totalStudents++;

      try {
        const studentResults = resultsByStudent[student._id.toString()] || [];

        if (!studentResults || studentResults.length === 0) {
          this.handleMissingResults(student);
          continue;
        }

        // Track results for keyToCourses building
        if (!this.buffers.allResults) {
          this.buffers.allResults = [];
        }
        this.buffers.allResults.push(...studentResults);

        const result = await this.processSingleStudent(student, studentResults);
        batchResults.push(result);

      } catch (error) {
        const errorResult = this.handleStudentProcessingError(student, error);
        batchResults.push(errorResult);
      }
    }

    return batchResults;
  }

  /**
   * Process single student - shared logic
   */
  async processSingleStudent(student, results) {
    const studentLevel = student.level || "100";

    // Initialize level stats
    if (!this.levelStats[studentLevel]) {
      this.levelStats[studentLevel] = this.initializeLevelStats();
    }
    this.levelStats[studentLevel].totalStudents++;

    // Calculate GPA and CGPA
    const gpaData = GPACalculator.calculateSemesterGPA(results);
    const cgpaData = await GPACalculator.calculateStudentCGPAWithTCP(
      student._id,
      this.activeSemester._id,
      gpaData.totalCreditPoints,
      gpaData.totalUnits
    );

    // Determine academic standing
    const academicStanding = await AcademicStandingEngine.determineAcademicStanding(
      student,
      gpaData.semesterGPA,
      cgpaData.cgpa,
      student.totalCarryovers + gpaData.failedCount,
      this.activeSemester._id,
      !this.isPreview
    );

    // Check termination/withdrawal status
    const isTerminatedOrWithdrawn = this.checkTerminatedOrWithdrawn(academicStanding);

    // Calculate outstanding courses only for active students
    let outstandingCourses = [];
    if (!isTerminatedOrWithdrawn) {
      outstandingCourses = await GPACalculator.calculateOutstandingCourses(
        student._id,
        this.activeSemester._id
      );
    }

    // Calculate academic history
    const academicHistory = await GPACalculator.calculateAcademicHistory(student._id);

    // Build student summary
    const studentSummary = SummaryListBuilder.buildStudentSummary(
      student,
      gpaData,
      cgpaData,
      academicStanding,
      outstandingCourses,
      academicHistory
    );

    // Add to level-based buffers
    this.addToBuffers(studentLevel, studentSummary, student, academicStanding, gpaData, cgpaData);

    // Update statistics
    this.updateStatistics(studentLevel, gpaData, cgpaData, academicStanding);

    return {
      studentId: student._id,
      success: true,
      standing: academicStanding.remark,
      level: studentLevel,
      isPreview: this.isPreview,
      isTerminatedOrWithdrawn,
      outstandingCoursesCount: outstandingCourses.length,
      gpaData,
      cgpaData,
      academicStanding
    };
  }

  /**
   * Check if student is terminated or withdrawn
   */
  checkTerminatedOrWithdrawn(academicStanding) {
    const academicRemark = (academicStanding.remark || '').toUpperCase();
    const academicStatus = (academicStanding.status || '').toLowerCase();

    return (
      academicRemark.includes('TERMINATED') ||
      academicRemark.includes('WITHDRAW') ||
      academicStatus.includes('terminated') ||
      academicStatus.includes('withdraw') ||
      academicStatus.includes('withdrawal')
    );
  }

  /**
   * Add student data to buffers
   */
  addToBuffers(studentLevel, studentSummary, student, academicStanding, gpaData, cgpaData) {
    // ✅ FIX 1: Store in flat array too
    if (!Array.isArray(this.buffers.studentSummaries)) {
      this.buffers.studentSummaries = [];
    }
    this.buffers.studentSummaries.push(studentSummary);

    // ✅ FIX 2: Store in grouped structure
    if (!this.buffers.studentSummariesByLevel[studentLevel]) {
      this.buffers.studentSummariesByLevel[studentLevel] = [];
    }
    this.buffers.studentSummariesByLevel[studentLevel].push(studentSummary);

    // ✅ FIX 3: Store summary data separately
    if (!this.buffers.studentSummaryDataByLevel) {
      this.buffers.studentSummaryDataByLevel = {};
    }
    if (!this.buffers.studentSummaryDataByLevel[studentLevel]) {
      this.buffers.studentSummaryDataByLevel[studentLevel] = [];
    }

    // Store just the summary object (not the wrapper)
    const cleanSummary = studentSummary.summary || studentSummary;
    this.buffers.studentSummaryDataByLevel[studentLevel].push(cleanSummary);

    // ✅ FIX 4: Build list entries
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

    // ✅ FIX 5: Store listEntries in flat array
    if (!Array.isArray(this.buffers.listEntries)) {
      this.buffers.listEntries = [];
    }
    this.buffers.listEntries.push(listEntries);

    // ✅ FIX 6: Store listEntriesByLevel
    if (!this.buffers.listEntriesByLevel[studentLevel]) {
      this.buffers.listEntriesByLevel[studentLevel] = [];
    }
    this.buffers.listEntriesByLevel[studentLevel].push(listEntries);

    // ✅ FIX 7: Add to flat lists (backward compatibility)
    if (listEntries.passList) this.buffers.flatLists.passList.push(listEntries.passList);
    if (listEntries.probationList) this.buffers.flatLists.probationList.push(listEntries.probationList);
    if (listEntries.withdrawalList) this.buffers.flatLists.withdrawalList.push(listEntries.withdrawalList);
    if (listEntries.terminationList) this.buffers.flatLists.terminationList.push(listEntries.terminationList);
    if (listEntries.carryoverList) this.buffers.flatLists.carryoverStudents.push(listEntries.carryoverList);

    // ✅ DEBUG: Log what we're storing
    console.log(`📝 Stored student ${student.matricNumber} (Level ${studentLevel}):`, {
      hasSummary: !!studentSummary,
      hasSummarySummary: !!(studentSummary.summary),
      listEntriesTypes: Object.keys(listEntries).filter(k => listEntries[k] !== null)
    });
  }

  /**
   * Update statistics
   */
  updateStatistics(studentLevel, gpaData, cgpaData, academicStanding) {
    this.counters.studentsWithResults++;
    this.counters.totalGPA += gpaData.semesterGPA;

    // Update high/low GPA
    if (gpaData.semesterGPA > this.counters.highestGPA) {
      this.counters.highestGPA = gpaData.semesterGPA;
    }
    if (gpaData.semesterGPA < this.counters.lowestGPA && gpaData.semesterGPA > 0) {
      this.counters.lowestGPA = gpaData.semesterGPA;
    }

    // Update level stats
    const levelStat = this.levelStats[studentLevel];
    levelStat.totalGPA += gpaData.semesterGPA;
    if (gpaData.semesterGPA > levelStat.highestGPA) {
      levelStat.highestGPA = gpaData.semesterGPA;
    }
    if (gpaData.semesterGPA < levelStat.lowestGPA && gpaData.semesterGPA > 0) {
      levelStat.lowestGPA = gpaData.semesterGPA;
    }

    // Update grade distribution
    const classification = GPACalculator.getGradeClassification(gpaData.semesterGPA);
    this.gradeDistribution[classification]++;
    levelStat.gradeDistribution[classification]++;
  }

  /**
   * Handle missing results
   */
  handleMissingResults(student) {
    this.buffers.failedStudents.push({
      studentId: student._id,
      matricNumber: student.matricNumber,
      name: student.name,
      error: "No results found",
      notified: false
    });
  }

  /**
   * Handle student processing error
   */
  handleStudentProcessingError(student, error) {
    console.error(`Error processing student ${student.matricNumber}:`, error);

    const failedStudent = {
      studentId: student._id,
      matricNumber: student.matricNumber,
      name: student.name,
      error: error.message,
      notified: false
    };

    this.buffers.failedStudents.push(failedStudent);

    return {
      studentId: student._id,
      success: false,
      error: error.message,
      isPreview: this.isPreview
    };
  }

  /**
   * Build keyToCourses from all results
   */
  async buildKeyToCourses() {
    if (this.buffers.allResults && this.buffers.allResults.length > 0) {
      this.buffers.keyToCoursesByLevel = await SummaryListBuilder.buildKeyToCoursesByLevel(this.buffers.allResults);
    }
    return this.buffers.keyToCoursesByLevel;
  }

  /**
   * Prepare summary data for saving
   */
  async prepareSummaryData() {
    console.log('🔍 prepareSummaryData - Buffer Status:', {
      studentSummaries: this.buffers.studentSummaries?.length || 0,
      studentSummaryDataByLevel: this.buffers.studentSummaryDataByLevel
        ? Object.keys(this.buffers.studentSummaryDataByLevel).map(k => `${k}: ${this.buffers.studentSummaryDataByLevel[k]?.length || 0}`)
        : [],
      listEntries: this.buffers.listEntries?.length || 0,
      listEntriesByLevel: this.buffers.listEntriesByLevel
        ? Object.keys(this.buffers.listEntriesByLevel).map(k => `${k}: ${this.buffers.listEntriesByLevel[k]?.length || 0}`)
        : []
    });

    // Build keyToCourses if not already built
    await this.buildKeyToCourses();

    // ✅ USE studentSummaryDataByLevel instead of trying to group again
    const studentSummariesByLevel = this.buffers.studentSummaryDataByLevel || {};

    // Group lists by level
    const groupedLists = SummaryListBuilder.groupListsByLevel(
      this.buffers.listEntries || []
    );

    console.log('📊 Grouped Lists Structure:', {
      passListLevels: Object.keys(groupedLists.passList || {}),
      probationListLevels: Object.keys(groupedLists.probationList || {}),
      withdrawalListLevels: Object.keys(groupedLists.withdrawalList || {}),
      terminationListLevels: Object.keys(groupedLists.terminationList || {})
    });

    // Build summary statistics
    const summaryStats = SummaryListBuilder.buildSummaryStatsByLevel(
      this.counters,
      this.gradeDistribution,
      this.levelStats
    );

    // Build summary of results by level
    const summaryOfResultsByLevel = {};
    for (const [level, stats] of Object.entries(this.levelStats)) {
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

    // Get department details
    const departmentDetails = await getDepartmentLeadershipDetails(
      this.department._id,
      this.activeSemester._id
    );

    // Build student lists by level
    const studentListsByLevel = {};
    for (const level in studentSummariesByLevel) {
      studentListsByLevel[level] = {
        passList: (groupedLists.passList && groupedLists.passList[level]) || [],
        probationList: (groupedLists.probationList && groupedLists.probationList[level]) || [],
        withdrawalList: (groupedLists.withdrawalList && groupedLists.withdrawalList[level]) || [],
        terminationList: (groupedLists.terminationList && groupedLists.terminationList[level]) || [],
        carryoverStudents: (groupedLists.carryoverStudents && groupedLists.carryoverStudents[level]) || []
      };
    }

    // Build master sheet data
    const masterSheetData = SummaryListBuilder.buildMasterSheetDataByLevel(
      studentSummariesByLevel,
      summaryStats,
      this.buffers.keyToCoursesByLevel,
      departmentDetails
    );

    // Build final summary data
    return {
      ...summaryStats,
      departmentDetails,
      studentSummariesByLevel,
      keyToCoursesByLevel: this.buffers.keyToCoursesByLevel,
      studentListsByLevel,
      summaryOfResultsByLevel,
      masterSheetData,
      // Backward compatibility
      passList: this.buffers.flatLists.passList.slice(0, 100),
      probationList: this.buffers.flatLists.probationList.slice(0, 100),
      withdrawalList: this.buffers.flatLists.withdrawalList.slice(0, 100),
      terminationList: this.buffers.flatLists.terminationList.slice(0, 100),
      failedStudents: this.buffers.failedStudents || []
    };
  }

  /**
   * Get summary data for master computation stats
   */
  getMasterComputationStats() {
    return {
      studentsProcessed: this.counters.studentsWithResults,
      passListCount: this.buffers.flatLists.passList.length,
      probationListCount: this.buffers.flatLists.probationList.length,
      withdrawalListCount: this.buffers.flatLists.withdrawalList.length,
      terminationListCount: this.buffers.flatLists.terminationList.length,
      carryoverCount: this.counters.totalCarryovers,
      averageGPA: this.counters.studentsWithResults > 0
        ? this.counters.totalGPA / this.counters.studentsWithResults
        : 0,
      failedStudentsCount: this.buffers.failedStudents.length,
      status: this.buffers.failedStudents.length > 0
        ? "completed_with_errors"
        : "completed"
    };
  }
}