import { Router } from "express";
import buildResponse from "../../utils/responseBuilder.js";

import {
  // validateCourse,
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  assignCourse,
} from "./course.controller.js";

import authenticate from "../../middlewares/authenticate.js";

const router = Router();

/**
 * 📚 Get all courses (accessible by all authenticated users)
 */
router.get("/", authenticate(["hod", "admin"]), getAllCourses);

/**
 * 🔍 Get a single course by ID (authenticated users)
 */
router.get("/:id", authenticate(), getCourseById);

/**
 * 🧱 Create a new course (HOD-only)
 */
router.post("/", authenticate(["hod", "admin"]), createCourse);

/**
 * 🧱 Create a new course (HOD-only)
 */
router.post("/assign", authenticate(["hod", "admin"]), assignCourse);


/**
 * ✏️ Update a course (HOD-only)
 */
router.patch("/:id", authenticate(["hod", "admin"]), updateCourse);

/**
 * 🗑️ Delete a course (HOD-only)
 */
router.delete("/:id", authenticate(["hod", "admin"]), deleteCourse);

export default router;
