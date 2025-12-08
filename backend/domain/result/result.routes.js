import express from "express";
import {
  uploadResult,
  bulkUploadResults,
  getAllResults,
  getResultById,
  updateResult,
  approveResult,
  lockResult,
  getResultAnalytics,
  deleteResult,
} from "./result.controller.js";

import authenticate from "../../middlewares/authenticate.js";
import { fileHandler } from "../../middlewares/fileHandler.js";
import { auditLogger } from "../../middlewares/auditLogger.js";

const router = express.Router();

/**
 * =====================================
 * 🧑‍🏫 Lecturer / HOD / Admin Routes
 * =====================================
 */

// Upload single result  → POST /results/upload
router.post(
  "/upload/:courseId",
  authenticate(["lecturer", "hod", "admin"]),
  auditLogger("Uploaded a single student result"),
  uploadResult
);

// Bulk upload results → POST /results/bulk
router.post(
  "/bulk",
  authenticate(["lecturer", "hod", "admin"]),
  auditLogger("Performed bulk upload of student results"),
  fileHandler("excel"),
  bulkUploadResults
);

// Update existing result → PATCH /results/edit/:id
router.patch(
  "/edit/:id",
  authenticate(["lecturer", "hod"]),
  auditLogger("Updated a student result"),
  updateResult
);

/**
 * =====================================
 * 🧠 HOD / Admin Routes
 * =====================================
 */

// Approve a result → PATCH /results/:id/approve
router.patch(
  "/:id/approve",
  authenticate("hod"),
  auditLogger("Approved a student result"),
  approveResult
);

// Lock a result → PATCH /results/:id/lock
router.patch(
  "/:id/lock",
  authenticate(["hod", "admin"]),
  auditLogger("Locked a student result"),
  lockResult
);

// Paginated all results → GET /results/all
router.get(
  "/all",
  authenticate(["admin", "hod"]),
  auditLogger("Fetched all results (paginated)"),
  getAllResults
);

// Analytics summary → GET /results/analytics
router.get(
  "/analytics",
  authenticate(["admin", "hod"]),
  auditLogger("Fetched results analytics summary"),
  getResultAnalytics
);

/**
 * =====================================
 * 📊 Shared Routes (All Staff)
 * =====================================
 */



// Get single result → GET /results/:id
router.get(
  "/:id",
  authenticate(["admin", "hod", "lecturer"]),
  auditLogger("Viewed a single student result"),
  getResultById
);

// Delete a result (Admin only) → DELETE /results/:id
router.delete(
  "/:id",
  authenticate("admin"),
  auditLogger("Deleted a result record"),
  deleteResult
);

export default router;
