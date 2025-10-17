import express from "express";
import {
  assignHOD,
  removeHOD,
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
  authenticate(["admin", "superuser", "hod"]),
  createDepartment
);

/**
 * 📚 Get all departments under a faculty
 */
router.get("/:facultyId/departments", authenticate(), getDepartmentsByFaculty);

/**
 * 🔍 Get a single department by ID
 */
router.get("/:departmentId", authenticate(), getDepartmentById);

/**
 * ✏️ Update a department (Admin only)
 */
router.patch(
  "/:departmentId",
  authenticate(["admin", "superuser"]),
  updateDepartment
);

/**
 * 🗑️ Delete a department (soft delete preferred — Admin only)
 */
router.delete(
  "/:departmentId",
  authenticate(["admin", "superuser"]),
  deleteDepartment
);

/**
 * 👩‍🏫 Assign HOD to department
 */
router.patch(
  "/:departmentId/assign-hod",
  authenticate(["admin", "superuser", "facultyofficer"]),
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
