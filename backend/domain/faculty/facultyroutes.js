import express from "express";
import {
  createFaculty,
  getAllFaculties,
  getFacultyById,
  updateFaculty,
  deleteFaculty
} from "./faculty.controller.js";
import authenticateUser from "../../middlewares/auth.js";
import authorizeRoles from "../../middlewares/authorizeRoles.js";

const router = express.Router();

router.post(
  "/",
  authenticateUser,
  authorizeRoles("admin"),
  createFaculty
);

router.get("/", authenticateUser, getAllFaculties);

router.get("/:facultyId", authenticateUser, getFacultyById);

router.patch(
  "/:facultyId",
  authenticateUser,
  authorizeRoles("admin"),
  updateFaculty
);

router.delete(
  "/:facultyId",
  authenticateUser,
  authorizeRoles("admin"),
  deleteFaculty
);

export default router;
