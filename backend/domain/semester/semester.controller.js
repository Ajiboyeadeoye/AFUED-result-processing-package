import Semester from "./semester.model.js";
import Settings from "../settings/settings.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import mongoose from "mongoose";
import { AcademicSemester } from "./semester.academicModel.js";
import departmentModel from "../department/department.model.js";
import { response } from "express";
import studentModel from "../student/student.model.js";

/**
 * Type-safe
 */
const VALID_SEMESTERS = ["first", "second", "summer"];
const sessionRegex = /^\d{4}\/\d{4}$/;
const nameRegex = /^(First|Second|Summer)\sSemester$/;

// 🔹 Start new semester (admin only)
export const startNewSemester = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, session: sessionYear, levelSettings } = req.body;
    const userId = req.user._id;

    // Admin only
    if (req.user.role !== "admin") {
      await session.abortTransaction();
      return buildResponse(res, 403, "Only admin can start new semester", null, true);
    }

    if (!name || !sessionYear) {
      await session.abortTransaction();
      return buildResponse(res, 400, "Name and session are required", null, true);
    }

    if (!VALID_SEMESTERS.includes(name)) {
      await session.abortTransaction();
      return buildResponse(res, 400, "Invalid semester name", null, true);
    }

    if (!sessionRegex.test(sessionYear)) {
      await session.abortTransaction();
      return buildResponse(res, 400, "Invalid session format. Use YYYY/YYYY", null, true);
    }

    // Default settings per level
    const defaultLevelSettings = levelSettings || [
      { level: 100, minUnits: 12, maxUnits: 24 },
      { level: 200, minUnits: 12, maxUnits: 24 },
      { level: 300, minUnits: 12, maxUnits: 24 },
      { level: 400, minUnits: 12, maxUnits: 24 }
    ];

    // --------- END OLD ACADEMIC SEMESTERS -----------
    await AcademicSemester.updateMany(
      { isActive: true },
      { isActive: false, endDate: new Date() },
      { session }
    );

    // --------- CREATE NEW ACADEMIC SEMESTER ----------
    const academicSemester = await AcademicSemester.create(
      [{
        name,
        session: sessionYear,
        startDate: new Date(),
        isActive: true
      }],
      { session }
    );

    const academicSemesterDoc = academicSemester[0];

    // --------- FETCH ALL DEPARTMENTS ------------------
    const departments = await departmentModel.find({}, null, { session });
    if (departments.length === 0) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No departments found", null, true);
    }

    // --------- END ACTIVE DEPARTMENT SEMESTERS --------
    await Semester.updateMany(
      { isActive: true },
      { isActive: false, endDate: new Date() },
      { session }
    );

    // --------- CREATE PER-DEPARTMENT SEMESTERS --------
    const departmentSemesters = await Promise.all(
      departments.map((dept) =>
        Semester.create(
          [{
            academicSemester: academicSemesterDoc._id,
            name,
            session: sessionYear,
            department: dept._id,
            levelSettings: defaultLevelSettings,
            isActive: true,
            isRegistrationOpen: false,
            isResultsPublished: false,
            createdBy: userId
          }],
          { session }
        )
      )
    );

    // Flatten the array
    const departmentSemesterDocs = departmentSemesters.map(s => s[0]);

    // --------- UPDATE SETTINGS ------------------------
    const settings = await Settings.findOneAndUpdate(
      {},
      {
        currentSession: sessionYear,
        currentSemester: name,
        activeAcademicSemesterId: academicSemesterDoc._id,
        registrationOpen: false,
        resultPublicationOpen: false,
        updatedBy: userId,
      },
      { new: true, upsert: true, session }
    );

    // Commit all operations
    await session.commitTransaction();
    session.endSession();

    return buildResponse(res, 200, "New semester started successfully", {
      academicSemester: academicSemesterDoc,
      departmentSemesters: departmentSemesterDocs,
      settings,
    });

  } catch (error) {
    console.error("Error starting new semester:", error);
    await session.abortTransaction();
    session.endSession();
    return buildResponse(res, 500, "Failed to start new semester", null, true, error);
  }
};

// 🔥 Clean & Optimized Registration Toggle
export const toggleRegistration = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    // 🔹 Resolve department based on user role
    let departmentId;

    if (userRole === "admin") {
      if (!req.body.departmentId) {
        return buildResponse(res, 400, "Department ID required for admin", null, true);
      }
      departmentId = req.body.departmentId;

    } else if (userRole === "hod" || userRole === "dean") {
      const dept = await departmentModel.findOne({ hod: req.user._id });

      if (!dept) {
        return buildResponse(res, 400, "No department assigned to user", null, true);
      }

      departmentId = dept._id;

    } else {
      return buildResponse(res, 403, "Insufficient permissions", null, true);
    }

    // 🔹 Fetch active semester for department
    const semester = await Semester.findOne({ department: departmentId, isActive: true });

    if (!semester) {
      return buildResponse(res, 404, "No active semester found for this department", null, true);
    }

    // 🔹 Toggling logic (THE REAL FIX 🔥)
    const newStatus = !semester.isRegistrationOpen;

    // 🔹 Update semester
    const updated = await Semester.findOneAndUpdate(
      { department: departmentId, isActive: true },
      { isRegistrationOpen: newStatus, updatedBy: userId },
      { new: true }
    );

    if (!updated) {
      return buildResponse(res, 500, "Failed to update registration status", null, true);
    }

    // 🔹 Response
    return buildResponse(
      res,
      200,
      `Course registration ${newStatus ? "opened" : "closed"} successfully`,
      updated
    );

  } catch (error) {
    console.error("Error updating registration:", error);
    return buildResponse(res, 500, "Error updating registration", null, true, error);
  }
};

