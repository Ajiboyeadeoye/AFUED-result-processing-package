import facultyModel from "./faculty.model.js";

const getFacultyByDean = async (deanId, options = {}) => {
  try {
    let query = facultyModel.findOne({ dean: deanId });

    if (options.session) {
      query = query.session(options.session);
    }

    if (options.populate) {
      query = query.populate(options.populate);
    }

    if (options.lean) {
      query = query.lean();
    }

    return await query;
  } catch (error) {
    logger.error(`FacultyService.getFacultyByDean failed: ${error.message}`, {
      deanId,
      options,
      stack: error.stack
    });
    throw error;
  }
};

export default {
  getFacultyByDean
};
