import express from "express";
const router = express.Router();

import userRoutes from "../domain/user/index.js";
import studentRoutes from "../domain/student/index.js";
import semesterRoutes from "../domain/semester/index.js";
import courseRoutes from "../domain/course/index.js";



router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use("/semester", semesterRoutes);
router.use("/course", courseRoutes);

export default router;
