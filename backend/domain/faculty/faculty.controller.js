import Faculty from "./faculty.model.js";
import User from "../user/user.model.js"; // ADD THIS
import lecturerModel from "../lecturer/lecturer.model.js"; // ADD THIS
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";
import mongoose from "mongoose";
import { dataMaps } from "../../config/dataMap.js";
import departmentModel from "../department/department.model.js";

/**
 * Helper function to check if dean has access to faculty
 */
const checkDeanFacultyAccess = async (deanUserId, facultyId) => {
  try {
    const faculty = await Faculty.findOne({ 
      _id: facultyId, 
      dean: deanUserId 
    });
    return !!faculty;
  } catch (error) {
    console.error("Error checking dean faculty access:", error);
    return false;
  }
};

export const createFaculty = async (req, res) => {
  try {
    const { name, code, fields, search_term, filters, page } = req.body;

    // 🧠 1. If request contains advanced filter data
    if (fields || search_term || filters || page) {
      const result = await fetchDataHelper(req, res, Faculty, {
        configMap: dataMaps.Faculty,
        autoPopulate: false,
        models: {},
      });
      return buildResponse(res, 200, "Faculties fetched successfully", result); // FIXED MESSAGE
    }

    // ✅ Only admin can create faculties
    if (req.user.role !== 'admin') {
      return buildResponse(res, 403, "Only admin can create faculties", null, true);
    }

    // ✅ Validate inputs
    if (!name || !code) {
      return buildResponse(res, 400, "Name and code are required", null, true); // CHANGED STATUS CODE
    }

    // ✅ Normalize code
    const formattedCode = code.trim().toUpperCase();

    // ✅ Check if code already exists
    const existingFaculty = await Faculty.findOne({ code: formattedCode });
    if (existingFaculty) {
      return buildResponse(
        res,
        409,
        `Faculty code '${formattedCode}' already exists`,
        null,
        true
      );
    }

    // ✅ Create new faculty
    const faculty = await Faculty.create({
      name: name.trim(),
      code: formattedCode,
      createdBy: req.user._id,
    });

    return buildResponse(res, 201, "Faculty created successfully", faculty);
  } catch (error) {
    // Handle duplicate key errors from MongoDB
    if (error.code === 11000 && error.keyValue?.code) {
      return buildResponse(
        res,
        409,
        `Faculty code '${error.keyValue.code}' already exists`,
        null,
        true
      );
    }

    return buildResponse(res, 500, "Error creating faculty", null, true, error);
  }
};

export const getAllFaculties = async (req, res) => {
  try {
    // For deans: only show their assigned faculty
    let additionalFilters = {};
    if (req.user.role === 'dean') {
      additionalFilters.dean = req.user._id;
    }

    const result = await fetchDataHelper(req, res, Faculty, {
      configMap: dataMaps.Faculty,
      autoPopulate: false,
      models: {lecturerModel, User},
      additionalFilters,
      populate: ['dean'],
    });

    console.log("Faculties fetched successfully ✅");
    
    // // For deans: if no faculty assigned, return empty array with message
    // if (req.user.role === 'dean' && (!result || result.length === 0)) {
    //   return buildResponse(res, 200, "No faculty assigned to you", []);
    // }

    // return buildResponse(res, 200, "Faculties fetched successfully", result); // FIXED MESSAGE
  } catch (error) {
    console.error("Error fetching faculties ❌", error);
    return buildResponse(res, 500, "Error fetching faculties", null, true, error);
  }
};

// Get dean's own faculty (dean only)
export const getMyFaculty = async (req, res) => {
  try {
    if (req.user.role !== 'dean') {
      return buildResponse(res, 403, "This endpoint is for deans only");
    }

    const faculty = await Faculty.findOne({ dean: req.user._id })

    const result = await fetchDataHelper(req, res, Faculty, {
      configMap: dataMaps.Faculty,
      autoPopulate: false,
      models: {departmentModel, User},
      additionalFilters: { _id: faculty?._id  },
    });

    if (!result || result.length === 0) {
      return buildResponse(res, 404, "Faculty not found");
    }

    return buildResponse(res, 200, "Faculty found", result);
  } catch (error) {
    console.error("Error in getMyFaculty:", error);
    return buildResponse(res, 500, "Error fetching your faculty information", null, true, error);
  }
};

