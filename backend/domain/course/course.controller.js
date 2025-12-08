// =========================================================
// 🧠 COURSE CONTROLLER FOR A NIGERIAN UNIVERSITY SYSTEM
// Handles: Course CRUD, Assignment, Registration, Approvals,
// Departmental Operations, Lecturer Management, and Analytics
// =========================================================

import Course from "./course.model.js";
import CourseAssignment from "./courseAssignment.model.js";
import CourseRegistration from "./courseRegistration.model.js";
import Department from "../department/department.model.js";
import Faculty from "../faculty/faculty.model.js";
import Semester from "../semester/semester.model.js";
import User from "../user/user.model.js";

import mongoose from "mongoose";
import buildResponse from "../../utils/responseBuilder.js";
import { dataMaps } from "../../config/dataMap.js";
import departmentModel from "../department/department.model.js";
import fetchDataHelper from "../../utils/fetchDataHelper.js";
import courseAssignmentModel from "./courseAssignment.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import courseModel from "./course.model.js";
import studentModel from "../student/student.model.js";
import carryOverSchema from "./carryOverSchema.js";

// =========================================================
// 🧩 Utility Functions
// =========================================================
// const buildResponse = (success, message, data = null) => ({
//   success,
//   message,
//   data,
// });

const calculateTotalUnits = async (courseIds = []) => {
  const courses = await Course.find({ _id: { $in: courseIds } }).lean();
  return courses.reduce((sum, course) => sum + (course.unit || 0), 0);
};

// =========================================================
// 🧱 COURSE CRUD OPERATIONS
// =========================================================

export const createCourse = async (req, res) => {
  try {
    let { courseCode, title, unit, level, semester, type, department_id: department, faculty, description, borrowedId, fields, search_term, filters, page, extras } = req.body;

    // 🔍 If this is a list/filter request, handle early
    if (fields || search_term || filters || page) {
      return getAllCourses(req, res)
    }


    // 🛡 HOD restriction: can only create in their department
    if (req.user?.role === "hod") {
      const hodDept = await departmentModel.findOne({ hod: req.user._id });
      if (!hodDept) return buildResponse(res, 404, "Department not found for HOD", null, true);
      department = hodDept._id;
    }

    // Validate department
    const deptExists = await Department.findById(department);
    if (!deptExists) return buildResponse.error(res, "Department not found");

    // Handle borrowed course
    if (borrowedId) {
      // Check original course exists
      const original = await Course.findById(borrowedId);
      if (!original) return buildResponse.error(res, "Original course not found");

      type = "borrowed"; // force type
      courseCode = null;
      title = null;
      unit = null;
      level = null;
      semester = null;
      faculty = null;
      description = null;
    } else {
      // Only validate original courses
      if (!courseCode || !title || !unit || !level || !semester) {
        return buildResponse.error(res, "All fields are required for original courses");
      }

      // Normal course: prevent duplicates by code
      const exists = await Course.findOne({ courseCode });
      if (exists) return buildResponse.error(res, "Course with this code already exists");
    }

    // Create course
    let newCourse = new Course({
      courseCode,
      title,
      unit,
      level,
      semester,
      type,
      department,
      faculty,
      description,
      borrowedId: borrowedId || null,
      createdBy: req.user?._id || null,
    });

    await newCourse.save();

    // Populate for response
    newCourse = await getCourseById({ params: { courseId: newCourse._id } }, res);

    return buildResponse.success(res, "Course created successfully", newCourse);

  } catch (err) {
    console.log("Request STATUS:", err);
    return buildResponse(res, 404, "Course creation failed", null, true);
  }
};

