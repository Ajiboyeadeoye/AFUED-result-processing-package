import Faculty from "./faculty.model.js";
import buildResponse from "../../utils/responseBuilder.js";


export const createFaculty = async (req, res) => {
  try {
    const { name } = req.body;
    const faculty = await Faculty.create({
      name,
      createdBy: req.user._id
    });
    return buildResponse(res, 201, "Faculty created successfully", faculty);
  } catch (error) {
    return buildResponse(res, 500, "Error creating faculty", null, true, error);
  }
};

export const getAllFaculties = async (req, res) => {
  try {
    const faculties = await Faculty.find();
    return buildResponse(res, 200, "Faculties fetched", faculties);
  } catch (error) {
    return buildResponse(res, 500, "Error fetching faculties", null, true, error);
  }
};

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
    const faculty = await Faculty.findByIdAndUpdate(
      req.params.facultyId,
      req.body,
      { new: true }
    );
    if (!faculty) return buildResponse(res, 404, "Faculty not found");
    return buildResponse(res, 200, "Faculty updated", faculty);
  } catch (error) {
    return buildResponse(res, 500, "Error updating faculty", null, true, error);
  }
};

export const deleteFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndDelete(req.params.facultyId);
    if (!faculty) return buildResponse(res, 404, "Faculty not found");
    return buildResponse(res, 200, "Faculty deleted");
  } catch (error) {
    return buildResponse(res, 500, "Error deleting faculty", null, true, error);
  }
};
