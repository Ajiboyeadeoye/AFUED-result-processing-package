import express from "express";
const router = express.Router();

import userRoutes from "../domain/user/index.js";
import studentRoutes from "../domain/student/index.js";
import semesterRoutes from "../domain/semester/index.js";
<<<<<<< HEAD
import settingsRoutes from "../domain/settings/index.js"
=======
import courseRoutes from "../domain/course/index.js";


>>>>>>> backend-ajiboye

router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use("/semester", semesterRoutes);
<<<<<<< HEAD
router.use("/settings", settingsRoutes);

=======
router.use("/course", courseRoutes);
>>>>>>> backend-ajiboye

export default router;
