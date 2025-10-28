import express from "express";
import {
  registerApplicant,
  loginApplicant,
  getMyApplication,
  updateApplicant,
  setCutOffMark,
} from "./applicant.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// 🔓 Public routes
router.post("/register", registerApplicant);
router.post("/login", loginApplicant);

// 🧍 Applicant self-service routes
router.get("/me", authenticate("applicant"), getMyApplication);
router.put("/me", authenticate("applicant"), updateApplicant);

// 🧩 Admin routes
router.post("/cutoff", authenticate("admin"), setCutOffMark);

export default router;
