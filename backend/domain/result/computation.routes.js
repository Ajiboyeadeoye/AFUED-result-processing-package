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
  calculateStudentCGPA
} from "../controllers/computation.controller.js";

const router = express.Router();

// Main computation endpoints
router.post("/compute-all", computeAllResults);
router.get("/status/:masterComputationId", getComputationStatus);
router.post("/cancel/:masterComputationId", cancelComputation);
router.post("/retry/:masterComputationId", retryFailedDepartments);
router.get("/history", getComputationHistory);

// GPA Calculation endpoints
router.get("/gpa/student/:studentId/semester/:semesterId", calculateSemesterGPA);
router.get("/cgpa/student/:studentId", calculateStudentCGPA);

// Carryover management endpoints
router.get("/carryovers/department/:departmentId/semester/:semesterId", getDepartmentCarryoverStats);
router.get("/carryovers/student/:studentId", getStudentCarryovers);
router.patch("/carryovers/:carryoverId/clear", clearCarryover);

export default router;