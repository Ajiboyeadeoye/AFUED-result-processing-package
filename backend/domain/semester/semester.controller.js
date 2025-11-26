import Semester from "./semester.model.js";
import Settings from "../settings/settings.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import mongoose from "mongoose";

/**
 * Type-safe
 */
const VALID_SEMESTERS = ["First Semester", "Second Semester", "Summer Semester"];
const sessionRegex = /^\d{4}\/\d{4}$/;
const nameRegex = /^(First|Second|Summer)\sSemester$/;

// 🔹 Start new semester (admin only)
export const startNewSemester = async (req, res) => {
  try {
    const { name, session, departmentId, levelSettings } = req.body;
    const userId = req.user._id;

    // Only admin can start new semester
    if (req.user.role !== 'admin') {
      return buildResponse(res, 403, "Only admin can start new semester", null, true);
    }

    if (!name || !session || !departmentId) {
      return buildResponse(res, 400, "Name, session and department ID are required", null, true);
    }

    if (!nameRegex.test(name) || !VALID_SEMESTERS.includes(name)) {
      return buildResponse(res, 400, "Invalid semester name", null, true);
    }

    if (!sessionRegex.test(session)) {
      return buildResponse(res, 400, "Invalid session format. Use YYYY/YYYY", null, true);
    }

    // Validate department ID
    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return buildResponse(res, 400, "Invalid department ID", null, true);
    }

    // Deactivate any active semester in the department
    await Semester.updateMany(
      { department: departmentId, isActive: true }, 
      { isActive: false, endDate: new Date() }
    );

    // Create semester
    const newSemester = await Semester.create({
      name,
      session,
      department: departmentId,
      levelSettings: levelSettings || [
        { level: 100, minUnits: 12, maxUnits: 24 },
        { level: 200, minUnits: 12, maxUnits: 24 },
        { level: 300, minUnits: 12, maxUnits: 24 },
        { level: 400, minUnits: 12, maxUnits: 24 }
      ],
      isActive: true,
      isRegistrationOpen: false,
      isResultsPublished: false,
      createdBy: userId,
    });

    // Update global settings
    const settings = await Settings.findOneAndUpdate({}, {
      currentSession: session,
      currentSemester: name,
      activeSemesterId: newSemester._id,
      registrationOpen: false,
      resultPublicationOpen: false,
      updatedBy: userId,
    }, { new: true, upsert: true });

    return buildResponse(res, 200, "Semester started successfully", {
      semester: newSemester,
      settings
    });
  } catch (error) {
    console.error("Error starting semester:", error);
    return buildResponse(res, 500, "Error starting semester", null, true, error);
  }
};

// 🔹 Toggle registration (HOD/Admin/Dean)
export const toggleRegistration = async (req, res) => {
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

      // Update semester for specific department
      const semester = await Semester.findOneAndUpdate(
        { department: departmentId, isActive: true },
        { isRegistrationOpen: status, updatedBy: userId },
        { new: true }
      );

      if (!semester) {
        return buildResponse(res, 404, "No active semester found for this department", null, true);
      }

      return buildResponse(res, 200, `Course registration ${status ? "opened" : "closed"} for department`, semester);

    } else if (userRole === 'hod' || userRole === 'dean') {
      // For HOD/Dean, use their assigned department
      const userDepartment = req.user.department;
      
      if (!userDepartment) {
        return buildResponse(res, 400, "No department assigned to user", null, true);
      }

      const semester = await Semester.findOneAndUpdate(
        { department: userDepartment, isActive: true },
        { isRegistrationOpen: status, updatedBy: userId },
        { new: true }
      );

      if (!semester) {
        return buildResponse(res, 404, "No active semester found for your department", null, true);
      }

      return buildResponse(res, 200, `Course registration ${status ? "opened" : "closed"} for your department`, semester);

    } else {
      return buildResponse(res, 403, "Insufficient permissions", null, true);
    }
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
    
    // For HOD/Dean, only show active semester for their department
    if (req.user.role === 'hod' || req.user.role === 'dean') {
      if (!req.user.department) {
        return buildResponse(res, 400, "No department assigned to user", null, true);
      }
      departmentFilter.department = req.user.department;
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

// 🔹 HOD/Dean updates level settings (per department)
export const updateLevelSettings = async (req, res) => {
  try {
    const { levelSettings } = req.body; // [{level:100, minUnits:12, maxUnits:24}, ...]
    const { departmentId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!levelSettings || !Array.isArray(levelSettings)) {
      return buildResponse(res, 400, "Level settings array is required", null, true);
    }

    // Authorization check
    if (userRole === 'hod' || userRole === 'dean') {
      // HOD/Dean can only update their own department
      if (req.user.department.toString() !== departmentId) {
        return buildResponse(res, 403, "Not authorized to update this department", null, true);
      }
    } else if (userRole !== 'admin') {
      return buildResponse(res, 403, "Insufficient permissions", null, true);
    }

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return buildResponse(res, 400, "Invalid department ID", null, true);
    }

    const semester = await Semester.findOne({ department: departmentId, isActive: true });
    if (!semester) {
      return buildResponse(res, 404, "Active semester not found for this department", null, true);
    }

    semester.levelSettings = levelSettings;
    semester.updatedBy = userId;
    await semester.save();

    return buildResponse(res, 200, "Level settings updated successfully", semester);
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