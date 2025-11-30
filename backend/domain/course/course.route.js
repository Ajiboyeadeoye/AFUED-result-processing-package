import { Router } from "express";
import buildResponse from "../../utils/responseBuilder.js";

import {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  assignCourse,
  getLecturerCourses,
  getRegisterableCourses,
} from "./course.controller.js";

import authenticate from "../../middlewares/authenticate.js";

const router = Router();

/**
 * 📚 Get lecturer's courses
 */
router.get("/lecturer", authenticate(['hod', 'admin', "lecturer"]), getLecturerCourses);

/* 
  *Get available courses for student registration
  */
router.get("/available", authenticate(['student']), getRegisterableCourses);
/**
 * 📚 Get all courses (HOD/Admin only)
 */
router.get("/", authenticate(["hod", "admin"]), getAllCourses);

/**
 * 🔍 Get a single course by ID (authenticated users)
 */
router.get("/:id", authenticate(["student"]), getCourseById);

/**
 * 🧱 Create a new course (HOD/Admin only)
 */
router.post("/", authenticate(["hod", "admin"]), createCourse);

/**
 * 👨‍🏫 Assign course to lecturer (HOD/Admin only)
 */
router.post("/:id/assign", authenticate(["hod", "admin"]),  assignCourse);

/**
 * ✏️ Update a course (HOD/Admin only)
 */
router.patch("/:id", authenticate(["hod", "admin"]),  updateCourse);

/**
 * 🗑️ Delete a course (HOD/Admin only)
 */
router.delete("/:id", authenticate(["hod", "admin"]), deleteCourse);

export default router;