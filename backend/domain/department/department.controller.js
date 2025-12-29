import mongoose from "mongoose";
import Department from "./department.model.js";
import User from "../user/user.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";
import { dataMaps } from "../../config/dataMap.js";
import facultyModel from "../faculty/faculty.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import departmentModel from "./department.model.js";

/**
 * Helper function to check if dean has access to department
 */
const checkDeanDepartmentAccess = async (deanUserId, departmentId) => {
  try {
    // Find the faculty where this user is dean
    const faculty = await facultyModel.findOne({ dean: deanUserId });
    if (!faculty) return false;

    // Check if department belongs to this faculty
    const department = await Department.findOne({ 
      _id: departmentId, 
      faculty: faculty._id 
    });
    
    return !!department;
  } catch (error) {
    console.error("Error checking dean department access:", error);
    return false;
  }
};

/**
 * Helper function to check if dean has access to faculty
 */
const checkDeanFacultyAccess = async (deanUserId, facultyId) => {
  try {
    const faculty = await facultyModel.findOne({ 
      _id: facultyId, 
      dean: deanUserId 
    });
    return !!faculty;
  } catch (error) {
    console.error("Error checking dean faculty access:", error);
    return false;
  }
};

/* ===== Get All Departments (with fetch helper) ===== */
export const getAllDepartment = async (req, res) => {
  try {
    // For deans: only show departments in their faculty
    let additionalFilters = {};
    if (req.user.role === 'dean') {
      const faculty = await facultyModel.findOne({ dean: req.user._id });
      if (faculty) {
        additionalFilters.faculty = faculty._id;
      } else {
        return buildResponse(res, 403, "No faculty assigned to dean");
      }
    }

    const result = await fetchDataHelper(req, res, Department, {
      configMap: dataMaps.Department,
      autoPopulate: true,
      models: { facultyModel },
      populate: ["faculty", "hod"],
      additionalFilters
    });
    // return buildResponse(res, 200, "Filtered departments fetched", result);
  } catch (error) {
    console.error(error);
    return buildResponse(res, 500, "Failed to fetch departments", null, true, error);
  }
};

/* ===== Get Department Stats (with student & lecturer counts) ===== */
export const getDepartmentStats = async (req, res) => {
  try {
    // For deans: only show departments in their faculty
    let facultyFilter = {};
    if (req.user.role === 'dean') {
      const faculty = await facultyModel.findOne({ dean: req.user._id });
      if (!faculty) {
        return buildResponse(res, 403, "No faculty assigned to dean");
      }
      facultyFilter.faculty = faculty._id;
    }

    const result = await fetchDataHelper(req, res, Department, {
      configMap: dataMaps.DepartmentStats,
      autoPopulate: true,
      models: { departmentModel, User },
      // populate: ["faculty", "hod"],
      // additionalFilters: {_id: facultyFilter.faculty || undefined }
      additionalFilters: facultyFilter
    });
    return buildResponse(res, 200, "Department stats fetched", result);
  } catch (error) {
    console.error("getDepartmentStats error:", error);
    return buildResponse(res, 500, "Failed to fetch department stats", null, true, error);
  }
};
/* ===== Assign HOD to Department ===== */
export const assignHOD = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { lecturerId } = req.body;
    const { departmentId } = req.params;

    // Dean authorization check
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanDepartmentAccess(req.user._id, departmentId);
      if (!hasAccess) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 403, "Not authorized to manage this department");
      }
    }

    if (!mongoose.Types.ObjectId.isValid(lecturerId) || !mongoose.Types.ObjectId.isValid(departmentId)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Invalid IDs provided");
    }

    const department = await Department.findById(departmentId).session(session);
    if (!department) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Department not found");
    }

    const lecturer = await lecturerModel.findById(lecturerId).session(session);
    if (!lecturer) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Lecturer not found");
    }

    // Ensure lecturer belongs to this department
    if (!lecturer.departmentId || lecturer.departmentId.toString() !== departmentId) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Lecturer must belong to this department before becoming HOD");
    }

    // If department already has an HOD, do not allow assignment unless unassigned first
    if (department.hod) {
      if (department.hod.toString() === lecturerId) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, `This lecturer is already the HOD of the department of "${department.name}"`, { departmentName: department.name });
      }
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, `Department "${department.name}" already has an HOD. Unassign the current HOD before assigning a new one`, { departmentName: department.name });
    }

    // Check if this lecturer is assigned as dean in any faculty (not just this department's faculty)
    const facultyWhereDean = await facultyModel.findOne({ dean: lecturerId }).session(session);
    if (facultyWhereDean) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(
      res,
      400,
      `Lecturer is assigned as dean of the faculty of "${facultyWhereDean.name}". Unassign as dean from that faculty before assigning as HOD.`,
      { facultyName: facultyWhereDean.name }
      );
    }

    // Prevent assigning a dean as HOD
    if (lecturer._id) {
      const user = await User.findById(lecturer._id).session(session);
      if (user && user.role === "dean") {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Cannot assign a dean as HOD");
      }
    }

    // Assign the new HOD
    department.hod = lecturer._id;
    lecturer.isHOD = true;

    if (lecturer._id) {
      const linkedUser = await User.findById(lecturer._id).session(session);
      if (linkedUser) {
        linkedUser.role = "hod";
        linkedUser.department = departmentId;
        await linkedUser.save({ session });
      }
    }

    await department.save({ session });
    await lecturer.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populatedDept = await Department.findById(departmentId)
      .populate({ path: "hod", select: "staffId userId isHOD departmentId rank" })
      .populate("faculty", "name")
      .lean();

    return buildResponse(res, 200, "HOD assigned successfully", populatedDept);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("assignHOD error:", error);
    return buildResponse(res, 500, "Failed to assign HOD", null, true, error);
  }
};

