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
    FacultyById: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    dep_count: async (doc, models) =>
      await models.Department.countDocuments({ faculty: doc._id }),
    created_at: "this.createdAt",
    updated_at: "this.updatedAt",
    created_by: "this.createdBy",
    created_by_name: async (doc, models) => {
      const user = await models.User.findById(doc.createdBy);
      return user ? user.name : null;
    },
    recent_departments: async (doc, models) => {
      return await models.Department.find({ faculty: doc._id })
        .sort({ createdAt: -1 })
        .limit(5);
    }

  },

      DepartmentById: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    created_at: "this.createdAt",
    updated_at: "this.updatedAt",
    created_by: "this.createdBy",
    created_by_name: async (doc, models) => {
      const user = await models.User.findById(doc.createdBy);
      return user ? user.name : null;
    },
    hod_name: async (doc, models) => {
      const lecturer = await models.Lecturer.findById(doc.hod);
      if (lecturer) {
        const user = await models.User.findById(lecturer.user);
        return user ? user.name : null;
      }
      return null;
    },
    hod_id: "this.hod",

  },

  Department: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    faculty_id: "this.faculty._id",
    faculty_name: "this.faculty.name",
    hod_name: "this.hod.name",
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
    Lecturer: {
    _id: "this._id._id",
    rank: "this.rank",
  name: "this.user?.name || this._id?.name",
    staff_id: "this.staffId",
    department_id: "this.departmentId._id",
    department: "this.departmentId.name",
    email: "this.user?.email || this._id?.email",
    is_hod: "this.isHOD",
  },
};
