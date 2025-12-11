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
    const userId = req.user._id;

    // Admin only
    if (req.user.role !== "admin") {
      await session.abortTransaction();
      return buildResponse(res, 403, "Only admin can start new semester", null, true);
    }

    // ------------------ FETCH ACTIVE SEMESTER ------------------
    const currentAcademic = await AcademicSemester.findOne(
      { isActive: true },
      null,
      { session }
    );

    let nextSemesterName;
    let nextSessionYear;

    const yearNow = new Date().getFullYear();

    if (!currentAcademic) {
      // No history; system is fresh
      nextSemesterName = "first";
      nextSessionYear = `${yearNow}/${yearNow + 1}`;
    } else {
      const currentName = currentAcademic.name;
      const [startY, endY] = currentAcademic.session.split("/").map(Number);

      if (currentName === "first") {
        nextSemesterName = "second";
        nextSessionYear = currentAcademic.session;
      } else {
        nextSemesterName = "first";
        nextSessionYear = `${endY}/${endY + 1}`;
      }
    }

    // Default level settings
    const defaultLevelSettings = [
      { level: 100, minUnits: 12, maxUnits: 24 },
      { level: 200, minUnits: 12, maxUnits: 24 },
      { level: 300, minUnits: 12, maxUnits: 24 },
      { level: 400, minUnits: 12, maxUnits: 24 }
    ];

    // ---------------- END OLD ACADEMIC SEMESTERS ----------------
    await AcademicSemester.updateMany(
      { isActive: true },
      { isActive: false, endDate: new Date() },
      { session }
    );

    // ---------------- CREATE NEW ACADEMIC SEMESTER ----------------
    const academicSemester = await AcademicSemester.create(
      [{
        name: nextSemesterName,
        session: nextSessionYear,
        startDate: new Date(),
        isActive: true
      }],
      { session }
    );

    const academicSemesterDoc = academicSemester[0];

    // ---------------- FETCH ALL DEPARTMENTS ----------------
    const departments = await departmentModel.find({}, null, { session });
    if (departments.length === 0) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No departments found", null, true);
    }

    // ---------------- END OLD DEPT SEMESTERS ----------------
    await Semester.updateMany(
      { isActive: true },
      { isActive: false, endDate: new Date() },
      { session }
    );

    // ---------------- CREATE NEW DEPT SEMESTERS ----------------
    const departmentSemesters = await Promise.all(
      departments.map((dept) =>
        Semester.create(
          [{
            academicSemester: academicSemesterDoc._id,
            name: nextSemesterName,
            session: nextSessionYear,
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

    const departmentSemesterDocs = departmentSemesters.map(s => s[0]);

    // ---------------- UPDATE SETTINGS ----------------
    const settings = await Settings.findOneAndUpdate(
      {},
      {
        currentSession: nextSessionYear,
        currentSemester: nextSemesterName,
        activeAcademicSemesterId: academicSemesterDoc._id,
        registrationOpen: false,
        resultPublicationOpen: false,
        updatedBy: userId
      },
      { new: true, upsert: true, session }
    );

    // Commit all operations
    await session.commitTransaction();
    session.endSession();

    return buildResponse(res, 200, "New semester started successfully", {
      nextSemester: nextSemesterName,
      nextSession: nextSessionYear,
      academicSemester: academicSemesterDoc,
      departmentSemesters: departmentSemesterDocs,
      settings
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

    let targetDepartments = [];
    let departmentId = req.body?.departmentId || null;

    // ---------------- ADMIN LOGIC ----------------
    if (userRole === "admin") {
      if (departmentId) {
        // Admin specified a department
        targetDepartments = [departmentId];
      } else {
        // Admin toggles ALL departments
        const allDepts = await departmentModel.find({}, "_id");
        targetDepartments = allDepts.map(d => d._id);
      }
    }

    // ---------------- HOD / DEAN LOGIC ----------------
    if (userRole === "hod" || userRole === "dean") {
      const dept = await departmentModel.findOne({ hod: req.user._id });

      if (!dept) {
        return buildResponse(res, 400, "No department assigned to user", null, true);
      }

      targetDepartments = [dept._id];
    }

    // ---------------- ONLY ALLOWED ROLES ----------------
    if (targetDepartments.length === 0) {
      return buildResponse(res, 403, "Insufficient permissions", null, true);
    }

    // ---------------- FETCH SEMESTERS ----------------
    const semesters = await Semester.find({
      department: { $in: targetDepartments },
      isActive: true
    });

    if (semesters.length === 0) {
      return buildResponse(res, 404, "No active semester found", null, true);
    }

    // Determine uniform toggle state
    const newStatus = !semesters[0].isRegistrationOpen;

    // ---------------- PERFORM UPDATE ----------------
    await Semester.updateMany(
      { department: { $in: targetDepartments }, isActive: true },
      { isRegistrationOpen: newStatus, updatedBy: userId }
    );

    return buildResponse(
      res,
      200,
      `Registration ${newStatus ? "opened" : "closed"} successfully`,
      { affectedDepartments: targetDepartments }
    );

  } catch (error) {
    console.error("Error updating registration:", error);
    return buildResponse(res, 500, "Error updating registration", null, true, error);
  }
};


// 🔹 Toggle results publication (HOD/Admin/Dean)
export const toggleResultPublication = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const { status } = req.body;

    if (typeof status !== "boolean") {
      return buildResponse(res, 400, "Status must be a boolean", null, true);
    }

    let targetDepartments = [];
    let departmentId = req.body?.departmentId || null;

    // ---------------- ADMIN LOGIC ----------------
    if (userRole === "admin") {
      if (departmentId) {
        // Admin named a department
        targetDepartments = [departmentId];
      } else {
        // Admin toggles ALL departments
        const allDepts = await departmentModel.find({}, "_id");
        targetDepartments = allDepts.map(d => d._id);
      }
    }

    // ---------------- HOD / DEAN LOGIC ----------------
    if (userRole === "hod" || userRole === "dean") {
      const dept = await departmentModel.findOne({ hod: req.user._id });

      if (!dept) {
        return buildResponse(res, 400, "No department assigned to this user", null, true);
      }

      targetDepartments = [dept._id];
    }

    // ---------------- ONLY ALLOWED ROLES ----------------
    if (targetDepartments.length === 0) {
      return buildResponse(res, 403, "Insufficient permissions", null, true);
    }

    // ---------------- FETCH ACTIVE SEMESTERS ----------------
    const semesters = await Semester.find({
      department: { $in: targetDepartments },
      isActive: true
    });

    if (semesters.length === 0) {
      return buildResponse(res, 404, "No active semester(s) found", null, true);
    }

    // ---------------- UPDATE SEMESTERS ----------------
    await Semester.updateMany(
      { department: { $in: targetDepartments }, isActive: true },
      { isResultsPublished: status, updatedBy: userId }
    );

    return buildResponse(
      res,
      200,
      `Result publication ${status ? "opened" : "closed"} successfully`,
      { affectedDepartments: targetDepartments }
    );

  } catch (error) {
    console.error("Error updating result publication:", error);
    return buildResponse(
      res,
      500,
      "Error updating result publication",
      null,
      true,
      error
    );
  }
};


// 🔹 Get active semester (anyone)
export const getActiveSemester = async (req, res) => {
  try {
    // const {deoartment}
    let departmentId = null;

    // ------------------- STUDENT -------------------
    if (req.user.role === "student") {
      const student = await studentModel
        .findById(req.user._id)
        .populate("departmentId");

      if (!student || !student.departmentId) {
        return buildResponse(res, 400, "Department not found for this student", null, true);
      }

      departmentId = student.departmentId._id;
    }

    // ------------------- HOD/DEAN -------------------
    if (req.user.role === "hod" || req.user.role === "dean") {
      const userDept = await departmentModel.findOne({ hod: req.user._id });

      if (!userDept) {
        return buildResponse(res, 400, "Department not found for this user", null, true);
      }

      departmentId = userDept._id;
    }

    // ------------------- ADMIN -------------------
    if (req.user.role === "admin") {
      // If admin directly specifies department, use it
      const body = req.body || {};
      const query = req.query || {};
      if (body.departmentId) {
        departmentId = req.body.departmentId;
      }

      // Also allow query param
      if (query.departmentId) {
        departmentId = req.query.departmentId;
      }

      // If no department is provided, return the academic semester (global)
      if (!departmentId) {
        const academic = await AcademicSemester.findOne({ isActive: true });

        if (!academic) {
          return buildResponse(res, 404, "No active academic semester found", null, true);
        }

        return buildResponse(res, 200, "Active academic semester fetched", academic);
      }
    }

    // ------------------- FETCH DEPARTMENT SEMESTER -------------------
    const semester = await Semester.findOne({
      isActive: true,
      department: departmentId
    }).populate("department", "name code");

    if (!semester) {
      return buildResponse(res, 404, "No active semester found for this department", null, true);
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

    // 🔹 Update deadlines with validation
    if (registrationDeadline) {
      const deadline = new Date(registrationDeadline);

      if (lateRegistrationDate) {
        const lateDate = new Date(lateRegistrationDate);

        if (lateDate <= deadline) {
          return buildResponse(
            res,
            400,
            "Late registration date must be *after* the registration deadline",
            null,
            true
          );
        }
      }

      semester.registrationDeadline = deadline;
    }

    if (lateRegistrationDate) {
      const lateDate = new Date(lateRegistrationDate);

      if (registrationDeadline) {
        const deadline = new Date(registrationDeadline);

        if (lateDate <= deadline) {
          return buildResponse(
            res,
            400,
            "Late registration date must be *after* the registration deadline",
            null,
            true
          );
        }
      }

      // If deadline already exists in DB, validate against it too
      if (semester.registrationDeadline && lateDate <= semester.registrationDeadline) {
        return buildResponse(
          res,
          400,
          "Late registration date must be *after* the registration deadline",
          null,
          true
        );
      }

      semester.lateRegistrationDate = lateDate;
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