// 🔹 Toggle results publication (HOD/Admin/Dean)
export const toggleResultPublication = async (req, res) => {
  try {
    const { status, departmentId } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (typeof status !== 'boolean') {
      return buildResponse(res, 400, "Status must be a boolean", null, true);
    }

    // Admin can toggle for any department, HOD/Dean only for their department
    if (userRole === 'admin') {
      if (!departmentId) {
        return buildResponse(res, 400, "Department ID required for admin", null, true);
      }

      const semester = await Semester.findOneAndUpdate(
        { department: departmentId, isActive: true },
        { isResultsPublished: status, updatedBy: userId },
        { new: true }
      );

      if (!semester) {
        return buildResponse(res, 404, "No active semester found for this department", null, true);
      }

      return buildResponse(res, 200, `Result publication ${status ? "opened" : "closed"} for department`, semester);

    } else if (userRole === 'hod' || userRole === 'dean') {
      const userDepartment = req.user.department;

      if (!userDepartment) {
        return buildResponse(res, 400, "No department assigned to user", null, true);
      }

      const semester = await Semester.findOneAndUpdate(
        { department: userDepartment, isActive: true },
        { isResultsPublished: status, updatedBy: userId },
        { new: true }
      );

      if (!semester) {
        return buildResponse(res, 404, "No active semester found for your department", null, true);
      }

      return buildResponse(res, 200, `Result publication ${status ? "opened" : "closed"} for your department`, semester);

    } else {
      return buildResponse(res, 403, "Insufficient permissions", null, true);
    }
  } catch (error) {
    console.error("Error updating result publication:", error);
    return buildResponse(res, 500, "Error updating result publication", null, true, error);
  }
};

// 🔹 Get active semester (anyone)
export const getActiveSemester = async (req, res) => {
  try {
    let departmentFilter = {};


    // HOD/Dean
    if (req.user.role === "hod" || req.user.role === "dean") {
      const userDept = await departmentModel.findOne({ hod: req.user._id });

      if (!userDept) {
        return buildResponse(res, 400, "Department not found for this user", null, true);
      }

      departmentFilter.department = userDept._id;
    }

    // Admin
    if (req.user.role === "admin") {
      if (!req.body.departmentId) {
        return buildResponse(res, 400, "departmentId is required", null, true);
      }

      departmentFilter.department = req.body.departmentId;
    }

    // Student
    if (req.user.role === "student") {
      const student = await studentModel.findById(req.user._id).populate('departmentId');

      if (!student || !student.departmentId) {
        return buildResponse(res, 400, "Department not found for this student", null, true);
      }

      departmentFilter.department = student.departmentId._id;
    }

    // For admin, they can specify department in query, otherwise get all active semesters
    if (req.user.role === 'admin' && req.query.departmentId) {
      departmentFilter.department = req.query.departmentId;
    }

    const semester = await Semester.findOne({
      isActive: true,
      ...departmentFilter
    }).populate('department', 'name code');

    if (!semester) {
      return buildResponse(res, 404, "No active semester found", null, true);
    }

    return buildResponse(res, 200, "Active semester fetched successfully", semester);
  } catch (error) {
    console.error("Error fetching semester:", error);
    return buildResponse(res, 500, "Error fetching semester", null, true, error);
  }
};

// 🔹 Deactivate semester (admin only)
export const deactivateSemester = async (req, res) => {
  try {
    // Only admin can deactivate semesters
    if (req.user.role !== 'admin') {
      return buildResponse(res, 403, "Only admin can deactivate semesters", null, true);
    }

    const { semesterId } = req.params;

    if (!semesterId || !mongoose.Types.ObjectId.isValid(semesterId)) {
      return buildResponse(res, 400, "Valid semester ID is required", null, true);
    }

    const activeSemester = await Semester.findOneAndUpdate(
      { _id: semesterId, isActive: true },
      {
        isActive: false,
        endDate: new Date(),
        isRegistrationOpen: false,
        isResultsPublished: false
      },
      { new: true }
    );

    if (!activeSemester) {
      return buildResponse(res, 404, "No active semester found with this ID", null, true);
    }

    // Update global settings if this was the semester referenced there
    await Settings.findOneAndUpdate(
      { activeSemesterId: semesterId },
      {
        activeSemesterId: null,
        registrationOpen: false,
        resultPublicationOpen: false,
        updatedBy: req.user._id,
      }
    );

    return buildResponse(res, 200, "Semester deactivated successfully", activeSemester);
  } catch (error) {
    console.error("Error deactivating semester:", error);
    return buildResponse(res, 500, "Error deactivating semester", null, true, error);
  }
};

