import mongoose from "mongoose";
import Lecturer from "./lecturer.model.js";
import Department from "../department/department.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";
import User from "../user/user.model.js";
import { dataMaps } from "../../config/dataMap.js";
import departmentModel from "../department/department.model.js";

/**
 * 🧑‍🏫 Create Lecturer (Admin only)
 */
export const createLecturer = async (req, res) => {
  try {
    const {
      name,
      email,
      staff_id: staffId,
      department_id: departmentId,
      rank,
      fields,
      search_term,
      filters,
      page
    } = req.body;

    // 🧮 If it's a filter/search request
    if (fields || search_term || filters || page) {
      const result = await fetchDataHelper(req, res, Lecturer, {
        configMap: dataMaps.Lecturer,
        autoPopulate: true,
        models: { departmentModel, User },
        populate: ["departmentId", "_id"],
        custom_fields: { name: "_id", email: "_id" },
      });
      return result;
    }

    // ✅ 1. Check for duplicate staff ID
    const existingLecturer = await Lecturer.findOne({ staffId });
    if (existingLecturer) {
      return buildResponse(res, 400, "Lecturer with this staff ID already exists");
    }

    // ✅ 2. Check for duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return buildResponse(res, 400, "User with this email already exists");
    }

    // ✅ 3. Create User
    const user = await User.create({
      name,
      email,
      password: staffId, // Default password same as staff ID
      role: "lecturer",
    });

    try {
      // ✅ 4. Create Lecturer with same _id
      const lecturer = await Lecturer.create({
        _id: user._id,
        staffId,
        departmentId,
        rank,
      });

      return buildResponse(res, 201, "Lecturer created successfully", lecturer);

    } catch (lecturerError) {
      // 🧹 Rollback user creation if lecturer fails
      await User.findByIdAndDelete(user._id);
      console.error("⚠️ Lecturer creation failed, rolled back user:", lecturerError);

      return buildResponse(
        res,
        500,
        "Lecturer creation failed — user has been removed",
        null,
        true,
        lecturerError
      );
    }
  } catch (error) {
    console.error("❌ createLecturer Error:", error);
    return buildResponse(res, 500, "Failed to create lecturer", null, true, error);
  }
};



/**
 * 📋 Get All Lecturers (Admin / HOD)
 */
export const getAllLecturers = async (req, res) => {
  return fetchDataHelper(req, res, Lecturer, {
    configMap: dataMaps.Lecturer,
    autoPopulate: true,
    models: { departmentModel, User },
    populate: ["departmentId", "_id"],
  });
};


/**
 * 🔍 Get Lecturer By ID
 */
export const getLecturerById = async (req, res) => {
  try {
    const lecturer = await Lecturer.findById(req.params.id)
      .populate("_id", "name email role")
      .populate("departmentId", "name code");

    if (!lecturer) return buildResponse(res, 404, "Lecturer not found");

    return buildResponse(res, 200, "Lecturer fetched successfully", lecturer);
  } catch (error) {
    return buildResponse(res, 500, "Failed to fetch lecturer", null, true, error);
  }
};


/**
 * ✏️ Update Lecturer
 */
export const updateLecturer = async (req, res) => {
  try {
    const { id } = req.params;
    const lecturer = await Lecturer.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!lecturer) return buildResponse(res, 404, "Lecturer not found");

    return buildResponse(res, 200, "Lecturer updated successfully", lecturer);
  } catch (error) {
    return buildResponse(res, 500, "Failed to update lecturer", null, true, error);
  }
};


/**
 * 🗑️ Soft Delete Lecturer
 */
export const deleteLecturer = async (req, res) => {
  try {
    const { id } = req.params;
    const lecturer = await Lecturer.findByIdAndUpdate(
      id,
      { active: false, deletedAt: new Date() },
      { new: true }
    );

    if (!lecturer) return buildResponse(res, 404, "Lecturer not found");

    // Optionally also deactivate linked user
    await User.findByIdAndUpdate(id, { active: false });

    return buildResponse(res, 200, "Lecturer deleted successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to delete lecturer", null, true, error);
  }
};


/**
 * 🧩 Assign Lecturer as HOD
 */
export const assignHOD = async (req, res) => {
  try {
    const { departmentId, lecturerId } = req.params;

    const lecturer = await Lecturer.findById(lecturerId);
    if (!lecturer) return buildResponse(res, 404, "Lecturer not found");

    // Ensure the lecturer belongs to the same department
    if (lecturer.departmentId.toString() !== departmentId) {
      return buildResponse(res, 400, "Lecturer must belong to this department before being assigned as HOD");
    }

    // Remove previous HOD if exists
    const department = await Department.findById(departmentId);
    if (department.hod && department.hod.toString() !== lecturerId) {
      const oldHOD = await Lecturer.findById(department.hod);
      if (oldHOD) {
        oldHOD.isHOD = false;
        await oldHOD.save();
      }
    }

    // Assign new HOD
    department.hod = lecturer._id;
    lecturer.isHOD = true;

    await department.save();
    await lecturer.save();

    return buildResponse(res, 200, "Lecturer assigned as HOD successfully", lecturer);
  } catch (error) {
    console.error("❌ assignHOD Error:", error);
    return buildResponse(res, 500, "Failed to assign HOD", null, true, error);
  }
};


/**
 * 🧩 Remove Lecturer as HOD
 */
export const removeHOD = async (req, res) => {
  try {
    const { departmentId, lecturerId } = req.params;

    const lecturer = await Lecturer.findById(lecturerId);
    if (!lecturer) return buildResponse(res, 404, "Lecturer not found");

    const department = await Department.findById(departmentId);
    if (!department) return buildResponse(res, 404, "Department not found");

    // Check if the lecturer is currently the HOD
    if (department.hod?.toString() !== lecturerId) {
      return buildResponse(res, 400, "This lecturer is not the HOD of this department");
    }

    department.hod = null;
    lecturer.isHOD = false;

    await department.save();
    await lecturer.save();

    return buildResponse(res, 200, "Lecturer removed from HOD role successfully", lecturer);
  } catch (error) {
    console.error("❌ removeHOD Error:", error);
    return buildResponse(res, 500, "Failed to remove HOD", null, true, error);
  }
};
