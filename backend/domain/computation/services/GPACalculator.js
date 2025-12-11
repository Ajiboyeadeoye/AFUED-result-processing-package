// computation/services/GPACalculator.js
import { GRADE_POINTS, GRADE_BOUNDARIES } from "../utils/computationConstants.js";
import Result from "../../result/result.model.js";
import studentSemseterResultModel from "../../student/student.semseterResult.model.js";
import mongoose from "mongoose";

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
    return { grade: "F", point: GRADE_POINTS.F };
  }

  /**
   * Check if grade is passing
   * @param {string} grade - Grade letter
   * @returns {boolean} True if passing grade
   */
  isPassingGrade(grade) {
    return grade !== "F";
  }

  /**
   * Calculate semester GPA for a student
   * @param {Array} results - Student's semester results
   * @returns {Object} GPA calculation results
   */
  calculateSemesterGPA(results) {
    let totalPoints = 0;
    let totalUnits = 0;
    const failedCourses = [];

    for (const result of results) {
      const score = result.score || 0;
      const { grade, point } = this.calculateGradeAndPoints(score);
      const courseUnit = result.courseUnit || result.courseId?.credits || 1;

      totalPoints += (point * courseUnit);
      totalUnits += courseUnit;

      if (!this.isPassingGrade(grade)) {
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
      failedCourses,
      failedCount: failedCourses.length
    };
  }

  /**
   * Calculate CGPA for a student
   * @param {string} studentId - Student ID
   * @param {string} currentSemesterId - Current semester ID
   * @param {number} currentSemesterPoints - Current semester points
   * @param {number} currentSemesterUnits - Current semester units
   * @returns {Promise<Object>} CGPA data
   */
  async calculateStudentCGPA(studentId, currentSemesterId, currentSemesterPoints = 0, currentSemesterUnits = 0) {
    try {
      const previousResults = await studentSemseterResultModel.find({
        studentId,
        semesterId: { $ne: currentSemesterId }
      }).select("totalPoints totalUnits gpa").lean();

      let totalPoints = currentSemesterPoints;
      let totalUnits = currentSemesterUnits;

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

  /**
   * Optimized CGPA calculation using aggregation
   * @param {string} studentId - Student ID
   * @param {string} semesterId - Current semester ID
   * @param {number} semesterGPA - Current semester GPA
   * @param {number} semesterPoints - Current semester points
   * @param {number} semesterUnits - Current semester units
   * @returns {Promise<Object>} CGPA data
   */
  async calculateStudentCGPAOptimized(studentId, semesterId, semesterGPA, semesterPoints, semesterUnits) {
    try {
      const result = await Result.aggregate([
        {
          $match: {
            studentId: new mongoose.Types.ObjectId(studentId),
            semester: { $ne: new mongoose.Types.ObjectId(semesterId) },
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

      return { cgpa, totalPoints, totalUnits };
    } catch (error) {
      console.error(`Error in optimized CGPA calculation for student ${studentId}:`, error);
      return await this.calculateStudentCGPA(studentId, semesterId, semesterPoints, semesterUnits);
    }
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
}

export default new GPACalculator();