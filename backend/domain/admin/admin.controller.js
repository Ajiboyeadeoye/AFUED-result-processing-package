// controllers/adminController.ts
// // import Student from "./student.model.js";
// import Lecturer from "./lecturer.model.js";
// import Course from "./course.model.js";
// import Semester from "./semester.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";
import { dataMaps } from "../../config/dataMap.js";
import studentModel from "../student/student.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import courseModel from "../course/course.model.js";
import Semester from "../semester/semester.model.js";
import User from "../user/user.model.js";

export const getAdminOverview = async (req, res) => {
  try {
    // If request contains filters, pagination, etc.

    const models = { studentModel, lecturerModel, courseModel, Semester };

    // if (fields || search_term || filters || page) {
      const result = await fetchDataHelper(req, res, User, {
        configMap: dataMaps.AdminOverview,
        autoPopulate: false,
        models,
      });

      return buildResponse(res, 200, "Filtered overview fetched", result);
    // }

    // Otherwise, fetch all stats
    // const result= {};
    // for (const key in dataMaps.AdminOverview) {
    //   const mapFunc = dataMaps.AdminOverview[key];
    //   if (typeof mapFunc === "function") {
    //     result[key] = await mapFunc(null, models);
    //   } else {
    //     result[key] = mapFunc;
    //   }
    // }

    return buildResponse(res, 200, "Admin overview fetched successfully", result);
  } catch (error) {
    console.error("❌ Error fetching admin overview:", error);
    return buildResponse(res, 500, "Failed to fetch admin overview", null, true, error);
  }
};
