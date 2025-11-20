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
    additionalFilters: { department: department._id },
  }),
  custom_feilds: { borrowed: "borrowedId" },
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
      populate: ["department"],

    });

    return res
      .status(200)
      .json(buildResponse(res, 200, "Course fetched successfully", result));
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
    const { course, staffId: lecturers, department: frontendDept } = req.body;

    // 🧠 Get current semester
    const currentSemester = await Semester.findOne({ isActive: true });
    if (!currentSemester) {
      return buildResponse(res, 404, "No active semester found", null, true);
    }

    const { _id: semester, session } = currentSemester;

    // 🧩 Fetch course data
    const courseData = await Course.findById(course);
    if (!courseData) {
      return buildResponse(res, 404, "Course not found", null, true);
    }

    let departmentId = frontendDept; // DEFAULT → the department making assignment

    // 🧩 If this is a normal course, override department with owning dept
    if (!courseData.borrowedId) {
      departmentId = courseData.department;
    }

    // 🧱 If HOD, restrict to their department
    if (req.user?.role === "hod") {
      const department = await departmentModel.findOne({ hod: req.user?._id });

      if (!department) {
        return buildResponse(res, 404, "Department not found for HOD", null, true);
      }

      // HOD must be allowed only inside their own department
      if (department._id.toString() !== departmentId.toString()) {
        return buildResponse(
          res,
          403,
          "You cannot assign a course outside your department",
          null,
          true
        );
      }

      departmentId = department._id; // force to their actual dept
    }

    // 🔁 Prevent duplicate assignment per dept + semester + session
    const existing = await CourseAssignment.findOne({
      course,
      semester,
      session,
      department: departmentId,
    });

    if (existing) {
      return buildResponse(res, 400, "Course already assigned for this session", null, true);
    }

    // 🪄 Create new assignment
    const newAssign = new CourseAssignment({
      course,
      lecturer: lecturers,
      semester,
      session,
      department: departmentId,
      assignedBy: req.user?._id,
    });

    await newAssign.save();

    return buildResponse(res, 201, "Course assigned successfully", newAssign);

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
    const { student, courses, semester, session, level } = req.body;

    const exists = await CourseRegistration.findOne({ student, semester, session });
    if (exists)
      return res
        .status(400)
        .json(buildResponse(false, "Already registered for this semester"));

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
    res.status(201).json(buildResponse(true, "Courses registered successfully", newReg));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

export const getStudentRegistrations = async (req, res) => {
  try {
    const { student, session, semester } = req.query;
    const filter = {};
    if (student) filter.student = student;
    if (session) filter.session = session;
    if (semester) filter.semester = semester;

    const registrations = await CourseRegistration.find(filter)
      .populate("student courses semester approvedBy")
      .sort({ createdAt: -1 });

    res.json(buildResponse(true, "Registrations fetched", registrations));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
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
      // additionalFilters: { _id: req.user?._id },
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
