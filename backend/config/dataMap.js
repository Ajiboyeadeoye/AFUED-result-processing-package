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
    code: (doc) => {
      // console.log(doc)
      if (doc.borrowedId) return doc.borrowedId.courseCode;
      if (doc.courseCode) return doc.courseCode;
      console.log("The borrowedId", doc.borrowedId);
      return null;
    },
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
      // console.log(doc)
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


      // 2. Get active semester for the lecturer’s department
      const activeSemester = await models.Semester.findOne({
        department: doc.department._id,
        isActive: true
      }).lean();

      if (!activeSemester) {
        return null
      };

      // 3. Fetch the most recent CourseAssignment using course + active semester
      const finalAssignment = await models.CourseAssignment
        .findOne({
          course: doc._id,
          semester: activeSemester._id
        })
        .sort({ createdAt: -1 }) // most recent
        .populate("lecturer", "name email")
        .lean();
        
        console.log({semester: activeSemester._id})
        if (!finalAssignment || !finalAssignment.lecturer) return null;

      return {
        _id: finalAssignment.lecturer._id,
        name: finalAssignment.lecturer.name || null,
        email: finalAssignment.lecturer.email || null
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
    lecturer: async (doc, models) => {
      const assignment = await models.CourseAssignment.findOne({ course: doc._id })
        .populate("lecturer", "name email")
        .lean();

      if (!assignment || !assignment.lecturer) return null;

      return {
        _id: assignment.lecturer._id,
        name: assignment.lecturer.name || null,
        email: assignment.lecturer.email || null,
      };

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

  RegisteredCourses: {
    student_id: "this.student._id",
    name: "this.student.name",
    matric_no: "this.student.matricNumber",
    department: "this.student.departmentId.name",
    department_id: "this.student.departmentId._id",
    faculty_name: "Faculty.name",
  },


  Student: {
    _id: "this._id._id",
    name: "this._id.name || this._id?.name",
    matric_no: "this.matricNumber",
    department: "this.departmentId.name",
    department_id: "this.departmentId._id",
    faculty_name: "Faculty.name",
    level: 'this.level',
    cgpa: "this.cgpa",
    gpa: "this.gpa",
    probationStatus: "this.probationStatus",
    terminationStatus: "this.terminationStatus",
    semester: async (doc, models) => {
      if (!doc.departmentId?._id) return "N/A";
      const activeSemester = await models.Semester.findOne({ isActive: true, department: String(doc.departmentId?._id) }).lean();
      // console.log("The active semester", activeSemester, String(doc.departmentId._id) );
      return activeSemester ? activeSemester.name : "N/A";
    },
    semesters: async (doc, models) => {
      try {
        const studentId = doc._id;
        if (!studentId) return [];

        // Fetch all semester result docs for this student
        const results = await models.StudentSemesterResult.find({
          studentId
        })
          .populate("semesterId")
          .lean();

        if (!results.length) return [];

        // Transform into readable format
        return results.map(r => ({
          _id: r.semesterId?._id || null,
          name: r.semesterId?.name || null,
          session: r.semesterId?.session || null,
          level: r.semesterId?.level || null,
          gpa: r.gpa,
          cgpa: r.cgpa,
          remark: r.remark,
          createdAt: r.createdAt
        }));
      } catch (err) {
        console.error("Error fetching student semesters:", err);
        return [];
      }
    },

    email: "this._id.email"
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
    n: (doc, models) => {
      console.log(doc.departmentId)
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
      // Resolve course and semester ids (handles populated or raw ids)
      const courseId = doc.course?._id || doc.course;
      const semesterId = doc.semester?._id || doc.semester;
      const session = doc.session;

      console.log("CourseAssignment students resolver", { courseId, semesterId, session });
      if (!courseId || !semesterId) return 0;

      const filter = {
        courses: courseId,     // matches documents where courses array contains courseId
        semester: semesterId,
      };

      // include session in filter if available (registrations are unique per student+semester+session)
      if (session) filter.session = session;
      console.log("CourseAssignment students filter", filter);
      return await models.CourseRegistration.countDocuments(filter);
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

  },
  // CourseRegistration: {
  //   buffer_courses: async (doc, models) => {
  //     const buffer = await models.carryOverSchema.findMany({ student: doc.student });
  //     return buffer;
  //   },
  //   semseter_courses: async (doc, models) => {
  //     const student = await models.Student.findById(doc._id);
  //     const courses = await models.Courses.findMany({ semester: doc.name, level: doc.level });
  //     return courses;
  //   },
  //   level_settings: async (doc, models) => {
  //     const settings = doc.levelSettings
  // }
};