// Get faculty by ID (admin or dean with access)
export const getFacultyById = async (req, res) => {
  try {
    const { facultyId } = req.params;

    // For deans: check if they have access to this faculty
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanFacultyAccess(req.user._id, facultyId);
      if (!hasAccess) {
        return buildResponse(res, 403, "Not authorized to access this faculty");
      }
    }

    const result = await fetchDataHelper(req, res, Faculty, {
      configMap: dataMaps.FacultyById,
      autoPopulate: false,
      models: {},
      additionalFilters: { _id: facultyId },
    });

    if (!result || result.length === 0) {
      return buildResponse(res, 404, "Faculty not found");
    }

    return buildResponse(res, 200, "Faculty found", ...result);
  } catch (error) {
    return buildResponse(res, 500, "Error fetching faculty", null, true, error);
  }
};

export const updateFaculty = async (req, res) => {
  try {
    const { name, code, dean } = req.body;
    const { facultyId } = req.params;

    // 🧱 Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(facultyId)) {
      return buildResponse(res, 400, "Invalid faculty ID format");
    }

    // 🔍 Check if faculty exists
    const existingFaculty = await Faculty.findById(facultyId);
    if (!existingFaculty)
      return buildResponse(res, 404, "Faculty not found");

    // Dean authorization: can only update their own faculty with restrictions
    if (req.user.role === 'dean') {
      const hasAccess = await checkDeanFacultyAccess(req.user._id, facultyId);
      if (!hasAccess) {
        return buildResponse(res, 403, "Not authorized to update this faculty");
      }

      // Deans cannot change dean assignment or faculty code
      if (dean || code) {
        return buildResponse(res, 403, "Deans cannot change dean assignment or faculty code");
      }
    }

    // 🚫 Check for duplicate name (case-insensitive) - only if name is being updated
    if (name) {
      const duplicateName = await Faculty.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
        _id: { $ne: facultyId },
      });
      if (duplicateName)
        return buildResponse(res, 409, `Faculty name '${name}' already exists`);
    }

    // 🚫 Check for duplicate code (case-insensitive) - only if code is being updated
    if (code && req.user.role === 'admin') {
      const duplicateCode = await Faculty.findOne({
        code: { $regex: new RegExp(`^${code}$`, "i") },
        _id: { $ne: facultyId },
      });
      if (duplicateCode)
        return buildResponse(res, 409, `Faculty code '${code}' already exists`);
    }

    // Prepare update data based on user role
    const updateData = { ...req.body };
    
    // Remove fields that deans cannot update
    if (req.user.role === 'dean') {
      delete updateData.code;
      delete updateData.dean;
      delete updateData.createdBy;
    }

    // ✅ Update the faculty
    const updatedFaculty = await Faculty.findByIdAndUpdate(
      facultyId,
      updateData,
      { new: true }
    );

    return buildResponse(res, 200, "Faculty updated successfully", updatedFaculty);
  } catch (error) {
    console.error("❌ Error updating faculty:", error);
    return buildResponse(
      res,
      500,
      "An error occurred while updating the faculty",
      null,
      true,
      error.message
    );
  }
};

export const deleteFaculty = async (req, res) => {
  try {
    // Only admin can delete faculties
    if (req.user.role !== 'admin') {
      return buildResponse(res, 403, "Only admin can delete faculties", null, true);
    }

    // Add 2-second delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const faculty = await Faculty.findByIdAndDelete(req.params.facultyId);
    if (!faculty) return buildResponse(res, 404, "Faculty not found");

    return buildResponse(res, 200, "Faculty deleted");
  } catch (error) {
    return buildResponse(res, 500, "Error deleting faculty", null, true, error);
  }
};

