import User from "../../domain/user/user.model.js";
import Department from "../../domain/department/department.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import departmentModel from "../../domain/department/department.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import fetchDataHelper from "../../utils/fetchDataHelper.js";
import { dataMaps } from "../../config/dataMap.js";

// Assign HOD
export const assignHOD = async (req, res) => {
  try {
    const { userId, departmentId } = req.body;

    if (!userId || !departmentId) {
      return res
        .status(400)
        .json(buildResponse.error("userId and departmentId are required"));
    }

    // Validate department
    const department = await Department.findById(departmentId);
    if (!department)
      return res
        .status(404)
        .json(buildResponse.error("Department not found", 404));

    // Check if department already has HOD
    if (department.hod) {
      return res
        .status(400)
        .json(buildResponse.error("This department already has a HOD"));
    }

    // Validate user
    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json(buildResponse.error("User not found", 404));

    // Update user role & department
    user.role = "HOD";
    user.department = departmentId;
    await user.save();

    // Assign HOD to department
    department.hod = userId;
    await department.save();

    return res
      .status(200)
      .json(buildResponse.success("HOD assigned successfully", { user, department }));
  } catch (error) {
    return res
      .status(500)
      .json(buildResponse.error(`Server error: ${error.message}`, 500));
  }
};

// Remove HOD
export const removeHOD = async (req, res) => {
  try {
    const { departmentId } = req.body;

    if (!departmentId) {
      return res
        .status(400)
        .json(buildResponse.error("departmentId is required"));
    }

    const department = await Department.findById(departmentId);
    if (!department || !department.hod) {
      return res
        .status(404)
        .json(buildResponse.error("No HOD assigned to this department", 404));
    }

    // Remove HOD from user
    const user = await User.findById(department.hod);
    user.role = "Lecturer"; // revert role
    user.department = null;
    await user.save();

    // Remove HOD from department
    department.hod = null;
    await department.save();

    return res
      .status(200)
      .json(buildResponse.success("HOD removed successfully"));
  } catch (error) {
    return res
      .status(500)
      .json(buildResponse.error(`Server error: ${error.message}`, 500));
  }
};

// Get all HODs
export const getAllHODs = async (req, res) => {
  return fetchDataHelper(req, res, lecturerModel, {
    configMap: dataMaps.Lecturer,
    autoPopulate: true,
    // models: { departmentModel, User },
    // populate: ["departmentId"],
    custom_fields: { role: "_id", email: '_id', department: "departmentId"},
  additionalFilters: {
    "role": "hod"
  }
  });
};