export const getAllCourses = async (req, res) => {
  try {
    let result;

    // 🧠 If HOD, restrict to their department
    const isHod = req.user?.role === "hod";
    const department = isHod ? await departmentModel.findOne({ hod: req.user?._id }) : null;

    if (isHod && !department) {
      return buildResponse(res, 404, "Department not found for HOD", null, true);
    }

    const fetchConfig = {
      configMap: dataMaps.Course,
      autoPopulate: true,
      models: { departmentModel },
      populate: ["department"],
      ...(isHod && {
        additionalFilters: {
          department: department._id
        },

      }),
      // custom_fields: { courseCode: "borrowedId", department: 'department' }, // Map if needed
      // custom_fields: { courseCode: { path: 'borrowedId.courseCode', fallback: 'courseCode' }, department: 'department' }, // Map if needed
      custom_fields: {
        courseCode: {
          path: 'borrowedId.courseCode',
          find: 'borrowedId.courseCode',  // Explicit search path
          fallback: 'courseCode'
        },
        courseTitle: {
          path: 'borrowedId.title',
          find: 'borrowedId.title',  // Explicit search path
          fallback: 'title'
        },
        departmentName: {
          path: 'department.name',  // Explicit path
          find: 'department.name',   // Explicit search
        }
      },
      populate: ["department", "borrowedId"],
    };



    result = await fetchDataHelper(req, res, Course, fetchConfig);


    // return buildResponse(res, 200, "All Courses fetched", result);
  } catch (error) {
    console.error(error);
    return buildResponse(res, 500, "Failed to fetch courses", null, true, error);
  }
};



export const getCourseById = async (req, res) => {
  try {
    // const { id } = req.params;

    const result = await fetchDataHelper(req, res, Course, {
      configMap: dataMaps.CourseById,
      autoPopulate: false,
      models: { departmentModel, CourseAssignment },
      additionalFilters: { _id: req.params.courseId },
      populate: ["department", "borrowedId"],

    });

    // return res
    //   .status(200)
    //   .json(buildResponse(res, 200, "Course fetched successfully", result));
  } catch (err) {
    console.error("Error fetching course:", err);
    return res
      .status(500)
      .json(buildResponse(res, 500, "Failed to fetch course", null, true, err));
  }
};

export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(id)
    const updates = req.body;

    const course = await Course.findById(id);
    if (!course)
      return res.status(404).json(buildResponse(res, 404, "Course not found"));

    Object.assign(course, updates);
    await course.save();

    res.json(buildResponse(res, 200, "Course updated successfully", course));
  } catch (err) {
    res.status(500).json(buildResponse(res, 500, err.message));
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findByIdAndDelete(id);
    if (!course)
      return res.status(404).json(buildResponse(res, 404, "Course not found"));
    res.json(buildResponse(res, 200, "Course deleted successfully"));
  } catch (err) {
    res.status(500).json(buildResponse(res, 500, err.message));
  }
};

// =========================================================
// 🎓 COURSE ASSIGNMENT HANDLING
// =========================================================

export const assignCourse = async (req, res) => {
  try {
    const { course, staffId: lecturer, department: borrowingDept } = req.body;

    // 🧩 Fetch course data
    const courseData = await Course.findById(course);
    if (!courseData) {
      return buildResponse(res, 404, "Course not found", null, true);
    }

    // 🔍 Determine if this is a borrowed course
    let originalCourse = courseData;
    let isBorrowed = false;

    if (courseData.borrowedId) {
      isBorrowed = true;
      originalCourse = await Course.findById(courseData.borrowedId);
      if (!originalCourse) {
        console.log(28932873293)
        return buildResponse(res, 404, "Original course not found", null, true);
      }
    }

    // 🧱 Determine which department the assignment should be linked to
    // Borrowed → borrowingDept, Normal → course's department
    let assignmentDeptId = isBorrowed ? borrowingDept : courseData.department;

    if (!assignmentDeptId) {
      return buildResponse(res, 400, "Department is required for assignment", null, true);
    }

    // 🏛 HOD restriction: only HOD of original department can assign
    if (req.user?.role === "hod") {
      const hodDept = await departmentModel.findOne({ hod: req.user._id });
      if (!hodDept) {
        return buildResponse(res, 404, "Department not found for HOD", null, true);
      }

      if (originalCourse.department.toString() !== hodDept._id.toString()) {
        return buildResponse(
          res,
          403,
          isBorrowed
            ? "Only HOD of the original department can assign borrowed courses"
            : "You cannot assign a course outside your department",
          null,
          true
        );
      }
    }

    // 🧠 Fetch active semester for the assignment department
    const currentSemester = await Semester.findOne({ department: assignmentDeptId, isActive: true });
    if (!currentSemester) {
      console.log("No active semseter")
      return buildResponse(res, 404, "No active semester found for this department", null, true);
    }

    const { _id: semester, session } = currentSemester;

    // 🔁 Prevent duplicate assignment per course + semester + session + department
    const existing = await CourseAssignment.findOne({
      course,
      semester,
      session,
      department: assignmentDeptId,
    });

    if (existing) {
      return buildResponse(res, 400, "Course already assigned for this session", null, true);
    }

    // 🪄 Create the assignment
    const newAssignment = new CourseAssignment({
      course,
      lecturer,
      semester,
      session,
      department: assignmentDeptId,
      assignedBy: req.user?._id,
    });

    await newAssignment.save();

    return buildResponse(res, 201, "Course assigned successfully", newAssignment);

  } catch (error) {
    console.error("❌ assignCourse error:", error);
    return buildResponse(res, 500, "Failed to assign course", null, true, error);
  }
};



