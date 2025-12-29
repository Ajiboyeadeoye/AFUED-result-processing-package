import express from "express";
import {
  getAllStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  getMyProfile,
  registerCourses,
  getMyCourses,
  viewResults,
  printTranscript,
  getStudentSemesterResult,
} from "./student.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// 🧩 ADMIN ROUTES
router.get("/", authenticate(["admin", "hod", "dean"]), getAllStudents);
router.post("/", authenticate(["admin", "hod", "dean"]), createStudent);
router.get("/profile", authenticate("student"), getMyProfile);
router.get("/result/:semesterId", authenticate(["student", "admin", "lecturer"]), getStudentSemesterResult);

router.get("/:id", authenticate("admin"), getStudentById);
router.put("/:id", authenticate("admin"), updateStudent);
router.delete("/:id", authenticate("admin"), deleteStudent);

// 🧩 STUDENT SELF-SERVICE ROUTES
router.get("/me", authenticate("student"), getMyProfile);
router.post("/register-courses", authenticate("student"), registerCourses);
router.get("/my-courses", authenticate("student"), getMyCourses);
router.get("/results", authenticate("student"), viewResults);
router.get("/transcript", authenticate("student"), printTranscript);

export default router;
