const express = require("express");
const router = express.Router();
const { getSettings, updateSettings, resetSettings } = require("../controllers/settingsController");
const { verifySuperuser } = require("../middleware/authMiddleware");

// Public — view current university settings
router.get("/", getSettings);

// Superuser — update or reset
router.patch("/", verifySuperuser, updateSettings);
router.post("/reset", verifySuperuser, resetSettings);

module.exports = router;
