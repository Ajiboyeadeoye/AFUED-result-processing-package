import express from "express";
const router = express.Router();

import userRoutes from "../domain/user/index.js";
import studentRoutes from "../domain/student/index.js";
import semesterRoutes from "../domain/semester/index.js";
import courseRoutes from "../domain/course/index.js";
import departmentRoutes from "../domain/department/index.js";
import facultyRoutes from "../domain/faculty/facultyroutes.js";



router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use("/semester", semesterRoutes);
router.use("/course", courseRoutes);
router.use("/department", departmentRoutes);
router.use("/faculty", facultyRoutes);

export default router;
