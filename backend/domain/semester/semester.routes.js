import express from "express";
import {
  startNewSemester,
  toggleRegistration,
  toggleResultPublication,
  getActiveSemester,
  deactivateSemester,
  getSemestersByDepartment,
  getStudentSemesterSettings,
  updateLevelSettings,
} from "./semester.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// Start a new semester
router.post("/start", authenticate(["admin"]), startNewSemester);

// Get semester by department

router.get("/all/:departmentId", authenticate(["admin", 'hod', "dean"]), getSemestersByDepartment);

// Get student semester settings
router.get("/student/settings", authenticate("student"), getStudentSemesterSettings);
// Open/close course registration
router.patch("/registration", authenticate("admin"), toggleRegistration);

// Open/close result publication
router.patch("/results", authenticate("admin"), toggleResultPublication);

// Get current semester info
router.get("/active", authenticate(["admin", "hod", "dean", "student"]), getActiveSemester);
router.patch("/deactivate", deactivateSemester);

// An hod route for updating semester settings

router.patch("/settings", authenticate(["hod", "admin"]), updateLevelSettings)

// Toggle registration
router.patch("/toggle-registration", authenticate("hod", "admin"), toggleRegistration);


export default router;
