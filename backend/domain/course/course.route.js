import { Router } from "express";
import buildResponse from "../../utils/responseBuilder.js"; 


import {
  validateCourse,
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
} from "./course.controller.js";
import authenticate from "../../middlewares/authenticate.js";
import authorizeRoles from "../../middlewares/authorizeRoles.js";

const router = Router();

router.get("/",
  authenticate,
  authorizeRoles("student", "admin", "lecturer"),
  async (req, res) => {
    try {
      const courses = await getAllCourses();

      if (!courses || courses.length === 0) {
        return res.status(200).json(buildResponse.success("No courses available", { count: 0, courses: [] }));
      }

      return res.status(200).json(buildResponse.success("Courses fetched successfully", { count: courses.length, courses }));
    } catch (err) {
      return res.status(500).json(buildResponse.error("Failed to fetch courses", 500));
    }
  }
);

    
router.get("/:id", authenticate, authorizeRoles("student", "admin", "lecturer"), async (req, res) => {
  try {
    const course = await getCourseById(req.params.id);
    return res.status(200).json(buildResponse.success("Course fetched successfully", course ));
  } catch (err) {
    return res.status(500).json(buildResponse.error("Failed to fetch the course", 500));
  }
});

// Hod-only
router.post("/", authenticate, authorizeRoles("hod"), async (req, res) => {
  try {
    const { error } = validateCourse(req.body);
    if (error)
      return res.status(400).json(buildResponse.error("Course Validation failed", 400));

    const result = await createCourse({ ...req.body, createdBy: req.user?._id });
    return res.status(201).json(buildResponse.success("Course created successfully", result ));
  } catch (err) {
    return res.status(404).json(buildResponse.error("Generic cause", 500));
  }
});


router.patch("/:id", authenticate, authorizeRoles("hod"), async (req, res) => {
  try {
    const updated = await updateCourse(req.params.id, req.body);
    return res.status(200).json(buildResponse.success("Course updated", updated ));
  } catch (err) {
    return res.status(409).json(buildResponse.error("Request conflict", 409));
  }
});

router.delete("/:id", authenticate, authorizeRoles("hod"), async (req, res, next) => {
  try {
    await deleteCourse(req.params.id);
    return res.status(200).json(buildResponse.success("Course deleted"));
  } catch (err) {
    return res.status(409).json(buildResponse.error("Request failed", 404));
  }
});

export default router;
