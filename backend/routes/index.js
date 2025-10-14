import express from "express";
const router = express.Router();

import userRoutes from "../domain/user/index.js";
import studentRoutes from "../domain/student/index.js";
import semesterRoutes from "../domain/semester/index.js";
import settingsRoutes from "../domain/settings/index.js"; // from HEAD
import courseRoutes from "../domain/course/index.js"; // from backend-ajiboye
import departmentRoutes from "../domain/department/index.js"; // from backend-ajiboye
import facultyRoutes from "../domain/faculty/facultyroutes.js"; // from backend-ajiboye

router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use("/semester", semesterRoutes);
router.use("/settings", settingsRoutes); // keep settings as you wanted
router.use("/course", courseRoutes); // merged
router.use("/department", departmentRoutes); // merged
router.use("/faculty", facultyRoutes); // merged

export default router;
