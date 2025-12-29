import Course from "./course.model.js";

class CourseService {
  async findByIds(ids) {
    return Course.find({ _id: { $in: ids } });
  }

  async findById(id, options = {}) {
    let query = Course.findById(id);
    if (options.lean) query = query.lean();
    return query;
  }

  async existsByCourseCode(courseCode) {
    return Course.exists({ courseCode });
  }

  async findCoreByLevel(level) {
    return Course.find({ level, type: "core" }).distinct("_id");
  }
}

export default new CourseService();
