import express from "express";
import {
  createLecturer,
  getAllLecturers,
  getLecturerById,
  updateLecturer,
  deleteLecturer,
  assignHOD,
  removeHOD,
  getAllDeans,
  getAllHODs,
} from "./lecturer.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// 🧩 ADMIN ROUTES
router.post("/", authenticate(["admin", "hod", "dean"]), createLecturer);
router.get("/", authenticate(["admin", "hod", "dean"]), getAllLecturers);
router.get("/hods", authenticate(["admin", "dean"]), getAllHODs);
router.get("/deans", authenticate(["admin"]), getAllDeans);
router.patch("/:id", authenticate(["admin", "hod"]), updateLecturer);

router.get("/:id", authenticate(["admin", "hod"]), getLecturerById);
router.put("/:id", authenticate("admin"), updateLecturer);
router.delete("/:id", authenticate("admin"), deleteLecturer);

// // 🧩 HOD ASSIGNMENT ROUTES (Admin / Faculty Officer)
// router.patch("/:departmentId/assign-hod/:lecturerId", authenticate("admin"), assignHOD);
// router.patch("/:departmentId/remove-hod/:lecturerId", authenticate("admin"), removeHOD);

export default router;
