import express from "express";
import { assignHOD, removeHOD } from "./department.controller.js";


import {
  createDepartment,
  getDepartmentsByFaculty,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  assignLecturerToDepartment,
  removeLecturerFromDepartment
} from "./department.controller.js";
import authenticateUser from "../../middlewares/authenticate.js";
import authorizeRoles from "../../middlewares/authorizeRoles.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// Create department under a faculty
router.post(
  "/:facultyId/departments",
  authenticateUser,
  authorizeRoles("admin"),
  createDepartment
);

// Get all departments in a faculty
router.get(
  "/",
  authenticate("admin"),
  getDepartmentsByFaculty
);

// Single department routes
router.get("/:departmentId", authenticateUser, getDepartmentById);

router.patch(
  "/:departmentId",
  authenticateUser,
  authorizeRoles("admin"),
  updateDepartment
);

router.delete(
  "/:departmentId",
  authenticateUser,
  authorizeRoles("admin"),
  deleteDepartment
);


// ✅ Assign HOD
router.patch(
  "/:departmentId/assign-hod",
  authenticateUser,
  authorizeRoles("Admin", "FacultyOfficer"),
  assignHOD
);

// ✅ Remove HOD
router.patch(
  "/:departmentId/remove-hod",
  authenticateUser,
  authorizeRoles("Admin", "FacultyOfficer"),
  removeHOD
);



// ✅ Assign lecturer to department
router.patch(
  "/:departmentId/assign-lecturer",
  authenticateUser,
  authorizeRoles("Admin", "FacultyOfficer"),
  assignLecturerToDepartment
);

// ✅ Remove lecturer from department
router.patch(
  "/remove-lecturer",
  authenticateUser,
  authorizeRoles("Admin", "FacultyOfficer"),
  removeLecturerFromDepartment
);


export default router;
