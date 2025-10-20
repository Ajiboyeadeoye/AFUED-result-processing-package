import Result from "./result.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";

/**
 * 🧾 Create or Upload Student Result (Lecturer)
 */
export const uploadResult = async (req, res) => {
  try {
    const { studentId, courseId, score, session, semester } = req.body;

    const existing = await Result.findOne({ studentId, courseId, session, semester });
    if (existing)
      return buildResponse(res, 400, "Result for this course and session already exists");

    const result = await Result.create({
      studentId,
      courseId,
      score,
      session,
      semester,
      lecturerId: req.user._id,
    });

    return buildResponse(res, 201, "Result uploaded successfully", result);
  } catch (error) {
    console.error("❌ uploadResult Error:", error);
    return buildResponse(res, 500, "Failed to upload result", null, true, error);
  }
};

/**
 * 📋 Get All Results (Admin or HOD)
 */
export const getAllResults = async (req, res) => {
  return fetchDataHelper(req, res, Result, {
    enablePagination: true,
    sort: { createdAt: -1 },
  });
};

/**
 * 🔍 Get Single Result
 */
export const getResultById = async (req, res) => {
  try {
    const result = await Result.findById(req.params.id)
      .populate("studentId", "matricNumber")
      .populate("courseId", "title code unit")
      .populate("lecturerId", "name email");

    if (!result) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result fetched successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to fetch result", null, true, error);
  }
};

/**
 * ✏️ Update Student Result (Lecturer or HOD)
 */
export const updateResult = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Result.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result updated successfully", updated);
  } catch (error) {
    return buildResponse(res, 500, "Failed to update result", null, true, error);
  }
};

/**
 * ✅ Approve Result (HOD)
 */
export const approveResult = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findByIdAndUpdate(
      id,
      { approved: true, approvedBy: req.user._id },
      { new: true }
    );

    if (!result) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result approved successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to approve result", null, true, error);
  }
};

/**
 * 🔒 Lock Result (HOD/Admin)
 */
export const lockResult = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findByIdAndUpdate(id, { locked: true }, { new: true });

    if (!result) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result locked successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to lock result", null, true, error);
  }
};

/**
 * 🗑️ Delete Result (Admin only)
 */
export const deleteResult = async (req, res) => {
  try {
    const deleted = await Result.findByIdAndDelete(req.params.id);
    if (!deleted) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result deleted successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to delete result", null, true, error);
  }
};