/* ===== Assign Dean to Faculty ===== */
export const assignDean = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.body; // User ID of the lecturer to become dean
    const { facultyId } = req.params;

    // Only admin can assign deans
    if (req.user.role !== 'admin') {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 403, "Only admin can assign deans");
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(facultyId)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Invalid IDs provided");
    }

    const faculty = await Faculty.findById(facultyId).session(session);
    if (!faculty) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Faculty not found");
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "User not found");
    }

    // Ensure user is a lecturer (since deans are typically promoted lecturers)
    if (!["lecturer", "hod", "dean"].includes((user.role || "").toLowerCase())) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Only lecturers or HODs can be assigned as dean"+user.role);
    }

    // Prevent assigning a user who is already dean of another faculty
    const existingDeanFaculty = await Faculty.findOne({ dean: userId, _id: { $ne: facultyId } }).session(session);
    if (existingDeanFaculty) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(
      res,
      400,
      `This user is already the dean of another faculty of '${existingDeanFaculty.name}'`
      );
    }

    // Prevent assigning a user who is already HOD of a department
    const hodDepartment = await departmentModel.findOne({ hod: userId }).session(session);
    if (hodDepartment) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(
      res,
      400,
      `This user is already the HOD of the department of '${hodDepartment.name}'`
      );
    }


    // Assign the new dean
    faculty.dean = user._id;
    user.role = "dean";
    
    // Update user faculty assignment
    user.faculty = facultyId;

    // Update lecturer model if exists
    const lecturer = await lecturerModel.findOne({ _id: user._id }).session(session);
    if (lecturer) {
      lecturer.isDean = true;
      lecturer.facultyId = facultyId;
      await lecturer.save({ session });
    }

    await faculty.save({ session });
    await user.save({ session });

    // ✅ Commit the transaction FIRST
    await session.commitTransaction();
    
    // ✅ End the session AFTER commit
    session.endSession();

    // ✅ Now do the population OUTSIDE the transaction
    const populatedFaculty = await Faculty.findById(facultyId)
      .populate({ 
        path: "dean", 
        select: "firstName lastName email role staffId" 
      })
      .lean();

    return buildResponse(res, 200, "Dean assigned successfully", populatedFaculty);

  } catch (error) {
    // ✅ Check if transaction was already committed
    if (session.transaction.isCommitted) {
      console.log("Transaction was already committed, cannot abort");
      session.endSession();
    } else {
      // ✅ Only abort if transaction wasn't committed
      await session.abortTransaction();
      session.endSession();
    }
    
    console.error("assignDean error:", error);
    return buildResponse(res, 500, "Failed to assign dean", null, true, error);
  }
};

/* ===== Remove Dean from Faculty ===== */
export const removeDean = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { facultyId } = req.params;

    // Only admin can remove deans
    if (req.user.role !== 'admin') {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 403, "Only admin can remove deans");
    }

    if (!mongoose.Types.ObjectId.isValid(facultyId)) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "Invalid faculty ID");
    }

    const faculty = await Faculty.findById(facultyId).session(session);
    if (!faculty) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Faculty not found");
    }

    if (!faculty.dean) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 400, "No dean assigned to this faculty");
    }

    const deanUser = await User.findById(faculty.dean).session(session);
    if (deanUser) {
      // If user was a hod before becoming dean, restore hod role, otherwise set to lecturer
      const lecturerRecord = await lecturerModel.findOne({ _id: deanUser._id }).session(session);
      // if (lecturerRecord && lecturerRecord.isHOD) {
      //   deanUser.role = "hod";
      // } else {
        deanUser.role = "lecturer";
      // }
      
      // Clear faculty assignment
      deanUser.faculty = null;
      await deanUser.save({ session });

      // Update lecturer model if exists
      if (lecturerRecord) {
        lecturerRecord.isDean = false;
        lecturerRecord.facultyId = null;
        await lecturerRecord.save({ session });
      }
    }

    faculty.dean = null;
    await faculty.save({ session });

    await session.commitTransaction();
    session.endSession();

    return buildResponse(res, 200, "Dean removed successfully");
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("removeDean error:", error);
    return buildResponse(res, 500, "Failed to remove dean", null, true, error);
  }
};
