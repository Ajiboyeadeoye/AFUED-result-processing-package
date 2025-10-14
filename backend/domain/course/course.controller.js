 
import Course from "./course.model.js";
import Joi from "joi";

export const validateCourse = (data) => {
  const schema = Joi.object({
    courseCode: Joi.string().required(),
    title: Joi.string().required(),
    unit: Joi.number().required(),
    level: Joi.number().required(),
    semester: Joi.string().valid("First", "Second").required(),
    department: Joi.string().optional(),
  });
  return schema.validate(data, { abortEarly: false });
};

export const createCourse = async (data) => {
  const existing = await Course.findOne({
    courseCode: data.courseCode.toUpperCase().trim(),
  });

  if (existing) {
    const error = new Error("Course with this code already exists");
    error.statusCode = 409;
    throw error;
  }

  data.courseCode = data.courseCode.toUpperCase().trim();
  return await Course.create(data);
};


export const getAllCourses = async (filter = {}) => {
  return await Course.find(filter).sort({ courseCode: 1 });// took care off
};


export const getCourseById = async (id) => {
  const course = await Course.findById(id);
  if (!course) {
    const error = new Error("Course not found");
    error.statusCode = 404;
    throw error;
  }
  return course; // took care off
};


export const updateCourse = async (id, updates) => {
  const updated = await Course.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!updated) {
    const error = new Error("Course not found");
    error.statusCode = 404;
    throw error;
  }
  return updated;
};


export const deleteCourse = async (id) => {
  const deleted = await Course.findByIdAndDelete(id);
  if (!deleted) {
    const error = new Error("Course not found");
    error.statusCode = 404;
    throw error;
  }
  return deleted;
};