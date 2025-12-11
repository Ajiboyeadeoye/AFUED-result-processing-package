// computation/services/ResultService.js
import mongoose from "mongoose";
import Result from "../../result/result.model.js";
import courseModel from "../../course/course.model.js";

class ResultService {
  /**
   * Fetch results for multiple students in a semester
   * @param {Array} studentIds - Array of student IDs
   * @param {string} semesterId - Semester ID
   * @returns {Promise<Object>} Results grouped by student
   */
  async getResultsByStudents(studentIds, semesterId) {
    try {
      const results = await Result.find({
        studentId: { $in: studentIds },
        semester: semesterId,
        deletedAt: null,
      })
        .populate("courseId", "type isCoreCourse code name credits level courseUnit")
        .lean();

      // Group results by student ID for efficient processing
      return results.reduce((acc, result) => {
        const studentId = result.studentId.toString();
        if (!acc[studentId]) acc[studentId] = [];
        acc[studentId].push(result);
        return acc;
      }, {});
    } catch (error) {
      console.error(`Error fetching results for semester ${semesterId}:`, error);
      throw new Error(`Failed to fetch results: ${error.message}`);
    }
  }

  /**
   * Get course details
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Course information
   */
  async getCourseDetails(courseId) {
    try {
      return await courseModel.findById(courseId)
        .select("courseType isCoreCourse title courseCode unit level")
        .lean();
    } catch (error) {
      console.error(`Error fetching course ${courseId}:`, error);
      return null;
    }
  }

  /**
   * Check if a course is a core course
   * @param {string} courseId - Course ID
   * @returns {Promise<boolean>} True if core course
   */
  async isCoreCourse(courseId) {
    try {
      const course = await this.getCourseDetails(courseId);
      return course ? (course.isCoreCourse === true || course.courseType === "core") : false;
    } catch (error) {
      console.error(`Error checking if course ${courseId} is core:`, error);
      return true; // Default to true to be safe
    }
  }

  /**
   * Get all core courses for a department and level
   * @param {string} departmentId - Department ID
   * @param {number} level - Academic level
   * @returns {Promise<Array>} List of core courses
   */
  async getCoreCourses(departmentId, level) {
    try {
      return await courseModel.find({
        department: departmentId,
        isCoreCourse: true,
        level: level
      }).select("_id title courseCode unit").lean();
    } catch (error) {
      console.error(`Error fetching core courses for department ${departmentId}, level ${level}:`, error);
      return [];
    }
  }

  /**
   * Check if student has results in semester
   * @param {string} studentId - Student ID
   * @param {string} semesterId - Semester ID
   * @returns {Promise<boolean>} True if student has results
   */
  async hasStudentResults(studentId, semesterId) {
    try {
      const count = await Result.countDocuments({
        studentId,
        semester: semesterId,
        deletedAt: null
      });
      return count > 0;
    } catch (error) {
      console.error(`Error checking results for student ${studentId}:`, error);
      return false;
    }
  }
}

export default new ResultService();