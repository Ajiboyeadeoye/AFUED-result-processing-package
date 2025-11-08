import express from "express";
import {
  createLecturer,
  getAllLecturers,
  getLecturerById,
  updateLecturer,
  deleteLecturer,
  assignHOD,
  removeHOD,
} from "./lecturer.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// 🧩 ADMIN ROUTES
router.post("/", authenticate(["admin", "hod"]), createLecturer);
router.get("/", authenticate(["admin", "hod"]), getAllLecturers);
router.get("/:id", authenticate(["admin", "hod"]), getLecturerById);
router.put("/:id", authenticate("admin"), updateLecturer);
router.delete("/:id", authenticate("admin"), deleteLecturer);

// 🧩 HOD ASSIGNMENT ROUTES (Admin / Faculty Officer)
router.patch("/:departmentId/assign-hod/:lecturerId", authenticate("admin"), assignHOD);
router.patch("/:departmentId/remove-hod/:lecturerId", authenticate("admin"), removeHOD);

export default router;
