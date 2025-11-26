export const dataMaps = {
  Faculty: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    dep_count: async (doc, models) =>
      await models.Department.countDocuments({ faculty: doc._id }),
    // student_count: async (doc, models) =>
    //   await models.Student.countDocuments({ faculty: doc._id }),
    dean_name: async (doc, models) => {
      const lecturer = await models.Lecturer.findById(doc.dean);
      if (lecturer) {
        const user = await models.User.findById(lecturer._id);
        return user ? user.name : null;
      }
      return null;
    },
    dean_id: "this.dean",
    created_at: "this.createdAt",
    updated_at: "this.updatedAt",
    created_by: "this.createdBy",
    created_by_name: async (doc, models) => {
      const user = await models.User.findById(doc.createdBy);
      return user ? user.name : null;
    },
    departments: async (doc, models) => {
      const departments = await models.Department.find({ faculty: doc._id }).lean();
      for (const dept of departments) {
        if (dept.hod) {
          const user = await models.User.findById(dept.hod);
          dept.hod_name = user ? user.name : null;
        } else {
          dept.hod_name = null;
        }
      }
      return departments;
    },
    total_lecturers: async (doc, models) =>
      await models.Lecturer.countDocuments({ departmentId: { $in: await models.Department.find({ faculty: doc._id }).distinct("_id") } }),  
    total_students: async (doc, models) =>
      await models.Student.countDocuments({ departmentId: { $in: await models.Department.find({ faculty: doc._id }).distinct("_id") } }),
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
        // console.log("The lecur8e", lecturer);
        const user = await models.User.findById(lecturer._id);
        return user ? user.name : null;
      }
      return null;
    },
  },

  DepartmentStats: {
    _id: "this._id",
    name: "this.name",
    code: "this.code",
    faculty_id: "this.faculty._id",
    faculty_name: "this.faculty.name",
    hod_name: async (doc, models) => {
      const lecturer = await models.Lecturer.findById(doc.hod);
      if (lecturer) {
        // console.log("The lecur8e", lecturer);
        const user = await models.User.findById(lecturer._id);
        return user ? user.name : null;
      }
      return null;
    },
    total_courses: async (doc, models) =>
      await models.Course.countDocuments({ department: doc._id }),
    total_lecturers: async (doc, models) =>
      await models.Lecturer.countDocuments({ departmentId: doc._id }),
    total_students: async (doc, models) =>
      await models.Student.countDocuments({ departmentId: doc._id }),
    active_semester: async (doc, models) => {
      const activeSemester = await models.Semester.findOne({ isActive: true, departmentId: doc._id }).lean();
      return activeSemester ? activeSemester.name : "N/A";
    }
  },

  Course: {
    _id: "this._id",
    code: "this.code || this.borrowedId.code",
    code: "this.courseCode || this.borrowedId.courseCode",
    faculty_id: "this.faculty._id",
    faculty_name: "this.faculty.name",
    unit: "this.unit || this.borrowedId.unit",
    level: "this.level || this.borrowedId.level",
    semester: "this.semester || this.borrowedId.semester",
    type: "this.type",
    name: "this.title || this.borrowedId.title",
    hod_name: "this.hod.name",
    department_id: "this.department._id",
    department: "this.department.name",
    description: "this.description || this.borrowedId.description",
    outline: "this.outline",
    borrowed_department: async (doc, models) => {
      if (doc.borrowedId != null) {
        const dep = await models.Department.findOne({ _id: doc.borrowedId.department })
        // populate("")
        // console.log(dep, doc.borrowedId)
        if (dep) return dep.name

      }
    },
    borrowed: (doc) => {
      if (doc.borrowedId != null) return true
    },
    lecturer: async (doc, models) => {
      const assignment = await models.CourseAssignment.findOne({ course: doc._id })
        .populate("lecturer", "name email")
        .lean();

      if (!assignment || !assignment.lecturer) return null;

      console.log("The assignment lecturer", assignment.lecturer);
      return {
        _id: assignment.lecturer._id,
        name: assignment.lecturer.name || null,
        email: assignment.lecturer.email || null,
      };

    },
    createdAt: "this.createdAt",
    updatedAt: "this.updatedAt"
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
    id: "this._id._id",
    name: "this.user?.name || this._id?.name",
    matric_no: "this.matricNumber",
    department: "this.departmentId.name",
    department_id: "this.departmentId._id",
    faculty_name: "Faculty.name",
    level: 'this.level'
  },

  Lecturer: {
    _id: "this._id._id",
    rank: "this.rank",
    name: "this.user?.name || this._id?.name",
    staff_id: "this.staffId",
    department_id: "this.department._id",
    department: "this.department.name",
    email: "this.user?.email || this._id?.email",
    is_hod: "this.isHOD",
    n: (doc, models)=>{
      console.log(doc)
    }
  },

  LecturerCourses: {
    lecturer_id: "this._id._id",
    name: "this._id.name",
    staff_id: "this.staffId",
    courses: async (doc, models) => {
      const assignments = await models.CourseAssignment.find({ lecturer: doc._id._id })
        .populate("course", "title courseCode unit level semester type")
        .lean();

      return assignments.map(a => ({
        _id: a.course._id,
        title: a.course.title,
        courseCode: a.course.courseCode,
        unit: a.course.unit,
        level: a.course.level,
        semester: a.course.semester,
        type: a.course.type,
      }));
    }
  },
  CourseAssignment: {
    _id: "this._id",
    // lecturer_name: async (doc, models) => {
    //   const lecturer = await models.Lecturer.findById(doc.lecturer).populate("_id", "name");
    //   console.log("The lecturer 🧱", lecturer);
    //   return lecturer && lecturer.user ? lecturer._id.name : null;
    // },
    course_id: "this.course._id",
    name: "this.course.title",
    code: "this.course.courseCode",
    unit: "this.course.unit",
    level: "this.course.level",
    semester: "this.semester.name",
    session: "this.session",
    department_id: "this.department._id",
    department: "this.department.name",
    status: "this.status",
    students: async (doc, models) => {
      return await models.CourseRegistration.countDocuments({
        course: doc.course?._id || doc.course,
        semester: doc.semester?._id || doc.semester,
      });
    },


  }
  ,
  Applicant: {
    id: "this._id",
    name: "User.name",
    jamb_reg_number: "this.jambRegNumber",
    score: "this.score",
    program_name: "Department.name",
    faculty_name: "Faculty.name",
    admission_status: "this.admissionStatus",

  },
  Template: {
    _id: "this._id",
    name: "this.name",
    channel: "this.channel",
    email_template: "this.email_template",
    whatsapp_template: "this.whatsapp_template",
    variables: "this.variables",
    // created_by: async (doc, models) => {
    //   if (!doc.created_by) return null;
    //   const user = await models.User.findById(doc.created_by).select("name").lean();
    //   return user ? user.name : null;
    // },
    created_at: "this.createdAt",
    updated_at: "this.updatedAt",
  },

  AdminOverview: {
    activeSemester: async (doc, models) => {
      // Fetch the active semester from the database
      const activeSemester = await models.Semester.findOne({ isActive: true }).lean();
      return activeSemester ? activeSemester.name : "N/A";
    },
    totalStudents: async (doc, models) => {
      return await models.Student.countDocuments();
    },
    totalLecturers: async (doc, models) => {
      return await models.Lecturer.countDocuments();
    },
    totalCourses: async (doc, models) => {
      return await models.Course.countDocuments();
    }
  },
  Notifications: {
    title: "this.title",
    message: "this.message",
    type: "this.type",
    is_read: "this.is_read",
    created_at: "this.created_at"
  },
  Announcement: {
    _id: "this._id",
    title: "this.title",
    description: "this.description",
    content: "this.content",
    category: "this.category",
    priority: "this.priority",
    image: "this.image",
    date: "this.date",
    expiresAt: "this.expiresAt",
    isActive: "this.isActive"

  }
};