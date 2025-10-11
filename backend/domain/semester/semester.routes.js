import express from "express";
import {
  startNewSemester,
  toggleRegistration,
  toggleResultPublication,
  getActiveSemester,
} from "./semester.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// Start a new semester
router.post("/start", authenticate("admin"), startNewSemester);

// Open/close course registration
router.patch("/registration", authenticate("admin"), toggleRegistration);

// Open/close result publication
router.patch("/results", authenticate("admin"), toggleResultPublication);

// Get current semester info
router.get("/active", getActiveSemester);

export default router;
