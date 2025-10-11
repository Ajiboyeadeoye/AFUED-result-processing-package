import express from "express";
// import authenticate from "../../middlewares/authenticate";
import { getSettings, resetSettings, updateSettings } from "./settings.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();
// const { getSettings, updateSettings, resetSettings } = require("../controllers/settingsController");
// const { verifySuperuser } = require("../middleware/authMiddleware");

// Public — view current university settings
router.get("/", getSettings);

// Superuser — update or reset
router.patch("/", authenticate('admin'), updateSettings);
router.post("/reset", authenticate('admin'), resetSettings);

export default router;
