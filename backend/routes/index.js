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
import lecturerRoutes from "../domain/lecturer/index.js"; // new addition
import applicantRoutes from "../domain/applicant/index.js"; // new addition
import paymentRoutes from "../domain/payment/index.js"; // new addition
import notificationRoutes from "../domain/notification/index.js"; // new addition
import adminRoutes from "../domain/admin/index.js"
import announcementRoutes from "../domain/announcement/index.js";
import computationRoutes from "../domain/computation/routes/computation.routes.js";
import systemMonitorRoutes from "../domain/system/systemMonitor.js"
import authRoutes from "../domain/auth/index.js"




router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use("/semester", semesterRoutes);
router.use("/settings", settingsRoutes); // keep settings as you wanted
router.use("/course", courseRoutes); // merged
router.use("/department", departmentRoutes); // merged
router.use("/faculty", facultyRoutes); // merged
router.use("/students", studentRoutes); // from backend-ajiboye
router.use("/results", resultRoutes); // merged
router.use("/lecturers", lecturerRoutes); // new addition
router.use("/applicants", applicantRoutes); // new addition
router.use("/payments", paymentRoutes); // new addition
router.use("/notifications", notificationRoutes); // new addition
router.use("/admin", adminRoutes)
router.use("/announcements", announcementRoutes);
router.use("/computation", computationRoutes)
router.use('/system', systemMonitorRoutes);
router.use('/auth', authRoutes);


export default router;
