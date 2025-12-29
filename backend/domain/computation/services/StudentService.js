// computation/services/StudentService.js
import mongoose from "mongoose";
import studentModel from "../../student/student.model.js";
import departmentModel from "../../department/department.model.js";

class StudentService {
  /**
   * Fetch students with basic info for processing
   * @param {string} departmentId - Department ID
   * @param {number} limit - Batch size
   * @param {number} skip - Offset
   * @returns {Promise<Array>} List of students
   */
  async getStudentsForProcessing(departmentId, limit = 100, skip = 0) {
    try {
      const students = await studentModel.aggregate([
        {
          $match: {
            departmentId: new mongoose.Types.ObjectId(departmentId),
            terminationStatus: { $in: ["none", "probation", null] }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userInfo"
          }
        },
        { $unwind: "$userInfo" },
        {
          $project: {
            _id: 1,
            name: "$userInfo.name",
            email: "$userInfo.email",
            matricNumber: 1,
            level: 1,
            probationStatus: 1,
            terminationStatus: 1,
            cgpa: 1,
            totalCarryovers: 1,
            departmentId: 1
          }
        },
        { $skip: skip },
        { $limit: limit }
      ]);

      return students;
    } catch (error) {
      console.error(`Error fetching students for department ${departmentId}:`, error);
      throw new Error(`Failed to fetch students: ${error.message}`);
    }
  }

  /**
   * Get total student count for a department
   * @param {string} departmentId - Department ID
   * @returns {Promise<number>} Total student count
   */
  async getStudentCount(departmentId) {
    try {
      return await studentModel.countDocuments({
        departmentId: departmentId,
        terminationStatus: { $in: ["none", "probation", null] }
      });
    } catch (error) {
      console.error(`Error counting students for department ${departmentId}:`, error);
      return 0;
    }
  }

  /**
   * Get student IDs in batches
   * @param {string} departmentId - Department ID
   * @returns {Promise<Array>} List of student IDs
   */
  async getStudentIds(departmentId) {
    try {
      const students = await studentModel.find({
        departmentId: departmentId,
        terminationStatus: { $in: ["none", "probation", null, "terminated"] }
      }, '_id').lean();

      return students.map(s => s._id);
    } catch (error) {
      console.error(`Error fetching student IDs for department ${departmentId}:`, error);
      return [];
    }
  }

  /**
   * Fetch students with all necessary details in batch
   * @param {Array} studentIds - Array of student IDs
   * @returns {Promise<Array>} Detailed student information
   */
  async getStudentsWithDetails(studentIds) {
    try {
      return await studentModel.aggregate([
        {
          $match: { _id: { $in: studentIds } }
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userInfo"
          }
        },
        { $unwind: "$userInfo" },
        {
          $project: {
            _id: 1,
            name: "$userInfo.name",
            email: "$userInfo.email",
            matricNumber: 1,
            level: 1,
            probationStatus: 1,
            terminationStatus: 1,
            cgpa: 1,
            totalCarryovers: 1,
            departmentId: 1,
            suspension: 1
          }
        }
      ]);
    } catch (error) {
      console.error('Error fetching student details:', error);
      throw error;
    }
  }

  /**
   * Update student academic records
   * @param {string} studentId - Student ID
   * @param {Object} updates - Update data
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Updated student
   */
  async updateStudentAcademicRecord(studentId, updates, session = null) {
    try {
      const options = session ? { session } : {};
      return await studentModel.findByIdAndUpdate(
        studentId,
        {
          $set: updates.set || {},
          $inc: updates.increment || {}
        },
        { new: true, ...options }
      );
    } catch (error) {
      console.error(`Error updating student ${studentId}:`, error);
      throw error;
    }
  }

  /**
   * Get department details
   * @param {string} departmentId - Department ID
   * @returns {Promise<Object>} Department information
   */
  async getDepartmentDetails(departmentId) {
    try {
      return await departmentModel.findById(departmentId)
        .select('name code hod status')
        .lean();
    } catch (error) {
      console.error(`Error fetching department ${departmentId}:`, error);
      throw error;
    }
  }
}

export default new StudentService();