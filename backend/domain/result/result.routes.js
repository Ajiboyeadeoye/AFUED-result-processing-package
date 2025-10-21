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
import { fileHandler } from "../../middlewares/filehandler.js";
import { auditLogger } from "../../middlewares/auditLogger.js";

const router = express.Router();

/**
 * =====================================
 * 🧑‍🏫 Lecturer / HOD / Admin Routes
 * =====================================
 */

// Upload single result
router.post(
  "/",
  authenticate(["lecturer", "hod", "admin"]),
  auditLogger("Uploaded a single student result"),
  uploadResult
);

// Bulk upload results (Excel/CSV)
router.post(
  "/bulk-upload",
  authenticate(["lecturer", "hod", "admin"]),
  auditLogger("Performed bulk result upload"),
  fileHandler("excel"),
  bulkUploadResults
);

// Update result (HOD/Lecturer)
router.patch(
  "/:id",
  authenticate(["lecturer", "hod"]),
  auditLogger("Updated a student result"),
  updateResult
);

/**
 * =====================================
 * 🧠 HOD / Admin Routes
 * =====================================
 */

// Approve result
router.patch(
  "/:id/approve",
  authenticate("hod"),
  auditLogger("Approved a result"),
  approveResult
);

// Lock result (no further edits)
router.patch(
  "/:id/lock",
  authenticate(["hod", "admin"]),
  auditLogger("Locked a result"),
  lockResult
);

// View all results (paginated)
router.get(
  "/",
  authenticate(["admin", "hod"]),
  auditLogger("Fetched all results"),
  getAllResults
);

// View analytics summary
router.get(
  "/analytics",
  authenticate(["admin", "hod"]),
  auditLogger("Fetched result analytics summary"),
  getResultAnalytics
);

/**
 * =====================================
 * 📊 Shared / General Routes
 * =====================================
 */

// Get single result (for Admin, HOD, or Lecturer)
router.get(
  "/:id",
  authenticate(["admin", "hod", "lecturer"]),
  auditLogger("Viewed a single result record"),
  getResultById
);

// Delete result (Admin only)
router.delete(
  "/:id",
  authenticate("admin"),
  auditLogger("Deleted a result record"),
  deleteResult
);

export default router;