export const getAssignments = async (req, res) => {
  try {
    const { session, semester, department } = req.query;
    const filter = {};
    if (session) filter.session = session;
    if (semester) filter.semester = semester;
    if (department) filter.department = department;

    const assignments = await CourseAssignment.find(filter)
      .populate("course lecturers.user semester department assignedBy")
      .sort({ createdAt: -1 });

    res.json(buildResponse(true, "Assignments fetched successfully", assignments));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

export const updateAssignmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const assignment = await CourseAssignment.findById(id);
    if (!assignment)
      return res.status(404).json(buildResponse(false, "Assignment not found"));

    assignment.status = status;
    await assignment.save();

    res.json(buildResponse(true, "Assignment status updated", assignment));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

// =========================================================
// 🧾 COURSE REGISTRATION SYSTEM
// =========================================================

export const registerCourses = async (req, res) => {
  try {
    const { courses: selectedCourseIds, department } = req.body;

    // 1️⃣ GET STUDENT
    const student = await studentModel.findById(req.user._id).lean();
    if (!student) {
      return buildResponse(res, 404, "Student not found", null, true);
    }
    const level = student.level;

    // 2️⃣ DETERMINE ACTIVE SEMESTER BASED ON ROLE
    let semesterQuery = { isActive: true };

    if (req.user.role === "admin") {
      if (!department) {
        return buildResponse(res, 400, "Department is required for admin");
      }
      semesterQuery.department = department;
    } else if (req.user.role === "hod") {
      const dept = await departmentModel.findOne({ hod: req.user._id });
      if (!dept) {
        return buildResponse(res, 404, "HOD department not found");
      }
      semesterQuery.department = dept._id;
    } else {
      semesterQuery.department = student.departmentId;
    }

    const currentSemester = await Semester.findOne(semesterQuery).lean();
    if (!currentSemester) {
      return buildResponse(res, 404, "No active semester found");
    }

    const { _id: semesterId, session, levelSettings } = currentSemester;

    // 3️⃣ CHECK IF STUDENT ALREADY REGISTERED
    const existingReg = await CourseRegistration.findOne({
      student: student._id,
      semester: semesterId,
      session,
    });

    if (existingReg) {
      return buildResponse(res, 400, "Student already registered for this semester");
    }

    // 4️⃣ FETCH LEVEL SETTINGS
    const settings = levelSettings.find(l => String(l.level) === String(level));
    if (!settings) {
      return buildResponse(res, 400, `No semester settings for level ${level}`);
    }

    const { minUnits, maxUnits, minCourses, maxCourses } = settings;

    // 5️⃣ FETCH SELECTED COURSES (raw)
    let selectedCourses = await Course.find({ _id: { $in: selectedCourseIds } }).lean();

    if (selectedCourses.length !== selectedCourseIds.length) {
      return buildResponse(res, 400, "Some selected courses do not exist");
    }

    // 6️⃣ BUILD RESOLVED COURSES FOR VALIDATION
    const resolvedCourses = [];
    for (const course of selectedCourses) {
      if (course.borrowedId) {
        // Borrowed course → get original for validation
        const original = await Course.findById(course.borrowedId).lean();
        if (!original) {
          return buildResponse(res, 400, `Borrowed course '${course._id}' has invalid borrowedId`);
        }

        resolvedCourses.push({
          ...original,
          _id: course._id,         // IMPORTANT: keep borrowed ID for saving
          borrowedFrom: original._id,
        });
      } else {
        resolvedCourses.push(course);
      }
    }

    // 7️⃣ VALIDATE UNITS
    const totalUnits = resolvedCourses.reduce((sum, c) => sum + (c.unit || 0), 0);
    if (totalUnits < minUnits || totalUnits > maxUnits) {
      return buildResponse(
        res,
        400,
        `Total units (${totalUnits}) must be between ${minUnits} and ${maxUnits}`
      );
    }

    // 8️⃣ VALIDATE COURSE COUNT
    if (selectedCourses.length < minCourses || selectedCourses.length > maxCourses) {
      return buildResponse(
        res,
        400,
        `Number of courses must be between ${minCourses} and ${maxCourses}`
      );
    }

    // 9️⃣ VALIDATE CORE COURSES
    const coreAssignments = await CourseAssignment.find({
      semester: semesterId,
      session,
      department: semesterQuery.department,
      course: { $in: await Course.find({ level, type: "core" }).distinct("_id") }
    });

    const coreCourseIds = coreAssignments.map(a => a.course.toString());
    const selectedStrIds = selectedCourseIds.map(id => id.toString());

    const missingCore = coreCourseIds.filter(id => !selectedStrIds.includes(id));

    if (missingCore.length > 0) {
      console.log("Missing core courses:", missingCore);
      // return buildResponse(res, 400, `Missing ${missingCore.length} core courses`, missingCore);

    }

    // 🔟 PREREQUISITE CHECK
    for (const course of resolvedCourses) {
      if (!course.prerequisites || !course.prerequisites.length) continue;

      const passed = await CourseRegistration.find({
        student: student._id,
        courses: { $in: course.prerequisites },
        status: "Approved",
      }).distinct("courses");

      const failedPrereq = course.prerequisites.filter(p => !passed.includes(p.toString()));

      if (failedPrereq.length > 0) {
        return buildResponse(
          res,
          400,
          `Prerequisites not met for ${course.title || "a borrowed course"}`,
          failedPrereq
        );
      }
    }

    // 1️⃣1️⃣ CARRYOVER CHECK
    const carryovers = await carryOverSchema.find({
      student: student._id,
      cleared: false,
    }).lean();

    for (const carry of carryovers) {
      if (!selectedStrIds.includes(carry.course.toString())) {
        return buildResponse(
          res,
          400,
          `Carryover course ${carry.course} must be included`
        );
      }
    }

    // 1️⃣2️⃣ ATTEMPT NUMBER
    const previousAttempts = await CourseRegistration.find({
      student: student._id,
      courses: { $in: selectedCourseIds },
    });

    const attemptNumber = previousAttempts.length + 1;

    // 1️⃣3️⃣ SAVE REGISTRATION
    const newReg = new CourseRegistration({
      student: student._id,
      courses: selectedCourseIds,   // IMPORTANT: NOT the originals
      semester: semesterId,
      session,
      level,
      totalUnits,
      attemptNumber,
      registeredByHod: req.user.role === "hod" ? req.user._id : null,
      notes: req.user.role === "hod" ? req.body.notes || null : null,
    });

    await newReg.save();

    return res.status(201).json(
      buildResponse(res, 201, "Courses registered successfully", newReg)
    );

  } catch (err) {
    console.error(err);
    return res.status(500).json(
      buildResponse(res, 500, "Course registration failed", null, true, err)
    );
  }
};

export const getStudentRegistrations = async (req, res) => {
  try {
    let { session, semester } = req.query;
    let studentId = req.params.studentId;

    // If student, always force their own ID
    if (req.user.role === "student") {
      studentId = req.user._id;
    }

    // HOD: must include studentId
    if (req.user.role === "hod") {
      if (!studentId) {
        return buildResponse.error(res, "studentId is required for HOD");
      }

      const hodDept = await departmentModel.findOne({ hod: req.user._id }).lean();
      if (!hodDept) return buildResponse.error(res, "HOD department not found");

      const targetStudent = await studentModel.findById(studentId).lean();
      if (!targetStudent) return buildResponse.error(res, "Student not found");

      if (String(targetStudent.departmentId) !== String(hodDept._id)) {
        return buildResponse.error(res, "You can only access students in your department");
      }
    }


    // Fetch student
    const student = await studentModel.findById(studentId).lean();
    if (!student) {
      return buildResponse.error(res, "Student not found");
    }

    // 1️⃣ Determine active semester for this student
    let semesterQuery = { isActive: true };

    if (req.user?.role === "hod") {
      const dept = await departmentModel.findOne({ hod: req.user._id }).lean();
      if (!dept) return buildResponse.error(res, "Department not found for HOD");
      semesterQuery.department = dept._id;
    } else {
      const dept = await departmentModel.findById(student.departmentId).lean();
      if (!dept) return buildResponse.error(res, "Department not found for Student");
      semesterQuery.department = dept._id;
    }

    const currentSemester = await Semester.findOne(semesterQuery).lean();
    if (!currentSemester) {
      return buildResponse.error(res, "Active semester not found");
    }

    // 2️⃣ Build filter
    const filter = { student: studentId };
    if (semester) filter.semester = currentSemester._id;

    console.log(filter)
    // 3️⃣ Fetch registrations
    let registrations = await CourseRegistration.find(filter)
      .populate("student courses semester approvedBy")
      .sort({ createdAt: -1 })
      .lean();

    // 4️⃣ Resolve borrowed courses
    for (const reg of registrations) {
      reg.courses = await Promise.all(
        reg.courses.map(async (course) => {
          if (!course.borrowedId) return course;

          const original = await Course.findById(course.borrowedId).lean();
          return original || course;
        })
      );
    }

    return buildResponse.success(res, "Registrations fetched", registrations);

  } catch (err) {
    return res
      .status(500)
      .json(buildResponse.error(res, err.message));
  }
};

export const approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const reg = await CourseRegistration.findById(id);
    if (!reg) return res.status(404).json(buildResponse(false, "Registration not found"));

    if (!["Approved", "Rejected"].includes(status))
      return res.status(400).json(buildResponse(false, "Invalid status"));

    reg.status = status;
    reg.approvedBy = req.user?._id;
    await reg.save();

    res.json(buildResponse(true, "Registration updated", reg));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

// =========================================================
// 🧮 DEPARTMENTAL / FACULTY UTILITIES
// =========================================================

export const getDepartmentCourses = async (req, res) => {
  try {
    const { department, level, semester } = req.query;
    if (!department)
      return res.status(400).json(buildResponse(false, "Department required"));

    const filter = { department };
    if (level) filter.level = level;
    if (semester) filter.semester = semester;

    const courses = await Course.find(filter).populate("faculty department");
    res.json(buildResponse(true, "Department courses fetched", courses));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

export const getFacultyCourses = async (req, res) => {
  try {
    const { faculty } = req.query;
    if (!faculty)
      return res.status(400).json(buildResponse(false, "Faculty required"));

    const courses = await Course.find({ faculty })
      .populate("department faculty")
      .sort({ level: 1, courseCode: 1 });

    res.json(buildResponse(true, "Faculty courses fetched", courses));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

// =========================================================
// 🧑‍🏫 LECTURER COURSE MANAGEMENT
// =========================================================

export const getLecturerCourses = async (req, res) => {
  try {

    const result = await fetchDataHelper(req, res, courseAssignmentModel, {
      configMap: dataMaps.CourseAssignment,
      autoPopulate: true,
      models: { courseModel, lecturerModel },
      additionalFilters: { lecturer: req.user?._id },
      populate: ["course"],

    });
    const lecturerId = req.user?._id;
    const assignments = result

    res.json(buildResponse(res, 200, "Lecturer courses fetched", assignments));
  } catch (err) {
    res.status(500).json(buildResponse(res, 500, err.message));
  }
};

export const addLecturerToCourse = async (req, res) => {
  try {
    const { assignmentId, userId } = req.body;
    const assignment = await CourseAssignment.findById(assignmentId);
    if (!assignment)
      return res.status(404).json(buildResponse(false, "Assignment not found"));

    const alreadyAdded = assignment.lecturers.some(
      (l) => l.user.toString() === userId
    );
    if (alreadyAdded)
      return res.status(400).json(buildResponse(false, "Lecturer already added"));

    assignment.lecturers.push({ user: userId });
    await assignment.save();

    res.json(buildResponse(true, "Lecturer added successfully", assignment));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

// =========================================================
// 📊 ANALYTICS & REPORTS
// =========================================================

export const courseStatistics = async (req, res) => {
  try {
    const totalCourses = await Course.countDocuments();
    const totalAssignments = await CourseAssignment.countDocuments();
    const totalRegistrations = await CourseRegistration.countDocuments();
    const activeCourses = await Course.countDocuments({ status: "Active" });

    const data = {
      totalCourses,
      activeCourses,
      totalAssignments,
      totalRegistrations,
    };

    res.json(buildResponse(true, "Course statistics fetched", data));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

// =========================================================
// 🧩 ADVANCED SEARCH / FILTERING
// =========================================================

export const searchCourseByCodeOrTitle = async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword)
      return res.status(400).json(buildResponse(false, "Keyword required"));

    const courses = await Course.find({
      $or: [
        { courseCode: { $regex: keyword, $options: "i" } },
        { title: { $regex: keyword, $options: "i" } },
      ],
    }).populate("department faculty");

    res.json(buildResponse(true, "Courses fetched", courses));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

// =========================================================
// 🧾 MASS REGISTRATION / BULK IMPORT (for Admin)
// =========================================================

export const bulkRegisterCourses = async (req, res) => {
  try {
    const { students, courses, semester, session, level } = req.body;

    const results = [];
    for (const student of students) {
      const exists = await CourseRegistration.findOne({ student, semester, session });
      if (exists) {
        results.push({ student, message: "Already registered" });
        continue;
      }

      const totalUnits = await calculateTotalUnits(courses);
      const newReg = new CourseRegistration({
        student,
        courses,
        semester,
        session,
        level,
        totalUnits,
      });

      await newReg.save();
      results.push({ student, message: "Registered successfully" });
    }

    res.json(buildResponse(true, "Bulk registration processed", results));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};


export const getStudentsForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const user = req.user;

    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }

    // 1️⃣ Check if the course exists
    const course = await Course.findById(courseId).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 2️⃣ Role Based Department Restriction
    let allowedDepartment = null;

    if (user.role === "admin") {
      // Admin can see all
      allowedDepartment = null;
    } else if (user.role === "hod") {
      const dept = await Department.findOne({ hod: user._id }).lean();
      if (!dept) return res.status(404).json({ message: "HOD department not found" });
      allowedDepartment = dept._id;
    } else {
      // Students can only view their own dept's course (if allowed)
      allowedDepartment = user.departmentId;
    }

    // If course belongs to another department
    if (allowedDepartment && String(course.department) !== String(allowedDepartment)) {
      return res.status(403).json({ message: "Not allowed to view students for this course" });
    }

    // 3️⃣ Prepare payload for fetchDataHelper
    const payload = {
      ...req.query,
      filter: {
        course: courseId,
        ...req.query.filter,
      },
      // Add department filter if applicable
      ...(allowedDepartment && {
        additionalFilters: {
          // courses
        }
      })
    };

    const options = {
      populate: [
        {
          path: "semester",
          select: "name session",
        },
        {
          path: "student",  // This populates the User document
          select: "name email",
          populate: {
            path: "_id",  // User._id references the Student document
            select: "matricNumber level gender departmentId",
            model: "Student",
          }
        },
        
      ],

      // Sort configuration
      sort: { createdAt: -1 },

      // Pagination
      enablePagination: false,
      limit: 1000,

      // Return type
      returnType: 'object',
      additionalFilters: {
          courses : courseId
        }
,
      // UPDATED ConfigMap for your actual structure
      configMap: {
        // Basic user info from the populated student (which is actually User)
        name: async (doc) => doc.student?.name || "",

        email: async (doc) => doc.student?.email || "",

        // Student-specific info comes from student._id (populated Student document)
        gender: async (doc) => doc.student?._id?.gender || "",

        matric_no: async (doc) => doc.student?._id?.matricNumber || "",

        level: async (doc) => doc.student?._id?.level || "",

        semesterName: async (doc) => doc.semester?.name || "",

        session: async (doc) => doc.semester?.session || "",

        registrationLevel: async (doc) => doc.level || "",

        // Department - note the different path
        department: async (doc, model) => {
          // Department is in the Student document, not User
          // console.log("Doc student:", doc.student);
          if (doc.student?._id?.departmentId) {
            const dept = await mongoose.model('Department').findById(doc.student._id.departmentId).lean();
            return dept?.name || "n";
          }
          return "s";
        }
      }
    };

    // 5️⃣ Use fetchDataHelper correctly
    const result = await fetchDataHelper(req, res, CourseRegistration, options);

    // 6️⃣ Handle response
    if (!result.data || result.data.length === 0) {
      return res.status(200).json({
        message: "No student has registered for this course yet",
        data: [],
        courseInfo: {
          courseId,
          courseName: course.name,
          courseCode: course.code,
        },
      });
    }

    // 7️⃣ Return structured response
    return res.status(200).json({
      message: "Students retrieved successfully",
      count: result.data.length,
      courseInfo: {
        courseId,
        courseName: course.name,
        courseCode: course.code,
        department: course.department,
      },
      data: result.data,
      metadata: {
        timestamp: new Date().toISOString(),
        requestedBy: {
          userId: user._id,
          role: user.role,
        },
        filtersApplied: {
          courseId,
          departmentFilter: allowedDepartment ? "applied" : "none",
        },
      },
    });

  } catch (error) {
    console.error("❌ getStudentsForCourse Error:", error);
    return res.status(500).json({
      message: "Failed to retrieve students",
      error: error.message,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }
};
export const getRegisterableCourses = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const studentDepartment = await studentModel.findById(studentId).lean()

    const semester = await Semester.findOne({ department: String(studentDepartment.departmentId), isActive: true }).lean()
    // console.log(studentId, semesterId, studentDepartment._id)
    if (!studentId || !semester) {
      return buildResponse.error(res, "studentId and semesterId are required")
    }

    // Fetch student details
    const student = await studentModel.findById(studentId);
    if (!student) {
      return buildResponse.error(res, "Student not found")
    }

    // Fetch semester details
    // const semester = await Semester.findById(semesterId).lean();
    if (!semester) {
      return buildResponse.error(res, "Semester not found")
    }
    console.log(semester.name)
    const fetchConfig = {
      configMap: dataMaps.Course,
      autoPopulate: false,
      autoPopulate: true,
      models: { departmentModel },
      custom_fields: {
        borrowedIdSemester: { path: 'borrowedId.semester' },
        borrowedIdLevel: { path: 'borrowedId.level' }
      },
      populate: ["department", "borrowedId"],
      limit: 100,
      // Make borrowedId.level trigger the pipeline
      // custom_fields: { 'borrowedId.level': "borrowedId" }, // Map the nested field
      additionalFilters: {
        department: student.departmentId,

        $and: [
          {
            $or: [
              { semester: semester.name },
              { "borrowedId.semester": semester.name }
            ]
          },
          {
            $or: [
              { level: parseInt(student.level) },
              { "borrowedId.level": parseInt(student.level) }
            ]
          }
        ]
      }


    };


    const result = await fetchDataHelper(req, res, Course, fetchConfig);
  } catch (err) {
    console.log(err)
    return buildResponse.error(res, err.message)
  }
}

// =========================================================
// 🧹 CLEANUP & SAFETY UTILITIES
// =========================================================

export const cleanupInactiveCourses = async (req, res) => {
  try {
    const result = await Course.deleteMany({ status: "Inactive" });
    res.json(buildResponse(true, `${result.deletedCount} inactive courses removed`));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};
