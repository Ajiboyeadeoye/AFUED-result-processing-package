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
  calculateStudentCGPAr
} from "./computation.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// Main computation endpoints
router.post("/compute-all", authenticate("admin"), computeAllResults);
router.get("/status/:masterComputationId", getComputationStatus);
router.post("/cancel/:masterComputationId", cancelComputation);
router.post("/retry/:masterComputationId", retryFailedDepartments);
router.get("/history", getComputationHistory);

// GPA Calculation endpoints
router.get("/gpa/student/:studentId/semester/:semesterId", calculateSemesterGPA);
router.get("/cgpa/student/:studentId", calculateStudentCGPAr);

// Carryover management endpoints
router.get("/carryovers/department/:departmentId/semester/:semesterId", getDepartmentCarryoverStats);
router.get("/carryovers/student/:studentId", getStudentCarryovers);
router.patch("/carryovers/:carryoverId/clear", clearCarryover);

export default router;