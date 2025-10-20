import express from "express";
import {
  uploadResult,
  getAllResults,
  getResultById,
  updateResult,
  approveResult,
  lockResult,
  deleteResult,
} from "./result.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// 🧾 Lecturer routes
router.post("/", authenticate("lecturer"), uploadResult);
router.patch("/:id", authenticate(["lecturer", "hod"]), updateResult);

// 🧠 HOD routes
router.patch("/:id/approve", authenticate("hod"), approveResult);
router.patch("/:id/lock", authenticate(["hod", "admin"]), lockResult);

// 🧩 Admin routes
router.get("/", authenticate(["admin", "hod"]), getAllResults);
router.get("/:id", authenticate(["admin", "hod", "lecturer"]), getResultById);
router.delete("/:id", authenticate("admin"), deleteResult);

export default router;
