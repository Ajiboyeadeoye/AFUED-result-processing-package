// computation/services/SummaryListBuilder.js
import { REMARK_CATEGORIES } from "../utils/computationConstants.js";

class SummaryListBuilder {
  /**
   * Add student to appropriate list based on academic standing
   * @param {Object} student - Student data
   * @param {Object} academicStanding - Academic standing
   * @param {number} semesterGPA - Semester GPA
   * @param {number} carryoverCount - Number of carryovers
   * @param {Array} failedCourses - Failed courses
   * @returns {Object} Lists to add student to
   */
  addStudentToLists(student, academicStanding, semesterGPA, carryoverCount, failedCourses = []) {
    const lists = {
      passList: false,
      probationList: false,
      withdrawalList: false,
      terminationList: false,
      carryoverList: false
    };

    const studentListEntry = {
      studentId: student._id,
      matricNumber: student.matricNumber,
      name: student.name,
      gpa: semesterGPA
    };

    // Determine which lists to add to
    switch (academicStanding.remark) {
      case REMARK_CATEGORIES.EXCELLENT:
      case REMARK_CATEGORIES.GOOD:
        if (carryoverCount === 0) {
          lists.passList = { ...studentListEntry, remark: academicStanding.remark };
        }
        break;

      case REMARK_CATEGORIES.PROBATION:
        lists.probationList = {
          ...studentListEntry,
          remarks: academicStanding.actionTaken || "Placed on academic probation",
          previousStatus: student.probationStatus
        };
        break;

      case REMARK_CATEGORIES.WITHDRAWN:
        lists.withdrawalList = {
          ...studentListEntry,
          reason: "Poor academic performance",
          remarks: academicStanding.actionTaken || "Withdrawn due to low CGPA",
          cgpa: student.cgpa
        };
        break;

      case REMARK_CATEGORIES.TERMINATED:
        lists.terminationList = {
          ...studentListEntry,
          reason: "Excessive carryovers or poor performance",
          remarks: academicStanding.actionTaken || "Terminated due to academic standing",
          totalCarryovers: carryoverCount
        };
        break;
    }

    // Add to carryover list if applicable
    if (carryoverCount > 0) {
      lists.carryoverList = {
        studentId: student._id,
        matricNumber: student.matricNumber,
        name: student.name,
        courses: failedCourses.map(fc => fc.courseId),
        notes: `Failed ${carryoverCount} course(s)`,
        level: student.level
      };
    }

    return lists;
  }

  /**
   * Build complete summary statistics
   * @param {Object} counters - Various counters
   * @param {Object} gradeDistribution - Grade distribution
   * @param {Object} levelStats - Statistics by level
   * @returns {Object} Complete summary object
   */
  buildSummaryStats(counters, gradeDistribution, levelStats) {
    const {
      totalStudents,
      studentsWithResults,
      totalGPA,
      highestGPA,
      lowestGPA,
      totalCarryovers,
      affectedStudentsCount
    } = counters;

    // Calculate averages
    const averageGPA = studentsWithResults > 0 ? totalGPA / studentsWithResults : 0;

    // Calculate level averages
    Object.keys(levelStats).forEach(level => {
      if (levelStats[level].totalStudents > 0) {
        levelStats[level].averageGPA = levelStats[level].totalGPA / levelStats[level].totalStudents;
      }
    });

    return {
      totalStudents,
      studentsWithResults,
      averageGPA: parseFloat(averageGPA.toFixed(2)),
      highestGPA: parseFloat(highestGPA.toFixed(2)),
      lowestGPA: parseFloat(lowestGPA.toFixed(2)),
      gradeDistribution,
      totalCarryovers,
      affectedStudentsCount,
      levelStats
    };
  }

  /**
   * Build student result object for database
   * @param {string} studentId - Student ID
   * @param {string} departmentId - Department ID
   * @param {string} semesterId - Semester ID
   * @param {Array} semesterResults - Semester results
   * @param {Object} gpaData - GPA calculation data
   * @param {Object} academicStanding - Academic standing
   * @param {string} computedBy - User who computed
   * @param {string} computationSummaryId - Computation summary ID
   * @param {ResultService} resultService - Result service instance
   * @returns {Promise<Object>} Student result object
   */
  async buildStudentResult(
    studentId,
    departmentId,
    semesterId,
    semesterResults,
    gpaData,
    academicStanding,
    computedBy,
    computationSummaryId,
    resultService
  ) {
    const courseDetails = await Promise.all(
      semesterResults.map(async (result) => {
        const { grade, point } = this._calculateGradeAndPoints(result.score);
        const courseIsCore = await resultService.isCoreCourse(result.courseId?._id || result.courseId);

        return {
          courseId: result.courseId?._id || result.courseId,
          courseUnit: result.courseUnit || 1,
          score: result.score,
          grade,
          gradePoint: point,
          isCoreCourse: courseIsCore,
          isCarryover: result.isCarryover || false
        };
      })
    );

    return {
      studentId,
      departmentId,
      semesterId,
      courses: courseDetails,
      gpa: gpaData.semesterGPA,
      cgpa: gpaData.cgpa || 0,
      totalUnits: gpaData.totalUnits,
      totalPoints: gpaData.totalPoints,
      carryoverCount: gpaData.failedCount,
      remark: academicStanding.remark,
      computedBy,
      computationSummaryId,
      status: "processed",
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Format grade distribution for reporting
   * @param {Object} gradeDistribution - Raw grade distribution
   * @returns {Object} Formatted grade distribution
   */
  formatGradeDistribution(gradeDistribution) {
    return {
      firstClass: gradeDistribution.firstClass || 0,
      secondClassUpper: gradeDistribution.secondClassUpper || 0,
      secondClassLower: gradeDistribution.secondClassLower || 0,
      thirdClass: gradeDistribution.thirdClass || 0,
      fail: gradeDistribution.fail || 0,
      total: Object.values(gradeDistribution).reduce((sum, val) => sum + val, 0)
    };
  }

  /**
   * Calculate grade and points (internal helper)
   * @param {number} score - Student score
   * @returns {Object} Grade and point
   */
  _calculateGradeAndPoints(score) {
    if (score >= 70) return { grade: "A", point: 5 };
    if (score >= 60) return { grade: "B", point: 4 };
    if (score >= 50) return { grade: "C", point: 3 };
    if (score >= 45) return { grade: "D", point: 2 };
    return { grade: "F", point: 0 };
  }
}

export default new SummaryListBuilder();