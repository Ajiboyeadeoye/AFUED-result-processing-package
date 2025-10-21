import Faculty from "./faculty.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";
import { universalQueryHandler } from "../../utils/universalQueryHandler.js";
import mongoose from "mongoose";
import { dataMaps } from "../../config/dataMap.js";
// import { fetchDataHelper } from "../../utils/fetchDataHelper.js";


export const createFaculty = async (req, res) => {
  try {
    const { name, code, fields, search_term, filters, page } = req.body;

    // 🧠 1. If request contains advanced filter data
    if (fields || search_term || filters || page) {
         const result = await fetchDataHelper(req, res, Faculty, {
      configMap: dataMaps.Faculty,
      autoPopulate: false,
      models: {  },
  
      // populate: ["faculty"]
    });
    return buildResponse(res, 200, "Filtered departments fetched", result);
    
    }


    // ✅ Validate inputs
    if (!name || !code) {
      return buildResponse(res, 403, "Required fields missing", null, true);
    }

    // ✅ Normalize code (optional)
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
  // try {
  //   // Get pagination params from query
  //   const { page = 1, limit = 50 } = req.query;

  //   // Convert to numbers and calculate skip
  //   const skip = (Number(page) - 1) * Number(limit);

  //   // Fetch paginated faculties
  //   const faculties = await Faculty.find()
  //     .skip(skip)
  //     .limit(Number(limit));

  //   // Get total count for pagination info
  //   const totalCount = await Faculty.countDocuments();
  //   const totalPages = Math.ceil(totalCount / Number(limit));

  //   console.log("Faculties fetched successfully ✅");

  //   // Send paginated response
  //   return buildResponse(res, 200, "Faculties fetched", {
  //     pagination: {
  //       current_page: Number(page),
  //       limit: Number(limit),
  //       total_pages: totalPages,
  //       total_items: totalCount,
  //     },
  //     data: faculties,
  //   });
  // }

  try {
    const result = await fetchDataHelper(req, res, Faculty, {
      configMap: dataMaps.Faculty,
      autoPopulate: false,
      models: {  },
    });
    return buildResponse(res, 200, "Filtered departments fetched", result);

  }

  catch (error) {
    console.error("Error fetching faculties ❌", error);
    return buildResponse(res, 500, "Error fetching faculties", null, true, error);
  }
};


// export const getAllFaculties = async (req, res) => {
//   return fetchDataHelper(req, res, Faculty, {
//   });
// };

export const getFacultyById = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.facultyId);
    if (!faculty) return buildResponse(res, 404, "Faculty not found");
    return buildResponse(res, 200, "Faculty found", faculty);
  } catch (error) {
    return buildResponse(res, 500, "Error fetching faculty", null, true, error);
  }
};

export const updateFaculty = async (req, res) => {
  try {
    const { name, code } = req.body;
    const { facultyId } = req.params;

    // 🧱 Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(facultyId)) {
      return buildResponse(res, 400, "Invalid faculty ID format");
    }

    // 🔍 Check if faculty exists
    const existingFaculty = await Faculty.findById(facultyId);
    if (!existingFaculty)
      return buildResponse(res, 404, "Faculty not found");

    // 🚫 Check for duplicate name (case-insensitive)
    const duplicateName = await Faculty.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id: { $ne: facultyId },
    });
    if (duplicateName)
      return buildResponse(res, 409, `Faculty name '${name}' already exists`);

    // 🚫 Check for duplicate code (case-insensitive)
    const duplicateCode = await Faculty.findOne({
      code: { $regex: new RegExp(`^${code}$`, "i") },
      _id: { $ne: facultyId },
    });
    if (duplicateCode)
      return buildResponse(res, 409, `Faculty code '${code}' already exists`);

    // ✅ Update the faculty
    const updatedFaculty = await Faculty.findByIdAndUpdate(
      facultyId,
      req.body,
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
    // Add 2-second delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const faculty = await Faculty.findByIdAndDelete(req.params.facultyId);
    if (!faculty) return buildResponse(res, 404, "Faculty not found");

    return buildResponse(res, 200, "Faculty deleted");
  } catch (error) {
    return buildResponse(res, 500, "Error deleting faculty", null, true, error);
  }
};
