import express from "express";
import { assignHOD, getAllDepartment, getDepartmentStats, removeHOD } from "./department.controller.js";


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
  "/",
  authenticate(["admin", "dean"]),
  createDepartment
);

// Get all departments in a faculty
router.get(
  "/",
  authenticate(["admin", "dean"]),
  getAllDepartment
);

router.get(
  "/stats",
  authenticate(["admin", "dean"]),
  getDepartmentStats
);

/**
 * 🔍 Get a single department by ID
 */
router.get("/:departmentId", authenticate(["admin", "dean"]), getDepartmentById);

/**
 * ✏️ Update a department (Admin only)
 */
router.patch(
  "/:departmentId",
  authenticate("admin"),
  updateDepartment
);

/**
 * 🗑️ Delete a department (soft delete preferred — Admin only)
 */
router.delete(
  "/:departmentId",
  authenticate("admin"),
  deleteDepartment 
);

/**
 * 👩‍🏫 Assign HOD to department
 */ 
router.patch(
  "/:departmentId/assign-hod",
  authenticate(["admin", "dean"]),
  assignHOD
);

/**
 * 🧾 Remove HOD from department
 */
router.patch(
  "/:departmentId/remove-hod",
  authenticate(["admin", "dean"]),
  removeHOD
);

// /**
//  * 👨‍🏫 Assign lecturer to department
//  */
// router.patch(
//   "/:departmentId/assign-lecturer",
//   authenticate(["admin", "dean", "hod"]),
//   assignLecturerToDepartment
// );

// /**
//  * 🚫 Remove lecturer from department
//  */
// router.patch(
//   "/remove-lecturer",
//   authenticate(["admin", "dean", "hod"]),
//   removeLecturerFromDepartment
// );

export default router;
