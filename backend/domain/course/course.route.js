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
  registerCourses,
  getStudentRegistrations,
} from "./course.controller.js";

import authenticate from "../../middlewares/authenticate.js";

const router = Router();

/** 📚 Get lecturer's courses */
router.get("/lecturer", authenticate(['hod', 'admin', "lecturer"]), getLecturerCourses);

/** Register courses */
router.post("/register", authenticate(["hod", "admin", "student"]), registerCourses);

/** Get available courses for student registration */
router.get("/available", authenticate(['student']), getRegisterableCourses);

/** ✅ Get registered courses (Student + HOD) */
router.get(
  "/check-registration",
  authenticate(['student', 'hod']),
  getStudentRegistrations
);
router.get(
  "/check-registration/:studentId",
  authenticate(['student', 'hod']),
  getStudentRegistrations
);


/** 📚 Get all courses */
router.get("/", authenticate(["hod", "admin"]), getAllCourses);

/** 🔍 Get a single course by ID */
router.get("/:id", authenticate(["student"]), getCourseById);

/** 🧱 Create a new course */
router.post("/", authenticate(["hod", "admin"]), createCourse);

/** 👨‍🏫 Assign course to lecturer */
router.post("/:id/assign", authenticate(["hod", "admin"]), assignCourse);

/** ✏️ Update a course */
router.patch("/:id", authenticate(["hod", "admin"]), updateCourse);

/** 🗑️ Delete a course */
router.delete("/:id", authenticate(["hod", "admin"]), deleteCourse); 

export default router;
