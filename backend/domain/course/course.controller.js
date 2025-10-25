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
    console.log("Request STATUS:", res.status);
    const { courseCode, title, unit, level, semester, type, department, faculty } = req.body;

    // Validate department
    const deptExists = await Department.findById(department);
    if (!deptExists)
      return res.status(404).json(buildResponse.error(res, "Department not found"));

    // Prevent duplicate
    const exists = await Course.findOne({ courseCode });
    if (exists)
      return res
        .status(400)
        .json(buildResponse.error(res, "Course with this code already exists"));

    const newCourse = new Course({
      courseCode,
      title,
      unit,
      level,
      semester,
      type,
      department,
      faculty,
      createdBy: req.user?._id || null,
    });

    await newCourse.save();
    res
      .status(201)
      .json(buildResponse.success(res, "Course created successfully", newCourse));
  } catch (err) {
      console.log("Request STATUS:", err);
  res.status(404).json(buildResponse(res, 404, "Course creation failed", null, true));

}

};

export const getAllCourses = async (req, res) => {
  try {
    const { department, faculty, semester, level, status, search } = req.query;
    const filter = {};

    if (department) filter.department = department;
    if (faculty) filter.faculty = faculty;
    if (semester) filter.semester = semester;
    if (level) filter.level = level;
    if (status) filter.status = status;

    if (search) {
      filter.$or = [
        { courseCode: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
      ];
    }

    const courses = await Course.find(filter)
      .populate("department faculty createdBy")
      .sort({ level: 1, courseCode: 1 });

    res.json(buildResponse(true, "Courses fetched successfully", courses));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const course = await Course.findById(id);
    if (!course)
      return res.status(404).json(buildResponse(false, "Course not found"));

    Object.assign(course, updates);
    await course.save();

    res.json(buildResponse(true, "Course updated successfully", course));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findByIdAndDelete(id);
    if (!course)
      return res.status(404).json(buildResponse(false, "Course not found"));
    res.json(buildResponse(true, "Course deleted successfully"));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};

// =========================================================
// 🎓 COURSE ASSIGNMENT HANDLING
// =========================================================

export const assignCourse = async (req, res) => {
  try {
    const { course, lecturers, semester, session, department } = req.body;

    const existing = await CourseAssignment.findOne({
      course,
      semester,
      session,
      department,
    });
    if (existing)
      return res
        .status(400)
        .json(buildResponse(false, "Course already assigned for this session"));

    const newAssign = new CourseAssignment({
      course,
      lecturers,
      semester,
      session,
      department,
      assignedBy: req.user?._id,
    });

    await newAssign.save();
    res.status(201).json(buildResponse(true, "Course assigned successfully", newAssign));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
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
    const lecturerId = req.user?._id;
    const assignments = await CourseAssignment.find({ "lecturers.user": lecturerId })
      .populate("course semester department")
      .sort({ createdAt: -1 });

    res.json(buildResponse(true, "Lecturer courses fetched", assignments));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
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
