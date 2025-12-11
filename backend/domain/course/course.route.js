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
  getStudentsForCourse,
  getBorrowedCoursesFromMyDept,
} from "./course.controller.js";

import authenticate from "../../middlewares/authenticate.js";
import fetchDataHelper from "../../utils/fetchDataHelper.js";
import Result from "../result/result.model.js";

const router = Router();

/** 📚 Get lecturer's courses */
router.get("/lecturer", authenticate(['hod', 'admin', "lecturer"]), getLecturerCourses);

// Get students that registered for a course in the current semester or previous if the previous semester id is provided

router.get("/:courseId/students", authenticate(['hod', 'admin', "lecturer", "student"]), getStudentsForCourse);

/** Register courses */
router.post("/register", authenticate(["hod", "admin", "student"]), registerCourses);

/** Get available courses for student registration */
router.get("/available", authenticate(['student']), getRegisterableCourses);
router.get("/borrowed", authenticate(["hod"]), getBorrowedCoursesFromMyDept);


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
router.get("/:courseId", authenticate(["student", "admin", "lecturer", "hod"]), getCourseById);

/** 🧱 Create a new course */
router.post("/", authenticate(["hod", "admin"]), createCourse);

/** 👨‍🏫 Assign course to lecturer */
router.post("/:id/assign", authenticate(["hod", "admin"]), assignCourse);
router.get(
  "/:courseId/results",
  async (req, res) => {
    return fetchDataHelper(req, res, Result, {
      filters: { courseId: req.params.courseId },
      enablePagination: true,
      sort: { createdAt: -1 },
      configMap: {
        _id: "this.id",
        student_id: "this.studentId._id",
        matric_no: "this.studentId.matricNumber",
        course_id: "this.courseId._id",
        score: "this.score",
        grade: "this.grade",
        remark: "this.remark",

      },
      populate: [
       "studentId", "courseId"
      ]
    });
  }
);

/** ✏️ Update a course */
router.patch("/:id", authenticate(["hod", "admin"]), updateCourse);

/** 🗑️ Delete a course */
router.delete("/:id", authenticate(["hod", "admin"]), deleteCourse); 

export default router;
