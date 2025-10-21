// 💾 Data Transformation Configs
export const dataMaps = {
  Faculty: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    dep_count: async (doc, models) =>
      await models.Department.countDocuments({ faculty: doc._id }),
    // student_count: async (doc, models) =>
    //   await models.Student.countDocuments({ faculty: doc._id }),
  },

  Department: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    faculty_id: "this.faculty._id",
    faculty_name: "this.faculty.name",
    // student_count: async (doc, models) =>
    //   await models.Student.countDocuments({ department: doc._id }),
  },

  Student: {
    id: "this._id",
    name: "this.name",
    matric_number: "this.matric_number",
    department_name: "Department.name",
    faculty_name: "Faculty.name",
  },
};
