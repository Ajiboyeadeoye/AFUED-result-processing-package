import express from "express";
import {
  computeAllResults,
  getComputationStatus,
  cancelComputation,
  retryFailedDepartments,
  getDepartmentCarryoverStats,
  getStudentCarryovers,
  clearCarryover,
  getComputationHistory,
  calculateSemesterGPA,
  // calculateStudentCGPA,
  // calculateStudentCGPAr
} from "../computation/workers/computation.controller.js";
import authenticate from "../../middlewares/authenticate.js";
import { getHodComputationDetails, getHodComputationHistory, getHodComputationSemesters, getHodComputationSummary } from "../computation/services/helpers.js";
// import { computeAllResults } from "../computation/workers/computation.controller.js";

const router = express.Router();

// Main computation endpoints
// HOD-specific routes
// HOD-specific endpoints
router.get(
  "/hod/summary",
  authenticate(["hod", "admin"]),
  getHodComputationSummary
);

router.get(
  "/hod/history",
  authenticate(["hod", "admin"]),
  getHodComputationHistory
);

router.get(
  "/hod/summary/:summaryId",
  authenticate(["hod", "admin"]),
  getHodComputationDetails
);

router.get(
  "/hod/semesters",
  authenticate(["hod", "admin"]),
  getHodComputationSemesters
);

// Computation management endpoints
router.post("/compute-all", authenticate("admin"), computeAllResults);
router.get("/status/:masterComputationId", getComputationStatus);
router.post("/cancel/:masterComputationId", cancelComputation);
router.post("/retry/:masterComputationId", retryFailedDepartments);
router.get("/history", getComputationHistory);

// GPA / CGPA endpoints
router.get(
  "/gpa/student/:studentId/semester/:semesterId",
  calculateSemesterGPA
);
// router.get("/cgpa/student/:studentId", calculateStudentCGPA);

// Carryover management endpoints
router.get(
  "/carryovers/department/:departmentId/semester/:semesterId",
  getDepartmentCarryoverStats
);
router.get("/carryovers/student/:studentId", getStudentCarryovers);
router.patch("/carryovers/:carryoverId/clear", clearCarryover);


export default router;