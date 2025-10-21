import express from "express";
import { assignHOD, removeHOD } from "./department.controller.js";


import {
  // assignHOD,
  // removeHOD,
  createDepartment,
  getDepartmentsByFaculty,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  assignLecturerToDepartment,
  removeLecturerFromDepartment,
} from "./department.controller.js";

import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

/**
 * 🧩 Admin or Faculty Officer creates a department under a faculty
 */
router.post(
  "/:facultyId/departments",
  authorizeRoles("admin"),
  createDepartment
);

// Get all departments in a faculty
router.get(
  "/",
  authenticate("admin"),
  getDepartmentsByFaculty
);

/**
 * 🔍 Get a single department by ID
 */
router.get("/:departmentId", authenticate(), getDepartmentById);

/**
 * ✏️ Update a department (Admin only)
 */
router.patch(
  "/:departmentId",
  authenticateUser,
  authorizeRoles("admin"),
  updateDepartment
);

/**
 * 🗑️ Delete a department (soft delete preferred — Admin only)
 */
router.delete(
  "/:departmentId",
  authenticateUser,
  authorizeRoles("admin"),
  deleteDepartment
);

/**
 * 👩‍🏫 Assign HOD to department
 */
router.patch(
  "/:departmentId/assign-hod",
  authenticateUser,
  authorizeRoles("Admin", "FacultyOfficer"),
  assignHOD
);

/**
 * 🧾 Remove HOD from department
 */
router.patch(
  "/:departmentId/remove-hod",
  authenticate(["admin", "superuser", "facultyofficer"]),
  removeHOD
);

/**
 * 👨‍🏫 Assign lecturer to department
 */
router.patch(
  "/:departmentId/assign-lecturer",
  authenticate(["admin", "superuser", "facultyofficer", "hod"]),
  assignLecturerToDepartment
);

/**
 * 🚫 Remove lecturer from department
 */
router.patch(
  "/remove-lecturer",
  authenticate(["admin", "superuser", "facultyofficer", "hod"]),
  removeLecturerFromDepartment
);

export default router;
