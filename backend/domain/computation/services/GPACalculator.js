// services/GPACalculator.js
import { GRADE_POINTS, GRADE_BOUNDARIES, PASSING_GRADES, FAILING_GRADE } from "../utils/computationConstants.js";
import Result from "../../result/result.model.js";
import mongoose from "mongoose";
import studentSemesterResultModel from "../../student/student.semseterResult.model.js";

class GPACalculator {
  /**
   * Calculate grade and grade point based on score
   * @param {number} score - Student score
   * @returns {Object} Grade and point
   */
  calculateGradeAndPoints(score) {
    if (score >= GRADE_BOUNDARIES.A) return { grade: "A", point: GRADE_POINTS.A };
    if (score >= GRADE_BOUNDARIES.B) return { grade: "B", point: GRADE_POINTS.B };
    if (score >= GRADE_BOUNDARIES.C) return { grade: "C", point: GRADE_POINTS.C };
    if (score >= GRADE_BOUNDARIES.D) return { grade: "D", point: GRADE_POINTS.D };
    if (score >= GRADE_BOUNDARIES.E) return { grade: "E", point: GRADE_POINTS.E }; // Added E
    return { grade: "F", point: GRADE_POINTS.F };
  }

  /**
   * Calculate credit points (point * unit load)
   * @param {number} point - Grade point
   * @param {number} unitLoad - Course unit load
   * @returns {number} Credit points
   */
  calculateCreditPoints(point, unitLoad) {
    return point * unitLoad;
  }

  /**
   * Check if grade is passing
   * @param {string} grade - Grade letter
   * @returns {boolean} True if passing grade
   */
  isPassingGrade(grade) {
    return PASSING_GRADES.includes(grade);
  }

  /**
   * Check if grade is failing (F)
   * @param {string} grade - Grade letter
   * @returns {boolean} True if failing grade
   */
  isFailingGrade(grade) {
    return grade === FAILING_GRADE;
  }

  /**
   * Calculate semester GPA for a student with detailed breakdown
   * @param {Array} results - Student's semester results
   * @returns {Object} GPA calculation results
   */
  calculateSemesterGPA(results) {
    let totalPoints = 0;
    let totalUnits = 0;
    let totalCreditPoints = 0;
    const failedCourses = [];
    const courseResults = [];

    for (const result of results) {
      const score = result.score || 0;
      const { grade, point } = this.calculateGradeAndPoints(score);
      const courseUnit = result.courseUnit || result.courseId?.credits || result.courseId?.unit || 1;
      const creditPoint = this.calculateCreditPoints(point, courseUnit);
      const isCoreCourse = result.courseId?.isCoreCourse || result.courseId?.type === "core" || false;

      totalPoints += (point * courseUnit);
      totalUnits += courseUnit;
      totalCreditPoints += creditPoint;

      // Store course result for master sheet
      courseResults.push({
        courseId: result.courseId?._id || result.courseId,
        courseCode: result.courseId?.courseCode || result.courseCode,
        courseTitle: result.courseId?.title || result.courseTitle,
        unitLoad: courseUnit,
        score,
        grade,
        gradePoint: point,
        creditPoint,
        isCoreCourse,
        status: this.isPassingGrade(grade) ? "passed" : "failed"
      });

      if (this.isFailingGrade(grade)) {
        failedCourses.push({
          courseId: result.courseId?._id || result.courseId,
          resultId: result._id,
          grade,
          score,
          courseUnit,
          courseType: result.courseId?.type || "general",
          courseLevel: result.courseId?.level || result.level
        });
      }
    }

    const semesterGPA = totalUnits > 0
      ? parseFloat((totalPoints / totalUnits).toFixed(2))
      : 0;

    return {
      semesterGPA,
      totalPoints,
      totalUnits,
      totalCreditPoints,
      failedCourses,
      failedCount: failedCourses.length,
      courseResults // For master sheet
    };
  }

