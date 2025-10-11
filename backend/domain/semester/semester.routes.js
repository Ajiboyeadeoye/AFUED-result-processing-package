const express = require("express");
const router = express.Router();
const {
  startNewSemester,
  toggleRegistration,
  toggleResultPublication,
  getActiveSemester,
} = require("./semester.controller");
const authenticate = require("../../middlewares/authenticate");

// Start a new semester
router.post("/start", authenticate("admin"), startNewSemester);

// Open/close course registration
router.patch("/registration", authenticate('admin'), toggleRegistration);

// Open/close result publication
router.patch("/results", authenticate('admin'), toggleResultPublication);

// Get current semester info
router.get("/active", getActiveSemester);

module.exports = router;
1