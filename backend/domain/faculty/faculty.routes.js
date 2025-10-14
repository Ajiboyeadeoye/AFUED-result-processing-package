import express from "express";
import {
  createFaculty,
  getAllFaculties,
  getFacultyById,
  updateFaculty,
  deleteFaculty
} from "./faculty.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

router.post(
  "/",
  authenticate('admin'),
  createFaculty
);

router.get("/", authenticate('admin'), getAllFaculties);

router.get("/:facultyId", authenticate('admin'), getFacultyById);

router.patch(
  "/:facultyId",
  authenticate('admin'),
  updateFaculty
);

router.delete(
  "/:facultyId",
  authenticate('admin'),
  deleteFaculty
);

export default router;