/* ===== Remove HOD ===== */
export const removeHOD = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { departmentId } = req.params;

    // Dean authorization check
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanDepartmentAccess(req.user._id, departmentId);
      if (!hasAccess) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 403, "Not authorized to manage this department");
      }
    }

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Invalid departmentId");
    }

    const department = await Department.findById(departmentId).session(session);
    if (!department) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Department not found");
    }

    if (!department.hod) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "No HOD assigned yet");
    }

    const hodLecturer = await lecturerModel.findById(department.hod).session(session);
    if (hodLecturer) {
      hodLecturer.isHOD = false;
      await hodLecturer.save({ session });

      if (hodLecturer._id) {
        const linkedUser = await User.findById(hodLecturer._id).session(session);
        if (linkedUser) {
          linkedUser.role = "lecturer";
          await linkedUser.save({ session });
        }
      }
    } else {
      const maybeUser = await User.findById(department.hod).session(session);
      if (maybeUser) {
        maybeUser.role = "lecturer";
        await maybeUser.save({ session });
      }
    }

    department.hod = null;
    await department.save({ session });

    await session.commitTransaction();
    session.endSession();

    return buildResponse(res, 200, "HOD removed successfully");
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("removeHOD error:", error);
    return buildResponse(res, 500, "Failed to remove HOD", null, true, error);
  }
};

/* ===== Assign Lecturer to Department ===== */
export const assignLecturerToDepartment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.body;
    const { departmentId } = req.params;

    // Dean authorization check
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanDepartmentAccess(req.user._id, departmentId);
      if (!hasAccess) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 403, "Not authorized to manage this department");
      }
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(departmentId)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Invalid IDs provided");
    }

    const department = await Department.findById(departmentId).session(session);
    if (!department) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Department not found");
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "User not found");
    }

    if (!["lecturer", "hod"].includes((user.role || "").toLowerCase())) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Only lecturers can be assigned to a department");
    }

    user.department = departmentId;
    await user.save({ session });

    const lecturer = await lecturerModel.findOne({ userId: user._id }).session(session);
    if (lecturer) {
      lecturer.departmentId = departmentId;
      await lecturer.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return buildResponse(res, 200, "Lecturer assigned to department successfully", { user, lecturer });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("assignLecturerToDepartment error:", error);
    return buildResponse(res, 500, "Failed to assign lecturer", null, true, error);
  }
};

/* ===== Remove Lecturer from Department ===== */
export const removeLecturerFromDepartment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Invalid userId");
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "User not found");
    }

    // For dean: check if lecturer belongs to department in their faculty
    if (req.user.role === 'dean') {
      if (!user.department) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 403, "Lecturer not in any department");
      }
      
      const hasAccess = await checkDeanDepartmentAccess(req.user._id, user.department);
      if (!hasAccess) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 403, "Not authorized to manage this lecturer");
      }
    }

    const role = (user.role || "").toLowerCase();
    if (!["lecturer", "hod"].includes(role)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Only lecturers or HODs belong to departments");
    }

    if (role === "hod") {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Remove as HOD first before removing from department");
    }

    user.department = null;
    await user.save({ session });

    const lecturer = await lecturerModel.findOne({ userId: user._id }).session(session);
    if (lecturer) {
      lecturer.departmentId = null;
      await lecturer.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return buildResponse(res, 200, "Lecturer removed from department successfully");
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("removeLecturerFromDepartment error:", error);
    return buildResponse(res, 500, "Failed to remove lecturer from department", null, true, error);
  }
};

