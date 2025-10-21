import Lecturer from "./lecturer.model.js";
import Department from "../department/department.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";
import User from "../user/user.model.js";

/**
 * 🧑‍🏫 Create Lecturer (Admin only)
 */
export const createLecturer = async (req, res) => {
  try {
    const { name, email, password, staffId, departmentId, facultyId, specialization, rank } = req.body;

    // Step 1: Check if user already exists
    const existingUser = await Lecturer.findOne({ staffId });
    if (existingUser) return buildResponse(res, 400, "User with this staffid already exists");

    // Step 2: Create new User first
    const user = await User.create({ name, email, password, role: "lecturer" });

    // Step 3: Create the Lecturer using the new user's _id
    const lecturer = await Lecturer.create({
      userId: user._id,
      staffId,
      departmentId,
      facultyId,
      specialization,
      rank,
    });

    return buildResponse(res, 201, "Lecturer created successfully", lecturer);
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
    enablePagination: true,
    sort: { createdAt: -1 },
    populate: [
      { path: "userId", select: "name email role" },
      { path: "departmentId", select: "name code" },
      { path: "facultyId", select: "name code" },
    ],
  });
};

/**
 * 🔍 Get Lecturer By ID
 */
export const getLecturerById = async (req, res) => {
  try {
    const lecturer = await Lecturer.findById(req.params.id)
      .populate("userId", "name email role")
      .populate("departmentId", "name code")
      .populate("facultyId", "name code");

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
    const updated = await Lecturer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) return buildResponse(res, 404, "Lecturer not found");

    return buildResponse(res, 200, "Lecturer updated successfully", updated);
  } catch (error) {
    return buildResponse(res, 500, "Failed to update lecturer", null, true, error);
  }
};

/**
 * 🗑️ Soft Delete Lecturer
 */
export const deleteLecturer = async (req, res) => {
  try {
    const deleted = await Lecturer.findByIdAndUpdate(
      req.params.id,
      { active: false, deletedAt: new Date() },
      { new: true }
    );

    if (!deleted) return buildResponse(res, 404, "Lecturer not found");

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

    await Department.findByIdAndUpdate(departmentId, { hod: lecturer._id });
    lecturer.isHOD = true;
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

    await Department.findByIdAndUpdate(departmentId, { $unset: { hod: "" } });
    lecturer.isHOD = false;
    await lecturer.save();

    return buildResponse(res, 200, "Lecturer removed from HOD role successfully", lecturer);
  } catch (error) {
    console.error("❌ removeHOD Error:", error);
    return buildResponse(res, 500, "Failed to remove HOD", null, true, error);
  }
};
