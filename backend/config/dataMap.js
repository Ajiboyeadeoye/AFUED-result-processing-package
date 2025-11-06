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
    faculty_id: "this.faculty._id",
    faculty_name: "this.faculty.name",
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
    hod_name: async (doc, models) => {
      const lecturer = await models.Lecturer.findById(doc.hod);
      if (lecturer) {
        console.log("The lecur8e", lecturer);
        const user = await models.User.findById(lecturer._id);
        return user ? user.name : null;
      }
      return null;
    },
  },


  Course: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    code: "this.courseCode",
    faculty_id: "this.faculty._id",
    faculty_name: "this.faculty.name",
    unit: "this.unit",
    level: "this.level",
    semester: "this.semester",
    type: "this.type",
    name: "this.title",
    hod_name: "this.hod.name",
    department_id: "this.department._id",
    department: "this.department.name",
    description: "this.description",
    outline: "this.outline",
    // student_count: async (doc, models) =>
    //   await models.Student.countDocuments({ department: doc._id }),
  },
  CourseById: {
    _id: "this._id",
    name: "this.title",
    code: "this.code",
    code: "this.courseCode",
    faculty_id: "this.faculty?._id",
    faculty_name: "this.faculty?._name || this.faculty?.name",
    unit: "this.unit",
    level: "this.level",
    semester: "this.semester",
    type: "this.type",
    hod_name: "this.hod?.name || null",
    department_id: "this.department?._id",
    department: "this.department?._name || this.department?.name",
    description: "this.description",
    outline: "this.outline",
    // Return array of lecturer objects: { _id, name, email }
    lecturers: async (doc, models) => {
      // find all course assignments for this course (covers multiple assignments/sessions)
      const assignments = await models.CourseAssignment.find({ course: doc._id })
        .populate("lecturers.user", "name email")
        .lean();

      if (!assignments || assignments.length === 0) return [];

      // flatten lecturers from all assignments and dedupe by user id
      const map = new Map();
      assignments.forEach(a => {
        (a.lecturers || []).forEach(l => {
          const user = l.user;
          if (user && user._id) {
            map.set(String(user._id), {
              _id: user._id,
              name: user.name || null,
              email: user.email || null,
            });
          }
        });
      });

      return Array.from(map.values());
    },
    // Return array of lecturer names
    assigned_lecturers: async (doc, models) => {
      const assignments = await models.CourseAssignment.find({ course: doc._id })
        .populate("lecturers.user", "name")
        .lean();

      if (!assignments || assignments.length === 0) return [];

      const nameSet = new Set();
      assignments.forEach(a => {
        (a.lecturers || []).forEach(l => {
          const user = l.user;
          if (user && user.name) nameSet.add(user.name);
        });
      });

      return Array.from(nameSet);
    },
    created_at: "this.createdAt",
    updated_at: "this.updatedAt",
    created_by: "this.createdBy",
    created_by_name: async (doc, models) => {
      if (!doc.createdBy) return null;
      const user = await models.User.findById(doc.createdBy).select("name").lean();
      return user ? user.name : null;
    }
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

  LecturerCourses: {
    lecturer_id: "this._id._id",
    name: "this._id.name",
    staff_id: "this.staffId",
    courses: async (doc, models) => {
      const assignments = await models.CourseAssignment.find({ "lecturers.lecturer": doc._id })
        .populate("course")
        .lean();

      return assignments.map(a => ({
        course_id: a.course._id,
        course_name: a.course.name,
        course_code: a.course.code,
        level: a.course.level,
        semester: a.course.semester,
        type: a.course.type,
      }));
    },
  },

  Applicant: {
    id: "this._id",
    name: "User.name",
    jamb_reg_number: "this.jambRegNumber",
    score: "this.score",
    program_name: "Department.name",
    faculty_name: "Faculty.name",
    admission_status: "this.admissionStatus",
  },

};