  /**
   * Calculate CGPA for a student with TCP/TNU breakdown
   * @param {string} studentId - Student ID
   * @param {string} currentSemesterId - Current semester ID
   * @param {number} currentTCP - Current semester TCP
   * @param {number} currentTNU - Current semester TNU
   * @returns {Promise<Object>} CGPA data with TCP/TNU
   */
  async calculateStudentCGPAWithTCP(studentId, currentSemesterId, currentTCP = 0, currentTNU = 0) {
    try {
      // Get all previous semester results
      const previousResults = await studentSemesterResultModel.find({
        studentId,
        semesterId: { $ne: currentSemesterId },
        isPreview: false
      }).select("totalPoints totalUnits currentTCP currentTNU cumulativeTCP cumulativeTNU cgpa").lean();

      let totalPoints = 0;
      let totalUnits = 0;
      let previousCumulativeTCP = 0;
      let previousCumulativeTNU = 0;
      let latestCGPA = 0;

      // Use the latest result for previous cumulative data
      if (previousResults.length > 0) {
        const latestResult = previousResults.reduce((latest, current) =>
          new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
        );

        previousCumulativeTCP = latestResult.cumulativeTCP || 0;
        previousCumulativeTNU = latestResult.cumulativeTNU || 0;
        latestCGPA = latestResult.cgpa || 0;

        // Sum all previous points/units for total calculation
        for (const result of previousResults) {
          totalPoints += result.totalPoints || 0;
          totalUnits += result.totalUnits || 0;
        }
      }

      // Add current semester
      totalPoints += currentTCP;
      totalUnits += currentTNU;

      // Calculate cumulative values
      const cumulativeTCP = previousCumulativeTCP + currentTCP;
      const cumulativeTNU = previousCumulativeTNU + currentTNU;

      // Calculate CGPA
      const cgpa = totalUnits > 0 ? parseFloat((totalPoints / totalUnits).toFixed(2)) : latestCGPA;

      return {
        cgpa,
        totalPoints,
        totalUnits,
        previousCumulativeTCP,
        previousCumulativeTNU,
        currentTCP,
        currentTNU,
        cumulativeTCP,
        cumulativeTNU
      };
    } catch (error) {
      console.error(`Error calculating CGPA with TCP for student ${studentId}:`, error);
      return {
        cgpa: 0,
        totalPoints: 0,
        totalUnits: 0,
        previousCumulativeTCP: 0,
        previousCumulativeTNU: 0,
        currentTCP: 0,
        currentTNU: 0,
        cumulativeTCP: 0,
        cumulativeTNU: 0
      };
    }
  }

  /**
   * Optimized CGPA calculation without previous records lookup
   * @param {number} previousCGPA - Previous CGPA
   * @param {number} previousTNU - Previous total number of units
   * @param {number} currentTCP - Current semester total credit points
   * @param {number} currentTNU - Current semester total number of units
   * @returns {Object} CGPA calculation
   */
  calculateCGPAOptimized(previousCGPA, previousTNU, currentTCP, currentTNU) {
    if (previousTNU <= 0 && currentTNU <= 0) {
      return { cgpa: 0, cumulativeTCP: 0, cumulativeTNU: 0 };
    }

    const previousTCP = previousCGPA * previousTNU;
    const cumulativeTCP = previousTCP + currentTCP;
    const cumulativeTNU = previousTNU + currentTNU;
    const cgpa = cumulativeTNU > 0 ? parseFloat((cumulativeTCP / cumulativeTNU).toFixed(2)) : 0;

    return {
      cgpa,
      cumulativeTCP,
      cumulativeTNU,
      previousTCP,
      previousTNU
    };
  }

  /**
   * Get grade classification based on GPA
   * @param {number} gpa - Student GPA
   * @returns {string} Grade classification
   */
  getGradeClassification(gpa) {
    if (gpa >= 4.50) return "firstClass";
    if (gpa >= 3.50) return "secondClassUpper";
    if (gpa >= 2.40) return "secondClassLower";
    if (gpa >= 1.50) return "thirdClass";
    return "fail";
  }

  /**
   * Calculate academic history for MMS2
   * @param {string} studentId - Student ID
   * @returns {Promise<Array>} Academic history
   */
  async calculateAcademicHistory(studentId) {
    try {
      const semesterResults = await studentSemesterResultModel.find({
        studentId,
        isPreview: false
      })
        .populate('semesterId', 'name session')
        .sort({ createdAt: 1 })
        .lean();

      return semesterResults.map(result => ({
        session: result.session,
        semester: result.semesterId?.name || '',
        level: result.level,
        tcp: result.currentTCP || 0,
        tnu: result.currentTNU || 0,
        gpa: result.gpa || 0,
        cgpa: result.cgpa || 0
      }));
    } catch (error) {
      console.error(`Error calculating academic history for student ${studentId}:`, error);
      return [];
    }
  }



