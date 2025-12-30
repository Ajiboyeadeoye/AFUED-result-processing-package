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
  getCourseRegistrationReport,
  unassignCourse
} from "./course.controller.js";

import authenticate from "../../middlewares/authenticate.js";
import fetchDataHelper from "../../utils/fetchDataHelper.js";
import Result from "../result/result.model.js";
import { paymentGuard } from "../../middlewares/paymentGuard.js";

const router = Router();

// Get course registration Statistics
router.get("/stats", authenticate(["hod", "admin"]), getCourseRegistrationReport)

/** 📚 Get lecturer's courses */
router.get("/lecturer", authenticate(['hod', 'admin', "lecturer"]), getLecturerCourses);

// Get students that registered for a course in the current semester or previous if the previous semester id is provided
router.get("/:courseId/students", authenticate(['hod', 'admin', "lecturer", "student"]), getStudentsForCourse);

/** 
 * Register courses - Payment required for students
 * HODs and admins can bypass payment for administrative purposes
 */
router.post(
  "/register",
  authenticate(["hod", "admin", "student"]),
  (req, res, next) => {
    // Check if user is a student
    if (req.user.role === "student") {
      // Apply payment guard for students
      return paymentGuard({
        purpose: "COURSE_REGISTRATION",
        requireSession: true,
        requireSemester: true
      })(req, res, next);
    }
    // Allow HODs and admins without payment check
    next();
  },
  registerCourses
);

/** 
 * Get available courses for student registration - Payment check
 * Only students need to have paid to view registerable courses
 */
router.get(
  "/available",
  authenticate(['student']),
  paymentGuard({
    purpose: "COURSE_REGISTRATION",
    requireSession: true,
    requireSemester: true
  }),
  getRegisterableCourses
);

// HOD can view borrowed courses without payment check
router.get("/borrowed", authenticate(["hod"]), getBorrowedCoursesFromMyDept);

/** 
 * Get registered courses (Student + HOD)
 * Students need to have paid to view their registrations in current semester
 * HODs can view without payment check
 */
router.get(
  "/check-registration",
  authenticate(['student', 'hod']),
  (req, res, next) => {
    // Check if user is a student
    if (req.user.role === "student") {
      // Apply payment guard for students in current semester
      return paymentGuard({
        purpose: "COURSE_REGISTRATION",
        requireSession: true,
        requireSemester: true
      })(req, res, next);
    }
    // Allow HODs without payment check
    next();
  },
  getStudentRegistrations
);

// HOD can view any student's registration without payment check
router.get(
  "/check-registration/:studentId",
  authenticate(['hod']),
  getStudentRegistrations
);

// Student can view their own registration if they've paid
router.get(
  "/check-registration/:studentId",
  authenticate(['student']),
  (req, res, next) => {
    // Check if student is trying to access their own registration
    if (req.user._id.toString() === req.params.studentId) {
      return paymentGuard({
        purpose: "COURSE_REGISTRATION",
        requireSession: true,
        requireSemester: true
      })(req, res, next);
    }
    // Students cannot view other students' registrations
    return buildResponse.error(res, "Unauthorized to view other students' registrations", 403);
  },
  getStudentRegistrations
);

/** 📚 Get all courses - No payment required (admin/HOD view) */
router.get("/", authenticate(["hod", "admin"]), getAllCourses);

/** 🔍 Get a single course by ID - No payment required for viewing course details */
router.get("/:courseId", authenticate(["student", "admin", "lecturer", "hod"]), getCourseById);

/** 🧱 Create a new course - Admin/HOD only */
router.post("/", authenticate(["hod", "admin"]), createCourse);

/** 👨‍🏫 Assign course to lecturer - Admin/HOD only */
router.post("/:id/assign", authenticate(["hod", "admin"]), assignCourse);
router.post("/:id/unassign", authenticate(["hod", "admin"]), unassignCourse);

/** 
 * Get course results - Payment required for students to view results
 * HODs, admins, and lecturers can view without payment
 */
router.get(
  "/:courseId/results",
  authenticate(["student", "hod", "admin", "lecturer"]),
  async (req, res, next) => {
    // Check if user is a student
    if (req.user.role === "student") {
      // Students need to have paid for exam registration to view results
      return paymentGuard({
        purpose: "EXAM_REGISTRATION",
        requireSession: true,
        requireSemester: true
      })(req, res, next);
    }
    // Allow HODs, admins, and lecturers without payment check
    next();
  },
  async (req, res) => {
    return fetchDataHelper(req, res, Result, {
      additionalFilters: { courseId: req.params.courseId },
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

/** ✏️ Update a course - Admin/HOD only */
router.patch("/:id", authenticate(["hod", "admin"]), updateCourse);

/** 🗑️ Delete a course - Admin/HOD only */
router.delete("/:id", authenticate(["hod", "admin"]), deleteCourse);

/** 
 * Additional payment-related routes for course registration
 */

// Check if student has paid for course registration (for frontend)
router.get(
  "/payment/status",
  authenticate(["student"]),
  async (req, res, next) => {
    try {
      const studentId = req.user._id;
      const session = req.currentSession;
      const semester = req.currentSemester;
      
      // This would call PaymentService.hasPaid internally
      // For now, we'll just return a placeholder
      return buildResponse.success(
        res,
        "Payment status check endpoint",
        { hasPaid: false, purpose: "COURSE_REGISTRATION" }
      );
    } catch (error) {
      return buildResponse.error(res, error.message, 400);
    }
  }
);

export default router;