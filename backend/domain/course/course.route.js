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
  getLecturerCourses,
} from "./course.controller.js";

import authenticate from "../../middlewares/authenticate.js";

const router = Router();

router.get("/lecturer", authenticate(['hod', 'admin', "lecturer"]), getLecturerCourses);
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
 * 🧱 Assign a course to a lecturer for a session  (HOD/ADMIN-only)
 */
router.post("/:id/assign", authenticate(["hod", "admin"]), assignCourse);


/**
 * ✏️ Update a course (HOD-only)
 */
router.patch("/:id", authenticate(["hod", "admin"]), updateCourse);

/**
 * 🗑️ Delete a course (HOD-only)
 */
router.delete("/:id", authenticate(["hod", "admin"]), deleteCourse);


export default router;
