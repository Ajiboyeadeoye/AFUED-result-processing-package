import express from "express";
import { getSettings, updateSettings, resetSettings } from "../controllers/settingsController.js";
import { verifySuperuser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public — view current university settings
router.get("/", getSettings);

// Superuser — update or reset settings
router.patch("/", verifySuperuser, updateSettings);
router.post("/reset", verifySuperuser, resetSettings);

export default router;
