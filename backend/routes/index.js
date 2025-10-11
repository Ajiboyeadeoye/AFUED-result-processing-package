import express from "express";
const router = express.Router();

import userRoutes from "../domain/user/index.js"; // Ensure .js extension
import studentRoutes from "../domain/student/index.js";
import semesterRoutes from "../domain/semester/index.js";
import settingsRoutes from "../domain/settings/index.js"

router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use("/semester", semesterRoutes);
router.use("/settings", settingsRoutes);


export default router;