/* ===== Create Department ===== */
export const createDepartment = async (req, res) => {
  try {
    const { name, code, faculty_id: faculty, fields, search_term, filters, page } = req.body;

    if (fields || search_term || filters || page) {
      const result = await fetchDataHelper(req, res, Department, {
        configMap: dataMaps.Department,
        autoPopulate: true,
        models: { facultyModel },
        populate: ["faculty"]
      });
      return buildResponse(res, 200, "Filtered departments fetched", result);
    }

    // Dean authorization: can only create departments in their faculty
    if (req.user.role === 'dean') {
      const deanFaculty = await facultyModel.findOne({ dean: req.user._id });
      if (!deanFaculty) {
        return buildResponse(res, 403, "No faculty assigned to dean");
      }
      
      // Override faculty_id with dean's faculty
      req.body.faculty_id = deanFaculty._id;
    }

    // Validate input
    if (!name || !code) {
      return buildResponse(res, 400, "Department name and code are required");
    }

    // Check uniqueness
    const existingDept = await Department.findOne({ name });
    if (existingDept) {
      return buildResponse(res, 400, "Department with this name already exists");
    }

    const department = await Department.create({
      name,
      code,
      faculty: faculty || null,
    });

    const newDepartment = await getDepartmentById({ params: { departmentId: department._id } }, res);
    // console.log("newDepartment:", newDepartment);

    // return buildResponse(res, 201, "Department created successfully", newDepartment);
  } catch (error) {
    console.error("createDepartment error:", error);
    return buildResponse(res, 500, "Failed to create department", null, true, error);
  }
};

/* ===== Get Departments by Faculty ===== */
export const getDepartmentsByFaculty = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Dean authorization: can only access their own faculty
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanFacultyAccess(req.user._id, facultyId);
      if (!hasAccess) {
        return buildResponse(res, 403, "Not authorized to access this faculty");
      }
    }

    const departments = await Department.find({ faculty: facultyId })
      .populate("hod", "staffId userId isHOD")
      .skip(skip)
      .limit(Number(limit));

    const totalCount = await Department.countDocuments({ faculty: facultyId });
    const totalPages = Math.ceil(totalCount / Number(limit));

    if (!departments || departments.length === 0) {
      return buildResponse(res, 404, "No departments found for this faculty");
    }

    return buildResponse(res, 200, "Departments fetched successfully", {
      pagination: {
        current_page: Number(page),
        limit: Number(limit),
        total_pages: totalPages,
        total_items: totalCount,
      },
      data: departments,
    });
  } catch (error) {
    console.error("getDepartmentsByFaculty error:", error);
    return buildResponse(res, 500, "Failed to get departments", null, true, error);
  }
};

/* ===== Get Department by ID ===== */
export const getDepartmentById = async (req, res) => {
  try {
    const { departmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return buildResponse(res, 400, "Invalid departmentId");
    }

    // For deans: only allow access to departments in their faculty
    let additionalFilters = {};
    if (req.user.role === 'dean') {
      const faculty = await facultyModel.findOne({ dean: req.user._id });
      if (faculty) {
        additionalFilters.faculty = faculty._id;
      } else {
        return buildResponse(res, 403, "No faculty assigned to dean");
      }
    }

    const result = await fetchDataHelper(req, res, departmentModel, {
      configMap: dataMaps.DepartmentById,
      autoPopulate: false,
      models: { facultyModel },
      populate: ["faculty", "hod"],
      additionalFilters: { ...additionalFilters, _id: departmentId }
    });

    if (!result || result.length === 0) {
      return buildResponse(res, 404, "Department not found or access denied");
    }

    return buildResponse(res, 200, "Department fetched successfully", result);
  } catch (error) {
    console.error("getDepartmentById error:", error);
    return buildResponse(res, 500, "Failed to get department", null, true, error);
  }
};

/* ===== Update Department ===== */
export const updateDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { name, code, faculty } = req.body;

    // Dean authorization check
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanDepartmentAccess(req.user._id, departmentId);
      if (!hasAccess) {
        return buildResponse(res, 403, "Not authorized to update this department");
      }
      
      // Deans cannot change faculty assignment
      if (faculty) {
        return buildResponse(res, 403, "Deans cannot change faculty assignment");
      }
    }

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return buildResponse(res, 400, "Invalid departmentId");
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    if (name) department.name = name;
    if (code) department.code = code;
    if (faculty && req.user.role === 'admin') department.faculty = faculty;

    await department.save();

    return buildResponse(res, 200, "Department updated successfully", department);
  } catch (error) {
    console.error("updateDepartment error:", error);
    return buildResponse(res, 500, "Failed to update department", null, true, error);
  }
};

/* ===== Delete Department ===== */
export const deleteDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;

    // Dean authorization check
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanDepartmentAccess(req.user._id, departmentId);
      if (!hasAccess) {
        return buildResponse(res, 403, "Not authorized to delete this department");
      }
    }

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return buildResponse(res, 400, "Invalid departmentId");
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    if (department.hod) {
      return buildResponse(res, 400, "Cannot delete department with an assigned HOD");
    }

    const lecturers = await User.find({ department: departmentId });
    if (lecturers.length > 0) {
      return buildResponse(res, 400, "Cannot delete department with assigned lecturers");
    }

    await Department.findByIdAndDelete(departmentId);

    return buildResponse(res, 200, "Department deleted successfully");
  } catch (error) {
    console.error("deleteDepartment error:", error);
    return buildResponse(res, 500, "Failed to delete department", null, true, error);
  }
};