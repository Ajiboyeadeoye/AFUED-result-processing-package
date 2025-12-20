// computation/services/CarryoverService.js
import mongoose from "mongoose";
import CarryoverCourse from "../../result/carryover.model.js";
import studentModel from "../../student/student.model.js";
import ResultService from "./ResultService.js";

class CarryoverService {
  /**
   * Add course to carryover buffer
   * @param {Object} params - Carryover parameters
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object|null>} Created carryover record
   */
  async addToCarryoverBuffer(params, session = null) {
    const {
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
    } = params;

    const sessionToUse = session || await mongoose.startSession();
    let shouldEndSession = !session;

    try {
      if (!session) {
        await sessionToUse.startTransaction();
      }

      // Check if course is core
      const courseIsCore = await ResultService.isCoreCourse(courseId);
      if (!courseIsCore) {
        if (!session && shouldEndSession) {
          await sessionToUse.commitTransaction();
          sessionToUse.endSession();
        }
        return null;
      }

      // Check for existing carryover
      const existingCarryover = await CarryoverCourse.findOne({
        student: studentId,
        course: courseId,
        semester: semesterId,
        cleared: false
      }).session(sessionToUse);

      if (existingCarryover) {
        if (!session && shouldEndSession) {
          await sessionToUse.commitTransaction();
          sessionToUse.endSession();
        }
        return existingCarryover;
      }

      // Create new carryover record
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

      await carryover.save({ session: sessionToUse });

      // Update student record
      await studentModel.findByIdAndUpdate(
        studentId,
        {
          $addToSet: { carryoverCourses: courseId },
          $inc: { totalCarryovers: 1 }
        },
        { session: sessionToUse }
      );

      if (!session && shouldEndSession) {
        await sessionToUse.commitTransaction();
      }

      return carryover;
    } catch (error) {
      if (!session && shouldEndSession) {
        await sessionToUse.abortTransaction();
      }
      console.error(`Failed to add to carryover buffer:`, error);
      throw error;
    } finally {
      if (!session && shouldEndSession) {
        sessionToUse.endSession();
      }
    }
  }

  /**
   * Handle missing results (courses not registered)
   * @param {string} studentId - Student ID
   * @param {string} departmentId - Department ID
   * @param {string} semesterId - Semester ID
   * @param {string} computationBatchId - Computation batch ID
   * @param {Object} session - MongoDB session
   */
  async handleMissingResults(studentId, departmentId, semesterId, computationBatchId, session = null) {
    try {
      const student = await studentModel.findById(studentId).select("level");
      if (!student) return;

      const departmentCourses = await ResultService.getCoreCourses(departmentId, student.level);

      for (const course of departmentCourses) {
        const existingResult = await ResultService.hasStudentResults(studentId, semesterId, course._id);

        if (!existingResult) {
          try {
            await this.addToCarryoverBuffer({
              studentId,
              courseId: course._id,
              semesterId,
              departmentId,
              resultId: null,
              grade: "F",
              score: 0,
              computationBatchId,
              createdBy: null,
              reason: "NotRegistered"
            }, session);
          } catch (error) {
            console.error(`Failed to add missing course ${course._id} to carryover:`, error);
          }
        }
      }
    } catch (error) {
      console.error("Error handling missing results:", error);
    }
  }