  /**
   * Check if student is in termination or withdrawal status
   * @param {Object} academicStanding - Academic standing object
   * @returns {boolean} True if terminated or withdrawn
   */
  isStudentTerminatedOrWithdrawn(academicStanding) {
    if (!academicStanding) return false;

    const remark = String(academicStanding.remark || '').toUpperCase();
    const status = String(academicStanding.status || '').toLowerCase();

    return (
      remark.includes('TERMINATED') ||
      remark.includes('WITHDRAW') ||
      status.includes('terminated') ||
      status.includes('withdraw') ||
      status.includes('withdrawal')
    );
  }

  /**
   * Calculate outstanding courses
   * @param {string} studentId - Student ID
   * @param {string} currentSemesterId - Current semester ID
   * @returns {Promise<Array>} Outstanding courses
   */
  async calculateOutstandingCourses(studentId, currentSemesterId,  academicStanding = null) {
    // If academicStanding is provided and student is terminated/withdrawn, return empty array
    if (academicStanding && this.isStudentTerminatedOrWithdrawn(academicStanding)) {
      console.log(`Skipping outstanding courses for terminated/withdrawn student: ${studentId}`);
      return [];
    }
    try {
      const failedResults = await Result.find({
        studentId,
        semester: currentSemesterId,  // ⭐ ONLY current semester!
        grade: 'F',
        deletedAt: null
      })
        .populate({
          path: 'courseId',
          select: 'type isCoreCourse title courseCode unit level borrowedId department',
          populate: {
            path: 'borrowedId',
            select: 'type isCoreCourse title courseCode unit level',
          }
        })
        .lean();

      // Process and return current semester failures
      const outstandingCourses = [];

      for (const result of failedResults) {
        const course = result.courseId;
        if (!course) continue;

        // Process borrowed course - CORRECT LOGIC
        let processedCourse;
        if (course.borrowedId) {
          // This is a borrowed course - use the original course data
          processedCourse = {
            _id: course.borrowedId._id || course._id,
            courseCode: course.borrowedId.courseCode || course.courseCode,
            title: course.borrowedId.title || course.title,
            unit: course.borrowedId.unit || course.unit,
            level: course.borrowedId.level || course.level,
            type: course.borrowedId.type || course.type,
            isCoreCourse: course.borrowedId.isCoreCourse || course.isCoreCourse,
            isBorrowed: true,
            originalCourseId: course._id,
            originalCourseCode: course.courseCode
          };
        } else {
          // This is a regular course
          processedCourse = {
            _id: course._id,
            courseCode: course.courseCode,
            title: course.title,
            unit: course.unit,
            level: course.level,
            type: course.type,
            isCoreCourse: course.isCoreCourse,
            isBorrowed: false
          };
        }

        outstandingCourses.push({
          courseId: processedCourse._id,
          courseCode: processedCourse.courseCode,
          courseTitle: processedCourse.title,
          unitLoad: processedCourse.unit || 1,
          score: result.score,
          grade: result.grade,
          fromSemester: currentSemesterId,
          isCurrentSemester: true,
          attempts: 1,
          // Additional fields for clarity
          isBorrowed: processedCourse.isBorrowed || false,
          originalCourseCode: processedCourse.isBorrowed ? course.courseCode : null
        });
      }

      return outstandingCourses;

    } catch (error) {
      console.error(`Error:`, error);
      return [];
    }
  }
  /**
   * Get passing and failing grade counts
   * @param {Array} results - Student results
   * @returns {Object} Grade counts
   */
  getGradeCounts(results) {
    let passingCount = 0;
    let failingCount = 0;
    const gradeDistribution = {
      A: 0, B: 0, C: 0, D: 0, E: 0, F: 0
    };

    for (const result of results) {
      const { grade } = this.calculateGradeAndPoints(result.score || 0);
      gradeDistribution[grade]++;

      if (this.isPassingGrade(grade)) {
        passingCount++;
      } else {
        failingCount++;
      }
    }

    return {
      passingCount,
      failingCount,
      gradeDistribution
    };
  }
}

export default new GPACalculator();