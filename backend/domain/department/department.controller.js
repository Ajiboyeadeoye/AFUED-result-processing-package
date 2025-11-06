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
 * NOTE:
 * - department.hod stores a Lecturer._id
 * - lecturerModel documents link to User via lecturer.userId
 * - Role strings used here: "lecturer" and "hod" (lowercase). Change if your system uses different casing.
 */

/* ===== Get All Departments (with fetch helper) ===== */
export const getAllDepartment = async (req, res) => {
  try {
    const result = await fetchDataHelper(req, res, Department, {
      configMap: dataMaps.Department,
      autoPopulate: true,
      models: { facultyModel,  },
      populate: ["faculty", "hod"],
    });
    return buildResponse(res, 200, "Filtered departments fetched", result);
  } catch (error) {
    console.error(error);
    return buildResponse(res, 500, "Failed to fetch departments", null, true, error);
  }
};

/* ===== Assign HOD to Department ===== */
export const assignHOD = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { lecturerId } = req.body; // _id of Lecturer doc
    const { departmentId } = req.params;

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

    // If department already has an HOD and it's different, unassign old HOD
    if (department.hod && department.hod.toString() !== lecturerId) {
      const oldHOD = await lecturerModel.findById(department.hod).session(session);
      if (oldHOD) {
        oldHOD.isHOD = false;
        await oldHOD.save({ session });

        // update the linked user role if exists
        if (oldHOD.userId) {
          const oldUser = await User.findById(oldHOD.userId).session(session);
          if (oldUser) {
            oldUser.role = "lecturer";
            await oldUser.save({ session });
          }
        }
      }
    }

    // Assign the new HOD
    department.hod = lecturer._id;
    lecturer.isHOD = true;

    // Update linked user role to hod-
    if (lecturer.userId) {
      const linkedUser = await User.findById(lecturer.userId).session(session);
      if (linkedUser) {
        linkedUser.role = "hod";
        linkedUser.department = departmentId; // ensure user.department is consistent
        await linkedUser.save({ session });
      }
    }

    await department.save({ session });
    await lecturer.save({ session });

    await session.commitTransaction();
    session.endSession();

    // populate returned department hod for response
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

    // department.hod is a Lecturer._id
    const hodLecturer = await lecturerModel.findById(department.hod).session(session);
    if (hodLecturer) {
      hodLecturer.isHOD = false;
      await hodLecturer.save({ session });

      // update linked user role if exists
      if (hodLecturer.userId) {
        const linkedUser = await User.findById(hodLecturer.userId).session(session);
        if (linkedUser) {
          linkedUser.role = "lecturer";
          await linkedUser.save({ session });
        }
      }
    } else {
      // If hod points to a user id (legacy), try to clear user role - but prefer lecturer flow
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

/* ===== Assign Lecturer to Department (User + Lecturer docs) ===== */
export const assignLecturerToDepartment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.body;
    const { departmentId } = req.params;

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

    // Only users with lecturer role can be assigned
    // if your role strings differ, adjust accordingly
    if (!["lecturer", "hod"].includes((user.role || "").toLowerCase())) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Only lecturers can be assigned to a department");
    }

    // Update User department
    user.department = departmentId;
    await user.save({ session });

    // If there is a separate Lecturer document linking to this user, update it too
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

    const role = (user.role || "").toLowerCase();
    if (!["lecturer", "hod"].includes(role)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Only lecturers or HODs belong to departments");
    }

    // Prevent removing current HOD via this endpoint
    if (role === "hod") {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Remove as HOD first before removing from department");
    }

    // Clear user department
    user.department = null;
    await user.save({ session });

    // Also clear departmentId on lecturer doc if exists
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
        models: { facultyModel,  },
        populate: ["faculty"]
      });
      return buildResponse(res, 200, "Filtered departments fetched", result);
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
    console.log("newDepartment:", newDepartment);

    return buildResponse(res, 201, "Department created successfully", newDepartment);
  } catch (error) {
    console.error("createDepartment error:", error);
    return buildResponse(res, 500, "Failed to create department", null, true, error);
  }
};

/* ===== Get Departments by Faculty (paginated) ===== */
export const getDepartmentsByFaculty = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

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

        const result = await fetchDataHelper(req, res, departmentModel, {
          configMap: dataMaps.DepartmentById,
          autoPopulate: false,
          models: {  facultyModel},
          populate: ["faculty", "hod"],
          additionalFilters: { _id: req.params.departmentId },
        });

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

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return buildResponse(res, 400, "Invalid departmentId");
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    if (name) department.name = name;
    if (code) department.code = code;
    if (faculty) department.faculty = faculty;

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

    // Check assigned lecturers (User docs referencing this department)
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
