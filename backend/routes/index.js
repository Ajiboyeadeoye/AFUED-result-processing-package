import express from "express";
const router = express.Router();

import userRoutes from "../domain/user/index.js";
import semesterRoutes from "../domain/semester/index.js";
import settingsRoutes from "../domain/settings/index.js"; // from HEAD
import courseRoutes from "../domain/course/index.js"; // from backend-ajiboye
import departmentRoutes from "../domain/department/index.js"; // from backend-ajiboye
import facultyRoutes from "../domain/faculty/faculty.routes.js"; // from backend-ajiboye
import studentRoutes from "../domain/student/student.routes.js";
import resultRoutes from "../domain/result/index.js"; // merged






router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use("/semester", semesterRoutes);
router.use("/settings", settingsRoutes); // keep settings as you wanted
router.use("/course", courseRoutes); // merged
router.use("/department", departmentRoutes); // merged
router.use("/faculty", facultyRoutes); // merged
router.use("/students", studentRoutes); // from backend-ajiboye
router.use("/results", resultRoutes); // merged



export default router;