  /**
   * Process failed courses in batch
   * @param {Array} failedCourses - List of failed courses
   * @param {string} studentId - Student ID
   * @param {string} semesterId - Semester ID
   * @param {string} departmentId - Department ID
   * @param {string} computationSummaryId - Computation summary ID
   * @param {string} computedBy - User who computed
   * @returns {Promise<Array>} Carryover buffer entries
   */
 // computation/services/CarryoverService.js
// ... existing code ...

async processFailedCourses(failedCourses, studentId, semesterId, departmentId, computationSummaryId, computedBy) {
  const carryoverBuffers = [];

  for (const failedCourse of failedCourses) {
    // DEBUG: Log failed course details
    console.log(`Processing failed course for student ${studentId}:`, {
      courseId: failedCourse.courseId,
      resultId: failedCourse.resultId,
      grade: failedCourse.grade,
      score: failedCourse.score,
      courseType: failedCourse.courseType
    });

    // Check if it's a core course (only process core courses as carryovers)
    const courseIsCore = await ResultService.isCoreCourse(failedCourse.courseId);
    
    if (courseIsCore) {
      carryoverBuffers.push({
        student: studentId,
        course: failedCourse.courseId,
        semester: semesterId,
        department: departmentId,
        result: failedCourse.resultId,
        grade: failedCourse.grade,
        score: failedCourse.score,
        reason: "Failed",
        isCoreCourse: true,
        cleared: false,
        createdBy: computedBy,
        computationBatch: computationSummaryId,
        createdAt: new Date()
      });
    } else {
      console.log(`Course ${failedCourse.courseId} is not core, skipping carryover`);
    }
  }

  console.log(`Created ${carryoverBuffers.length} carryover buffers for student ${studentId}`);
  return carryoverBuffers;
}

// ... rest of the file ...
  /**
   * Get detailed carryover information
   * @param {Array} carryoverStudentsBuffer - Buffer of students with carryovers
   * @param {string} semesterId - Semester ID
   * @returns {Promise<Array>} Detailed carryover info
   */
  async getDetailedCarryoverInfo(carryoverStudentsBuffer, semesterId) {
    if (carryoverStudentsBuffer.length === 0) return [];

    // Limit to first 100 for summary
    const limitedBuffer = carryoverStudentsBuffer.slice(0, 100);

    // Get student and course details
    const studentIds = limitedBuffer.map(s => s.studentId);
    const courseIds = limitedBuffer.flatMap(s => s.courses || []);

    const [students, courses] = await Promise.all([
      studentModel.find({ _id: { $in: studentIds } })
        .populate('_id', 'name matricNumber')
        .lean(),
      ResultService.getCourseDetails(courseIds)
    ]);

    // Create lookup maps
    const studentMap = students.reduce((acc, student) => {
      acc[student._id.toString()] = {
        name: student.name,
        matricNumber: student.matricNumber
      };
      return acc;
    }, {});

    const courseMap = Array.isArray(courses) ? courses.reduce((acc, course) => {
      acc[course._id.toString()] = {
        code: course.courseCode,
        name: course.title
      };
      return acc;
    }, {}) : {};

    // Build detailed info
    return limitedBuffer.map(student => ({
      studentId: student.studentId,
      matricNumber: studentMap[student.studentId.toString()]?.matricNumber || student.matricNumber,
      name: studentMap[student.studentId.toString()]?.name || student.name,
      courses: student.courses.map(courseId => courseMap[courseId.toString()] || courseId),
      notes: student.notes
    }));
  }

  /**
   * Clear a carryover record
   * @param {string} carryoverId - Carryover ID
   * @param {Object} data - Clearance data
   * @param {string} clearedBy - User who cleared
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Cleared carryover
   */
  async clearCarryover(carryoverId, data, clearedBy, session = null) {
    const sessionToUse = session || await mongoose.startSession();
    let shouldEndSession = !session;

    try {
      if (!session) {
        await sessionToUse.startTransaction();
      }

      const carryover = await CarryoverCourse.findById(carryoverId).session(sessionToUse);

      if (!carryover) {
        throw new Error("Carryover not found");
      }

      if (carryover.cleared) {
        throw new Error("Carryover is already cleared");
      }

      // Update carryover record
      carryover.cleared = true;
      carryover.clearedAt = new Date();
      carryover.clearedBy = clearedBy;
      carryover.remark = data.remark;
      if (data.resultId) carryover.result = data.resultId;

      await carryover.save({ session: sessionToUse });

      // Remove from student's carryover list
      await studentModel.findByIdAndUpdate(
        carryover.student,
        {
          $pull: { carryoverCourses: carryover.course },
          $inc: { totalCarryovers: -1 }
        },
        { session: sessionToUse }
      );

      if (!session && shouldEndSession) {
        await sessionToUse.commitTransaction();
      }

      return carryover;
    } catch (error) {
      if (!session && shouldEndSession) {
        await sessionToUse.abortTransaction();
      }
      throw error;
    } finally {
      if (!session && shouldEndSession) {
        sessionToUse.endSession();
      }
    }
  }
}

export default new CarryoverService();