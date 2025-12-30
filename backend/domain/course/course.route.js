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
import {
  requireSchoolFeesForCourses,
  checkCourseEligibility,
  getPaymentSummary
} from '../../middlewares/paymentRestriction.js';

const router = Router();

// Get course registration Statistics
router.get("/stats", authenticate(["hod", "admin"]), getCourseRegistrationReport)

/** 📚 Get lecturer's courses */
router.get("/lecturer", authenticate(['hod', 'admin', "lecturer"]), getLecturerCourses);

// Get students that registered for a course in the current semester or previous if the previous semester id is provided
router.get("/:courseId/students", authenticate(['hod', 'admin', "lecturer"]), getStudentsForCourse);

/** Register courses - WITH PAYMENT RESTRICTION */
router.post(
  "/register",
  authenticate(["student"]), // Only students should register courses
  requireSchoolFeesForCourses(), // NEW: Payment restriction middleware
  checkCourseEligibility, // NEW: Course eligibility check
  registerCourses
);

/** Get available courses for student registration - WITH PAYMENT SUMMARY */
router.get(
  "/available",
  authenticate(['student']),
  getPaymentSummary, // NEW: Attach payment summary to request
  getRegisterableCourses
);

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
router.post("/:id/unassign", authenticate(["hod", "admin"]), unassignCourse);

router.get(
  "/:courseId/results",
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

/** ✏️ Update a course */
router.patch("/:id", authenticate(["hod", "admin"]), updateCourse);

/** 🗑️ Delete a course */
router.delete("/:id", authenticate(["hod", "admin"]), deleteCourse);

/** NEW ROUTES FOR PAYMENT-RELATED FUNCTIONALITY */

// Check if student is eligible to register for specific courses
router.post(
  "/check-eligibility",
  authenticate(['student']),
  async (req, res) => {
    try {
      const { courseIds = [] } = req.body;
      
      if (!Array.isArray(courseIds) || courseIds.length === 0) {
        return buildResponse.error(res, "Please provide course IDs to check", 400);
      }

      // Import dynamically to avoid circular dependencies
      const { checkCourseEligibility } = await import('../../domain/payment/payment.controller.js');
      
      // Forward the request to payment controller
      return checkCourseEligibility(req, res);
    } catch (error) {
      console.error('Check eligibility route error:', error);
      return buildResponse.error(res, 'Failed to check eligibility', 500, error);
    }
  }
);

// Get student's payment status for course registration
router.get(
  "/payment-status",
  authenticate(['student']),
  async (req, res) => {
    try {
      // Import dynamically to avoid circular dependencies
      const { getStudentPaymentSummary } = await import('../../domain/payment/payment.controller.js');
      
      // Forward the request to payment controller
      return getStudentPaymentSummary(req, res);
    } catch (error) {
      console.error('Payment status route error:', error);
      return buildResponse.error(res, 'Failed to get payment status', 500, error);
    }
  }
);

export default router;