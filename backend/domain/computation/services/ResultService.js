// // computation/services/ResultService.js
// import mongoose from "mongoose";
// import Result from "../../result/result.model.js";
// import courseModel from "../../course/course.model.js";

// class ResultService {
//   /**
//    * Fetch results for multiple students in a semester
//    * @param {Array} studentIds - Array of student IDs
//    * @param {string} semesterId - Semester ID
//    * @returns {Promise<Object>} Results grouped by student
//    */
//   async getResultsByStudents(studentIds, semesterId) {
//     try {
//       const results = await Result.find({
//         studentId: { $in: studentIds },
//         semester: semesterId,
//         deletedAt: null,
//       })
//         .populate("courseId", "type isCoreCourse code name credits level courseUnit")
//         .lean();

//       // Group results by student ID for efficient processing
//       return results.reduce((acc, result) => {
//         const studentId = result.studentId.toString();
//         if (!acc[studentId]) acc[studentId] = [];
//         acc[studentId].push(result);
//         return acc;
//       }, {});
//     } catch (error) {
//       console.error(`Error fetching results for semester ${semesterId}:`, error);
//       throw new Error(`Failed to fetch results: ${error.message}`);
//     }
//   }

//   /**
//    * Get course details
//    * @param {string} courseId - Course ID
//    * @returns {Promise<Object>} Course information
//    */
//   async getCourseDetails(courseId) {
//     try {
//       const course = await courseModel.findById(courseId)
//         .select("type isCoreCourse title courseCode unit level borrowedId")
//         .populate({
//           path: 'borrowedId',
//           select: 'type isCoreCourse title courseCode unit level',
//           model: 'Course' // Make sure this matches your model name
//         })
//         .lean();

//       if (!course) {
//         return null;
//       }

//       if (course.borrowedId) {
//         // Merge data from borrowed course and original course
//         const originalCourse = course.borrowedId;
//         return {
//           _id: course._id,
//           borrowedId: originalCourse._id,
//           type: course.type || originalCourse.type,
//           isCoreCourse: course.isCoreCourse || originalCourse.isCoreCourse,
//           title: course.title || originalCourse.title,
//           courseCode: course.courseCode || originalCourse.courseCode,
//           unit: course.unit || originalCourse.unit,
//           level: course.level || originalCourse.level,
//           isBorrowed: true
//         };
//       }

//       return {
//         ...course,
//         isBorrowed: false
//       };

//     } catch (error) {
//       console.error(`Error fetching course ${courseId}:`, error);
//       return null;
//     }
//   }

//   /**
//    * Check if a course is a core course
//    * @param {string} courseId - Course ID
//    * @returns {Promise<boolean>} True if core course
//    */
//   async isCoreCourse(courseId) {
//     try {
//       const course = await this.getCourseDetails(courseId);
//       return course ? (course.isCoreCourse === true || course.type === "core") : false;
//     } catch (error) {
//       console.error(`Error checking if course ${courseId} is core:`, error);
//       return true; // Default to true to be safe
//     }
//   }

//   /**
//    * Get all core courses for a department and level
//    * @param {string} departmentId - Department ID
//    * @param {number} level - Academic level
//    * @returns {Promise<Array>} List of core courses
//    */
//   async getCoreCourses(departmentId, level) {
//     try {
//       return await courseModel.find({
//         department: departmentId,
//         isCoreCourse: true,
//         level: level
//       }).select("_id title courseCode unit").lean();
//     } catch (error) {
//       console.error(`Error fetching core courses for department ${departmentId}, level ${level}:`, error);
//       return [];
//     }
//   }

//   /**
//    * Check if student has results in semester
//    * @param {string} studentId - Student ID
//    * @param {string} semesterId - Semester ID
//    * @returns {Promise<boolean>} True if student has results
//    */
//   async hasStudentResults(studentId, semesterId) {
//     try {
//       const count = await Result.countDocuments({
//         studentId,
//         semester: semesterId,
//         deletedAt: null
//       });
//       return count > 0;
//     } catch (error) {
//       console.error(`Error checking results for student ${studentId}:`, error);
//       return false;
//     }
//   }
// }

// export default new ResultService();
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
        .populate({
          path: "courseId",
          select: "type isCoreCourse title courseCode unit level borrowedId department",
          populate: {
            path: "borrowedId",
            select: "type isCoreCourse title courseCode unit level",
          }
        })
        .lean();

      // Process each result to handle borrowed courses
      const processedResults = results.map(result => {
        if (result.courseId) {
          result.courseId = this.processBorrowedCourse(result.courseId);
        }
        return result;
      });

      // Group results by student ID for efficient processing
      return processedResults.reduce((acc, result) => {
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
   * Process borrowed course data - merges borrowed course with original course data
   * @param {Object} course - Course document
   * @returns {Object} Processed course data
   */
  processBorrowedCourse(course) {
    if (!course) return null;
    
    // If course has borrowedId and borrowedId is populated
    if (course.borrowedId && typeof course.borrowedId === 'object') {
      const originalCourse = course.borrowedId;
      return {
        _id: course._id,
        borrowedId: originalCourse._id,
        department: course.department, // Keep the borrowing department
        type: originalCourse.type,
        isCoreCourse: originalCourse.isCoreCourse,
        title: originalCourse.title,
        courseCode: originalCourse.courseCode,
        unit: originalCourse.unit,
        level: originalCourse.level,
        isBorrowed: true,
        originalCourseCode: originalCourse.courseCode,
        originalTitle: originalCourse.title
      };
    }
    
    // For non-borrowed courses or if population didn't work
    return {
      ...course,
      isBorrowed: false
    };
  }

  /**
   * Get course details with borrowed course handling
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Course information
   */
  async getCourseDetails(courseId) {
    try {
      const course = await courseModel.findById(courseId)
        .select("type isCoreCourse title courseCode unit level borrowedId department")
        .populate({
          path: 'borrowedId',
          select: 'type isCoreCourse title courseCode unit level',
        })
        .lean();

      if (!course) {
        return null;
      }

      return this.processBorrowedCourse(course);

    } catch (error) {
      console.error(`Error fetching course ${courseId}:`, error);
      return null;
    }
  }

  /**
   * Check if a course is a core course (handles borrowed courses)
   * @param {string} courseId - Course ID
   * @returns {Promise<boolean>} True if core course
   */
  async isCoreCourse(courseId) {
    try {
      const course = await this.getCourseDetails(courseId);
      if (!course) return false;
      
      // Check both isCoreCourse field and type field
      return course.isCoreCourse === true || course.type === "core";
    } catch (error) {
      console.error(`Error checking if course ${courseId} is core:`, error);
      return true; // Default to true to be safe
    }
  }

  /**
   * Get all core courses for a department and level (handles borrowed courses)
   * @param {string} departmentId - Department ID
   * @param {number} level - Academic level
   * @returns {Promise<Array>} List of core courses
   */
  async getCoreCourses(departmentId, level) {
    try {
      // First get courses from the department (including borrowed ones)
      const courses = await courseModel.find({
        department: departmentId,
        level: level
      })
      .select("_id title courseCode unit level borrowedId department type isCoreCourse")
      .populate({
        path: 'borrowedId',
        select: 'type isCoreCourse title courseCode unit level',
      })
      .lean();

      // Process to handle borrowed courses and filter core courses
      const coreCourses = courses
        .map(course => this.processBorrowedCourse(course))
        .filter(course => course.isCoreCourse === true || course.type === "core");

      return coreCourses;

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