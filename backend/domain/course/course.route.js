import { Router } from "express";
import buildResponse from "../../utils/responseBuilder.js";

import {
  // validateCourse,
  createCourse,
  getAllCourses,
  // getCourseById,
  updateCourse,
  deleteCourse,
} from "./course.controller.js";

import authenticate from "../../middlewares/authenticate.js";

const router = Router();

/**
 * 📚 Get all courses (accessible by all authenticated users)
 */
router.get("/", authenticate(), async (req, res) => {
  try {
    const courses = await getAllCourses();

    if (!courses || courses.length === 0) {
      return res
        .status(200)
        .json(buildResponse(res, 200, "No courses available", { count: 0, courses: [] }));
    }

    return res
      .status(200)
      .json(buildResponse(res, 200, "Courses fetched successfully", { count: courses.length, courses }));
  } catch (err) {
    console.error("❌ Error fetching courses:", err);
    return res
      .status(500)
      .json(buildResponse(res, 500, "Failed to fetch courses", null, true, err));
  }
});

/**
 * 🔍 Get a single course by ID (authenticated users)
 */
router.get("/:id", authenticate(), async (req, res) => {
  try {
    const course = await getCourseById(req.params.id);
    if (!course) {
      return res.status(404).json(buildResponse(res, 404, "Course not found"));
    }

    return res
      .status(200)
      .json(buildResponse(res, 200, "Course fetched successfully", course));
  } catch (err) {
    console.error("❌ Error fetching course:", err);
    return res
      .status(500)
      .json(buildResponse(res, 500, "Failed to fetch course", null, true, err));
  }
});

/**
 * 🧱 Create a new course (HOD-only)
 */
router.post("/", authenticate(["hod", "admin"]), createCourse);


/**
 * ✏️ Update a course (HOD-only)
 */
router.patch("/:id", authenticate("hod"), async (req, res) => {
  try {
    const updated = await updateCourse(req.params.id, req.body);
    if (!updated)
      return res.status(404).json(buildResponse(res, 404, "Course not found"));

    return res
      .status(200)
      .json(buildResponse(res, 200, "Course updated successfully", updated));
  } catch (err) {
    console.error("❌ Error updating course:", err);
    return res
      .status(500)
      .json(buildResponse(res, 500, "Failed to update course", null, true, err));
  }
});

/**
 * 🗑️ Delete a course (HOD-only)
 */
router.delete("/:id", authenticate("hod"), async (req, res) => {
  try {
    const deleted = await deleteCourse(req.params.id);
    if (!deleted)
      return res.status(404).json(buildResponse(res, 404, "Course not found"));

    return res
      .status(200)
      .json(buildResponse(res, 200, "Course deleted successfully"));
  } catch (err) {
    console.error("❌ Error deleting course:", err);
    return res
      .status(500)
      .json(buildResponse(res, 500, "Failed to delete course", null, true, err));
  }
});

export default router;
