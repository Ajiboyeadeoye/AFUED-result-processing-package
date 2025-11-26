import express from "express";
import {
  createFaculty,
  getAllFaculties,
  getFacultyById,
  updateFaculty,
  deleteFaculty,
  assignDean,
  removeDean,
  getMyFaculty
} from "./faculty.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

router.post(
  "/",
  authenticate('admin'),
  createFaculty
);

router.get("/", authenticate('admin'), getAllFaculties);

router.get("/my-faculty", authenticate(['dean']), getMyFaculty);
router.get("/:facultyId", authenticate(['admin', 'dean']), getFacultyById);


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

/**
 * 👩‍🏫 Assign HOD to department
 */ 
router.patch(
  "/:facultyId/assign-dean",
  authenticate("admin"),
  assignDean
);

/**
 * 🧾 Remove HOD from department
 */
router.patch(
  "/:facultyId/remove-dean",
  authenticate(["admin"]),
  removeDean
);

export default router;