export const updateLevelSettings = async (req, res) => {
  try {
    const { levelSettings, registrationDeadline, lateRegistrationDate } = req.body;
    const { departmentId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Validate level settings
    if (!levelSettings || !Array.isArray(levelSettings)) {
      return buildResponse(res, 400, "Level settings array is required", null, true);
    }

    let targetDepartmentId = departmentId;

    // 🔹 HOD/Dean — auto detect their department by searching for it
    if (userRole === "hod" || userRole === "dean") {
      const userDept = await departmentModel.findOne({ hod: req.user._id });

      if (!userDept) {
        return buildResponse(res, 403, "No department assigned to this HOD/Dean", null, true);
      }

      // Force departmentId to HOD's own department
      targetDepartmentId = userDept._id.toString();
    }

    // 🔹 Admin — must provide departmentId in params
    else if (userRole === "admin") {
      if (!mongoose.Types.ObjectId.isValid(targetDepartmentId)) {
        return buildResponse(res, 400, "Invalid department ID", null, true);
      }
    }

    // 🔹 Others not allowed
    else {
      return buildResponse(res, 403, "Insufficient permissions", null, true);
    }

    // Find active semester for department
    const semester = await Semester.findOne({
      department: targetDepartmentId,
      isActive: true,
    });

    if (!semester) {
      return buildResponse(res, 404, "Active semester not found for this department", null, true);
    }

    // 🔹 Update fields
    semester.levelSettings = levelSettings;

    if (registrationDeadline) {
      semester.registrationDeadline = new Date(registrationDeadline);
    }

    if (lateRegistrationDate) {
      semester.lateRegistrationDate = new Date(lateRegistrationDate);
    }

    semester.updatedBy = userId;

    await semester.save();

    return buildResponse(res, 200, "Semester settings updated successfully", semester);

  } catch (error) {
    console.error("Error updating level settings:", error);
    return buildResponse(res, 500, "Error updating level settings", null, true, error);
  }
};

// 🔹 Get semesters by department (any authenticated user)
export const getSemestersByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      console.log("Invalid Id", departmentId)
      return buildResponse(res, 400, "Invalid department ID", null, true);
    }

    // Authorization: HOD/Dean can only access their own department
    if (req.user.role === 'hod' || req.user.role === 'dean') {
      if (req.user.department.toString() !== departmentId) {
        return buildResponse(res, 403, "Not authorized to access this department", null, true);
      }
    }

    const semesters = await Semester.find({ department: departmentId })
      .sort({ createdAt: -1 })
      .populate('department', 'name code')
      .populate('createdBy', 'firstName lastName');

    return buildResponse(res, 200, "Semesters fetched successfully", semesters);
  } catch (error) {
    console.error("Error fetching semesters:", error);
    return buildResponse(res, 500, "Error fetching semesters", null, true, error);
  }
};

export const getStudentSemesterSettings = async (req, res) => {
  try {
    const studentId = req.user._id;

    // 1. Get student information
    const student = await studentModel.findById(studentId)
      .populate('departmentId')
      .select('level department');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    if (!student.departmentId) {
      return res.status(400).json({
        success: false,
        message: "Student does not have a department assigned"
      });
    }

    // 2. Find active semester for the student's department
    const activeSemester = await Semester.findOne({
      department: student.departmentId._id,
      isActive: true
    });

    if (!activeSemester) {
      return res.status(404).json({
        success: false,
        message: "No active semester found for this department"
      });
    }

    // 3. Find level settings for the student's level
    const levelSetting = activeSemester.levelSettings.find(
      setting => String(setting.level) === String(student.level)
    );

    if (!levelSetting) {
      console.log(activeSemester)
      return res.status(404).json({
        success: false,
        message: `No level settings found for level ${student.level}`
      });
    }

    // 4. Return the level settings
    return res.status(200).json({
      success: true,
      data: {
        level: levelSetting.level,
        minUnits: levelSetting.minUnits,
        maxUnits: levelSetting.maxUnits,
        minCourses: levelSetting.minCourses,
        maxCourses: levelSetting.maxCourses,
        semester: {
          name: activeSemester.name,
          session: activeSemester.session,
        },
        isRegistrationOpen: activeSemester.isRegistrationOpen,
        registratioinDeadline: activeSemester.registrationDeadline,
        lateRegistrationDate: activeSemester.lateRegistrationDate,
        registrationDeadline: activeSemester.registrationDeadline,
        lateRegistrationDate: activeSemester.lateRegistrationDate
        // department: student.departmentId.name // if populated
      }
    });

  } catch (error) {
    console.error("Error getting student semester settings:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};