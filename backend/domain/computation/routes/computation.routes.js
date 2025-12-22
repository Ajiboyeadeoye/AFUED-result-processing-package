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
} from "../workers/computation.controller.js";
import authenticate from "../../../middlewares/authenticate.js";
import { getHodComputationDetails, getHodComputationHistory, getHodComputationSemesters, getHodComputationSummary } from "../services/helpers.js";

import ComputationSummary from "../../result/computation.model.js";
import MasterSheetHtmlRenderer from "../services/master-sheet/MasterSheetHtmlRenderer.js";
import Semester from "../../semester/semester.model.js";
import departmentModel from "../../department/department.model.js";

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

router.get("/summary/:summaryId/:level", async (req, res) => {
  try {
    const { summaryId, level } = req.params;

    const summary = await ComputationSummary
      .findById(summaryId)
      .populate("department", "name")
      .populate("semester", "name")
      .lean();

    if (!summary || !summary.masterSheetDataByLevel) {
      return res.status(404).send("Master sheet data not found");
    }

    const html = MasterSheetHtmlRenderer.render({
       summary,
      level,
      masterComputationId: summaryId || 'n/a'
    });

    res.setHeader("Content-Type", "text/html");
    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error rendering master sheet");
  }
});



// GET all computations with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      purpose,
      semesterId,
      departmentId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (purpose) query.purpose = purpose;
    if (semesterId) query.semester = semesterId;
    if (departmentId) query.department = departmentId;
    
    if (search) {
      query.$or = [
        { 'department.name': { $regex: search, $options: 'i' } },
        { 'semester.name': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Fetch computations with pagination
    const computations = await ComputationSummary.find(query)
      .populate('department', 'name code')
      .populate('semester', 'name academicYear sessionOrder')
      .populate('computedBy', 'name email')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get total count
    const total = await ComputationSummary.countDocuments(query);
    
    // Get filter options
    const departments = await departmentModel.find()
      .select('name code')
      .sort('name')
      .lean();
      
    const semesters = await Semester.find()
      .select('name academicYear')
      .sort('-academicYear name')
      .lean();
    
    res.json({
      success: true,
      data: {
        computations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        filters: {
          departments,
          semesters,
          statuses: ['completed', 'processing', 'failed', 'pending'],
          purposes: ['final', 'preview']
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching computations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch computations'
    });
  }
});






export default router;