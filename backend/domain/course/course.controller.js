// =========================================================
// 🧠 COURSE CONTROLLER FOR A NIGERIAN UNIVERSITY SYSTEM
// Handles: Course CRUD, Assignment, Registration, Approvals,
// Departmental Operations, Lecturer Management, and Analytics
// =========================================================

import Course from "./course.model.js";
import CourseAssignment from "./courseAssignment.model.js";
import CourseRegistration from "./courseRegistration.model.js";
import Department from "../department/department.model.js";
import Faculty from "../faculty/faculty.model.js";
import Semester from "../semester/semester.model.js";
import User from "../user/user.model.js";

import mongoose from "mongoose";
import buildResponse from "../../utils/responseBuilder.js";
import { dataMaps } from "../../config/dataMap.js";
import departmentModel from "../department/department.model.js";
import fetchDataHelper from "../../utils/fetchDataHelper.js";
import courseAssignmentModel from "./courseAssignment.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import courseModel from "./course.model.js";
import studentModel from "../student/student.model.js";
import carryOverSchema from "../result/carryover.model.js";
import CarryoverCourse from "../result/carryover.model.js";
import departmentService from "../department/department.service.js";

import { CourseRestrictionService } from "../payment/courseRestriction.service.js";
// =========================================================
// 🧩 Utility Functions
// =========================================================
// const buildResponse = (success, message, data = null) => ({
//   success,
//   message,
//   data,
// });

const calculateTotalUnits = async (courseIds = []) => {
  const courses = await Course.find({ _id: { $in: courseIds } }).lean();
  return courses.reduce((sum, course) => sum + (course.unit || 0), 0);
};

// =========================================================
// 🧱 COURSE CRUD OPERATIONS
// =========================================================

export const createCourse = async (req, res) => {
  try {
    let { courseCode, title, unit, level, semester, type, department_id: department, faculty, description, borrowedId, fields, search_term, filters, page, extras } = req.body;

    // 🔍 If this is a list/filter request, handle early
    if (fields || search_term || filters || page) {
      return getAllCourses(req, res)
    }


    // 🛡 HOD restriction: can only create in their department
    if (req.user?.role === "hod") {
      const hodDept = await departmentService.getDepartmentByHod(req.user._id)
      if (!hodDept) return buildResponse(res, 404, "Department not found for HOD", null, true);
      department = hodDept._id;
    }

    // Validate department
    const deptExists = await Department.findById(department);
    if (!deptExists) return buildResponse.error(res, "Department not found");

    // Handle borrowed course
    if (borrowedId) {
      // Check original course exists
      const original = await Course.findById(borrowedId);
      if (!original) return buildResponse.error(res, "Original course not found");

      type = "borrowed"; // force type
      courseCode = null;
      title = null;
      unit = null;
      level = null;
      semester = null;
      faculty = null;
      description = null;
    } else {
      // Only validate original courses
      if (!courseCode || !title || !unit || !level || !semester) {
        return buildResponse.error(res, "All fields are required for original courses");
      }

      // Normal course: prevent duplicates by code
      const exists = await Course.findOne({ courseCode });
      if (exists) return buildResponse.error(res, "Course with this code already exists");
    }

    // Create course
    let newCourse = new Course({
      courseCode,
      title,
      unit,
      level,
      semester,
      type,
      department,
      faculty,
      description,
      borrowedId: borrowedId || null,
      createdBy: req.user?._id || null,
    });

    await newCourse.save();

    // Populate for response
    await getCourseById({ params: { courseId: newCourse._id } }, res);

    // return buildResponse.success(res, "Course created successfully", newCourse);

  } catch (err) {
    console.log("Request STATUS:", err);
    return buildResponse(res, 404, "Course creation failed", null, true);
  }
};

export const getAllCourses = async (req, res) => {
  try {
    const isHod = req.user?.role === "hod";
    let department = null;

    if (isHod) {
      department = await departmentService.getDepartmentByHod(req.user._id)
      if (!department) {
        return buildResponse(res, 404, "Department not found for HOD", null, true);
      }
    }

    // 🧠 Build filters incrementally
    const additionalFilters = {};

    if (isHod && !req.params.courseId) {
      additionalFilters.department = department._id;
    }

    if (req.params.courseId) {
      additionalFilters._id = req.params.courseId;
    }

    const fetchConfig = {
      configMap: dataMaps.Course,
      autoPopulate: true,
      models: { departmentModel },
      populate: ["department", "borrowedId"],

      ...(Object.keys(additionalFilters).length && {
        additionalFilters
      }),

      custom_fields: {
        courseCode: {
          path: "borrowedId.courseCode",
          find: "borrowedId.courseCode",
          fallback: "courseCode",
        },
        courseTitle: {
          path: "borrowedId.title",
          find: "borrowedId.title",
          fallback: "title",
        },
        departmentName: {
          path: "department.name",
          find: "department.name",
        },
      },
    };
    const result = await fetchDataHelper(req, res, Course, fetchConfig);
    return result;
  } catch (error) {
    console.error(error);
    return buildResponse(res, 500, "Failed to fetch courses", null, true, error);
  }
};

export const getBorrowedCoursesFromMyDept = async (req, res) => {
  try {
    // 🧠 Ensure user is HOD
    if (req.user?.role !== "hod") {
      return buildResponse(res, 403, "Only HOD can access this endpoint", null, true);
    }

    // 🔹 Get HOD's department
    const hodDept = await departmentService.getDepartmentByHod(req.user._id)
    if (!hodDept) {
      return buildResponse(res, 404, "Department not found for HOD", null, true);
    }

    // 🔹 Fetch all courses borrowed from this department
    const fetchConfig = {
      configMap: dataMaps.Course,
      autoPopulate: true,
      models: { departmentModel },
      populate: ["department", "borrowedId"],
      additionalFilters: {
        borrowedId: { $exists: true }, // must be a borrowed course
        "borrowedId.department": hodDept._id // original course belongs to HOD's department
      },
      custom_fields: {
        courseCode: {
          path: 'borrowedId.courseCode',
          find: 'borrowedId.courseCode',
          fallback: 'courseCode'
        },
        courseTitle: {
          path: 'borrowedId.title',
          find: 'borrowedId.title',
          fallback: 'title'
        },
        borrowingDepartment: {
          path: 'department.name', // department that is borrowing
          find: 'department.name'
        }
      }
    };

    const result = await fetchDataHelper(req, res, Course, fetchConfig);

    return buildResponse(res, 200, "Borrowed courses fetched successfully", result);

  } catch (error) {
    console.error(error);
    return buildResponse(res, 500, "Failed to fetch borrowed courses", null, true, error);
  }
};


export const getCourseById = async (req, res) => {
  try {
    const fetchConfig = {
      configMap: dataMaps.Course,
      autoPopulate: true,
      models: { departmentModel },

      // ✅ Explicit populate, same pattern you already use elsewhere
      populate: ["department", "borrowedId"],

      // ✅ Filter strictly by courseId
      additionalFilters: {
        _id: req.params.courseId,
      },

      // ✅ Custom fields resolved by fetchDataHelper
      // custom_fields: {
      //   courseCode: {
      //     path: "borrowedId.courseCode",
      //     find: "borrowedId.courseCode",
      //     fallback: "courseCode",
      //   },
      //   courseTitle: {
      //     path: "borrowedId.title",
      //     find: "borrowedId.title",
      //     fallback: "title",
      //   },
      //   departmentName: {
      //     path: "department.name",
      //     find: "department.name",
      //   },
      // },
    };

    await fetchDataHelper(req, res, Course, fetchConfig);

    // Optional: if you ever want single-object response
    // return res.status(200).json(buildResponse(res, 200, "Course fetched", result?.[0] || null));

  } catch (err) {
    console.error("Error fetching course:", err);
    return res
      .status(500)
      .json(buildResponse(res, 500, "Failed to fetch course", null, true, err));
  }
};



export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(id)
    const updates = req.body;

    const course = await Course.findById(id);
    if (!course)
      return res.status(404).json(buildResponse(res, 404, "Course not found"));

    Object.assign(course, updates);
    await course.save();

    res.json(buildResponse(res, 200, "Course updated successfully", course));
  } catch (err) {
    res.status(500).json(buildResponse(res, 500, err.message));
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findByIdAndDelete(id);
    if (!course)
      return res.status(404).json(buildResponse(res, 404, "Course not found"));
    res.json(buildResponse(res, 200, "Course deleted successfully"));
  } catch (err) {
    res.status(500).json(buildResponse(res, 500, err.message));
  }
};

// =========================================================
// 🎓 COURSE ASSIGNMENT HANDLING
// =========================================================

export const assignCourse = async (req, res) => {
  let session = null;
  try {
    // Start a transaction session
    session = await mongoose.startSession();
    session.startTransaction();

    // selectedCourseId is the course document user clicked (borrowed-copy or normal course)
    // assignToAll: optional parameter (default: true) - if true, assign to all related courses
    const { course: selectedCourseId, staffId: lecturer, assignToAll = true } = req.body;

    // Fetch the selected course (borrowed or normal) within transaction
    const courseData = await Course.findById(selectedCourseId).session(session);
    if (!courseData) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Course not found", null, true);
    }

    // Determine the original course ID
    const originalCourseId = courseData.borrowedId || selectedCourseId;
    const isBorrowed = !!courseData.borrowedId;

    // Get original course (for HOD check and finding borrowed copies)
    const originalCourse = await Course.findById(originalCourseId).session(session);
    if (!originalCourse) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Original course not found", null, true);
    }

    // HOD permission check: only HOD of original department can assign
    if (req.user?.role === "hod") {
      const hodDept = await departmentModel.findOne({ hod: req.user._id }).session(session);
      if (!hodDept) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 404, "Department not found for HOD", null, true);
      }

      if (originalCourse.department.toString() !== hodDept._id.toString()) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(
          res,
          403,
          "Only the HOD of the original department can assign lecturers to this course",
          null,
          true
        );
      }
    }

    // Determine which courses to assign
    let coursesToAssign = [];

    if (assignToAll) {
      // Find all related courses (original + all borrowed copies)
      coursesToAssign = await Course.find({
        $or: [
          { _id: originalCourseId }, // The original course
          { borrowedId: originalCourseId } // All borrowed copies
        ]
      }).session(session);
    } else {
      // Assign only to the selected course
      coursesToAssign = [courseData];
    }

    if (coursesToAssign.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "No courses found to assign", null, true);
    }

    // Collect all assignments to create
    const assignmentsToCreate = [];

    // Process each course to assign
    for (const courseToAssign of coursesToAssign) {
      const assignmentDeptId = courseToAssign.department;
      if (!assignmentDeptId) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 400, `Department not found for course ${courseToAssign.courseCode}`, null, true);
      }

      // Fetch active semester for each department
      const currentSemester = await Semester.findOne({
        department: assignmentDeptId,
        isActive: true,
      }).session(session);

      if (!currentSemester) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(
          res,
          404,
          `No active semester for department of ${courseToAssign.courseCode}`,
          null,
          true
        );
      }

      const { _id: semester, session: academicSession } = currentSemester;

      // Check for existing assignment for this specific course in this semester/session
      const existingAssignment = await CourseAssignment.findOne({
        course: courseToAssign._id,
        semester,
        session: academicSession,
        department: assignmentDeptId,
      }).session(session);

      // If assignment already exists, update it instead of creating new
      if (existingAssignment) {
        // Update the existing assignment
        existingAssignment.lecturer = lecturer;
        existingAssignment.assignedBy = req.user._id;
        await existingAssignment.save({ session });
        assignmentsToCreate.push(existingAssignment);
      } else {
        // Prepare new assignment
        assignmentsToCreate.push({
          course: courseToAssign._id,
          lecturer,
          semester,
          session: academicSession,
          department: assignmentDeptId,
          assignedBy: req.user._id,
        });
      }
    }

    // Bulk create/update assignments
    const createdAssignments = [];
    for (const assignmentData of assignmentsToCreate) {
      if (assignmentData._id) {
        // This is an updated assignment
        createdAssignments.push(assignmentData);
      } else {
        // This is a new assignment
        const newAssignment = await CourseAssignment.create([assignmentData], { session });
        createdAssignments.push(newAssignment[0]);
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    const message = assignToAll
      ? `Course assigned successfully to ${createdAssignments.length} related courses`
      : `Course assigned successfully to ${courseData.courseCode}`;

    return buildResponse(res, 201, message, createdAssignments);

  } catch (error) {
    // Abort transaction on error
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }

    console.error("assignCourse error:", error);

    // Handle duplicate key error specifically
    if (error.code === 11000) {
      return buildResponse(
        res,
        400,
        "Duplicate assignment detected. Please try again.",
        null,
        true,
        error
      );
    }

    return buildResponse(res, 500, "Failed to assign course", null, true, error);
  }
};

export const unassignCourse = async (req, res) => {
  let session = null;
  try {
    // Start a transaction session
    session = await mongoose.startSession();
    session.startTransaction();

    // Get parameters - unassignAll defaults to true
    // lecturer is optional - if provided, only remove that lecturer's assignment
    const { course: selectedCourseId, staffId: lecturer, unassignAll = true } = req.body;

    // Fetch the selected course (borrowed or normal) within transaction
    const courseData = await Course.findById(selectedCourseId).session(session);
    if (!courseData) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Course not found", null, true);
    }

    // Determine the original course ID
    const originalCourseId = courseData.borrowedId || selectedCourseId;
    const isBorrowed = !!courseData.borrowedId;

    // Get original course (for HOD check and finding borrowed copies)
    const originalCourse = await Course.findById(originalCourseId).session(session);
    if (!originalCourse) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "Original course not found", null, true);
    }

    // HOD permission check: only HOD of original department can unassign
    if (req.user?.role === "hod") {
      const hodDept = await departmentModel.findOne({ hod: req.user._id }).session(session);
      if (!hodDept) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(res, 404, "Department not found for HOD", null, true);
      }

      if (originalCourse.department.toString() !== hodDept._id.toString()) {
        await session.abortTransaction();
        session.endSession();
        return buildResponse(
          res,
          403,
          "Only the HOD of the original department can unassign lecturers from this course",
          null,
          true
        );
      }
    }

    // Determine which courses to unassign
    let coursesToUnassign = [];
    
    if (unassignAll) {
      // Find all related courses (original + all borrowed copies)
      coursesToUnassign = await Course.find({
        $or: [
          { _id: originalCourseId }, // The original course
          { borrowedId: originalCourseId } // All borrowed copies
        ]
      }).session(session);
    } else {
      // Unassign only from the selected course
      coursesToUnassign = [courseData];
    }

    if (coursesToUnassign.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return buildResponse(res, 404, "No courses found to unassign", null, true);
    }

    // Collect all assignment IDs to remove
    const removedAssignments = [];
    const failedUnassignments = [];

    // Process each course to unassign
    for (const courseToUnassign of coursesToUnassign) {
      const assignmentDeptId = courseToUnassign.department;
      if (!assignmentDeptId) {
        failedUnassignments.push({
          course: courseToUnassign.courseCode,
          error: "Department not found"
        });
        continue;
      }

      // Fetch active semester for each department
      const currentSemester = await Semester.findOne({
        department: assignmentDeptId,
        isActive: true,
      }).session(session);

      if (!currentSemester) {
        failedUnassignments.push({
          course: courseToUnassign.courseCode,
          error: "No active semester for department"
        });
        continue;
      }

      const { _id: semester, session: academicSession } = currentSemester;

      // Build the delete query conditionally
      const deleteQuery = {
        course: courseToUnassign._id,
        semester,
        session: academicSession,
        department: assignmentDeptId,
      };

      // Only add lecturer to query if provided
      if (lecturer) {
        deleteQuery.lecturer = lecturer;
      }

      // Find and delete the assignment
      const deletedAssignment = await CourseAssignment.findOneAndDelete(deleteQuery)
        .session(session);

      if (deletedAssignment) {
        removedAssignments.push(deletedAssignment);
      } else {
        // Check if there's any assignment at all for this course
        const anyAssignment = await CourseAssignment.findOne({
          course: courseToUnassign._id,
          semester,
          session: academicSession,
          department: assignmentDeptId,
        }).session(session);

        if (anyAssignment && lecturer) {
          failedUnassignments.push({
            course: courseToUnassign.courseCode,
            error: `Assignment exists but lecturer mismatch. Expected: ${lecturer}, Found: ${anyAssignment.lecturer}`
          });
        } else if (!anyAssignment) {
          failedUnassignments.push({
            course: courseToUnassign.courseCode,
            error: "No assignment found for this course"
          });
        } else {
          failedUnassignments.push({
            course: courseToUnassign.courseCode,
            error: "No assignment found"
          });
        }
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    const responseData = {
      removedAssignments,
      failedUnassignments,
      totalRemoved: removedAssignments.length,
      totalFailed: failedUnassignments.length,
      lecturerProvided: !!lecturer
    };

    // Build response message based on results
    let message = "";
    if (removedAssignments.length === 0 && failedUnassignments.length > 0) {
      message = "Failed to unassign from any courses";
      return buildResponse(res, 404, message, responseData, failedUnassignments.length > 0);
    } else if (failedUnassignments.length > 0) {
      message = `Unassigned from ${removedAssignments.length} course(s), but failed for ${failedUnassignments.length} course(s)`;
      return buildResponse(res, 207, message, responseData); // 207 Multi-Status
    } else {
      const lecturerText = lecturer ? `lecturer ${lecturer}` : "the assigned lecturer";
      message = unassignAll 
        ? `${lecturerText} unassigned successfully from ${removedAssignments.length} related courses`
        : `${lecturerText} unassigned successfully from ${courseData.courseCode}`;
      return buildResponse(res, 200, message, responseData);
    }

  } catch (error) {
    // Abort transaction on error
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    
    console.error("unassignCourse error:", error);
    return buildResponse(res, 500, "Failed to unassign course", null, true, error);
  }
};




// =========================================================
// 🧾 COURSE REGISTRATION SYSTEM
// =========================================================

export const registerCourses = async (req, res) => {
  try {
    const { courses: selectedCourseIds } = req.body;

    // =============================================
    // ✅ PAYMENT RESTRICTION CHECK - ADD THIS SECTION
    // =============================================
    
    // Only check payment for students
    if (req.user.role === "student") {
      try {
        const restrictionService = new CourseRestrictionService();
        
        // Check if student has paid school fees
        const schoolFeesPaid = await restrictionService.hasPaidSchoolFees(req.user._id);
        
        if (!schoolFeesPaid) {
          return buildResponse.error(
            res,
            "Course registration requires payment of school fees",
            403,
            {
              restrictionType: "PAYMENT_REQUIRED",
              requiredPayment: "SCHOOL_FEES",
              message: "Please pay your school fees to register for courses",
              suggestedAction: "Make school fees payment through the payment portal",
              feeType: "SCHOOL_FEES"
            }
          );
        }
        
        // Optional: Check if student has paid other mandatory fees
        const mandatoryFeesCheck = await restrictionService.hasPaidAllMandatoryFees(req.user._id);
        
        if (!mandatoryFeesCheck.paid && mandatoryFeesCheck.missingFee) {
          // You can choose to allow registration with warning or block it
          // For now, we'll just log it as a warning
          console.warn(`Student ${req.user._id} missing ${mandatoryFeesCheck.missingFee}:`, mandatoryFeesCheck.message);
        }
        
      } catch (paymentError) {
        console.error("Payment restriction check error:", paymentError);
        // If payment check fails, decide whether to allow or block
        // For safety, we'll allow registration but log the error
        console.warn("Payment check failed, allowing registration for now");
      }
    }
    // =============================================
    // END OF PAYMENT RESTRICTION CHECK
    // =============================================


    // 1️⃣ GET STUDENT
    const student = await studentModel.findById(req.user._id).lean();
    const department = student.departmentId
    if (!student) {
      return buildResponse(res, 404, "Student not found", null, true);
    }
    const level = student.level;

    // 2️⃣ DETERMINE ACTIVE SEMESTER BASED ON ROLE
    let semesterQuery = { isActive: true };

    if (req.user.role === "admin") {
      if (!department) {
        return buildResponse(res, 400, "Department is required for admin");
      }
      semesterQuery.department = department;
    } else if (req.user.role === "hod") {
      const dept = await departmentService.getDepartmentByHod(req.user._id)
      if (!dept) {
        return buildResponse(res, 404, "HOD department not found");
      }
      semesterQuery.department = dept._id;
    } else {
      semesterQuery.department = student.departmentId;
    }

    const currentSemester = await Semester.findOne(semesterQuery).lean();
    if (!currentSemester) {
      return buildResponse(res, 404, "No active semester found");
    }

    const { _id: semesterId, session, levelSettings } = currentSemester;

    // 3️⃣ CHECK IF STUDENT ALREADY REGISTERED
    const existingReg = await CourseRegistration.findOne({
      student: student._id,
      semester: semesterId,
      session,
    });

    if (existingReg) {
      return buildResponse(res, 400, "Student already registered for this semester");
    }

    // 4️⃣ FETCH LEVEL SETTINGS
    const settings = levelSettings.find(l => String(l.level) === String(level));
    if (!settings) {
      return buildResponse(res, 400, `No semester settings for level ${level}`);
    }

    const { minUnits, maxUnits, minCourses, maxCourses } = settings;

    // 5️⃣ FETCH SELECTED COURSES (raw)
    let selectedCourses = await Course.find({ _id: { $in: selectedCourseIds } }).lean();

    if (selectedCourses.length !== selectedCourseIds.length) {
      return buildResponse(res, 400, "Some selected courses do not exist");
    }

    // 6️⃣ BUILD RESOLVED COURSES FOR VALIDATION
    const resolvedCourses = [];
    for (const course of selectedCourses) {
      if (course.borrowedId) {
        // Borrowed course → get original for validation
        const original = await Course.findById(course.borrowedId).lean();
        if (!original) {
          return buildResponse(res, 400, `Borrowed course '${course._id}' has invalid borrowedId`);
        }

        resolvedCourses.push({
          ...original,
          _id: course._id,         // IMPORTANT: keep borrowed ID for saving
          borrowedFrom: original._id,
        });
      } else {
        resolvedCourses.push(course);
      }
    }

    // 7️⃣ VALIDATE UNITS
    const totalUnits = resolvedCourses.reduce((sum, c) => sum + (c.unit || 0), 0);
    if (totalUnits < minUnits || totalUnits > maxUnits) {
      return buildResponse(
        res,
        400,
        `Total units (${totalUnits}) must be between ${minUnits} and ${maxUnits}`
      );
    }

    // 8️⃣ VALIDATE COURSE COUNT
    if (selectedCourses.length < minCourses || selectedCourses.length > maxCourses) {
      return buildResponse(
        res,
        400,
        `Number of courses must be between ${minCourses} and ${maxCourses}`
      );
    }

    // 9️⃣ VALIDATE CORE COURSES
    const coreAssignments = await CourseAssignment.find({
      semester: semesterId,
      session,
      department: semesterQuery.department,
      course: { $in: await Course.find({ level, type: "core" }).distinct("_id") }
    });

    const coreCourseIds = coreAssignments.map(a => a.course.toString());
    const selectedStrIds = selectedCourseIds.map(id => id.toString());

    const missingCore = coreCourseIds.filter(id => !selectedStrIds.includes(id));

    if (missingCore.length > 0) {
      console.log("Missing core courses:", missingCore);
      // return buildResponse(res, 400, `Missing ${missingCore.length} core courses`, missingCore);

    }

    // 🔟 PREREQUISITE CHECK
    for (const course of resolvedCourses) {
      if (!course.prerequisites || !course.prerequisites.length) continue;

      const passed = await CourseRegistration.find({
        student: student._id,
        courses: { $in: course.prerequisites },
        status: "Approved",
      }).distinct("courses");

      const failedPrereq = course.prerequisites.filter(p => !passed.includes(p.toString()));

      if (failedPrereq.length > 0) {
        return buildResponse(
          res,
          400,
          `Prerequisites not met for ${course.title || "a borrowed course"}`,
          failedPrereq
        );
      }
    }

    // 1️⃣1️⃣ CARRYOVER CHECK
    const carryovers = await carryOverSchema.find({
      student: student._id,
      cleared: false,
    }).lean();

    for (const carry of carryovers) {
      if (!selectedStrIds.includes(carry.course.toString())) {
        return buildResponse(
          res,
          400,
          `Carryover course ${carry.course} must be included`
        );
      }
    }

    // 1️⃣2️⃣ ATTEMPT NUMBER
    const previousAttempts = await CourseRegistration.find({
      student: student._id,
      courses: { $in: selectedCourseIds },
    });

    const attemptNumber = previousAttempts.length + 1;

    // 1️⃣3️⃣ SAVE REGISTRATION
    const newReg = new CourseRegistration({
      student: student._id,
      courses: selectedCourseIds,   // IMPORTANT: NOT the originals
      semester: semesterId,
      session,
      level,
      totalUnits,
      attemptNumber,
      registeredByHod: req.user.role === "hod" ? req.user._id : null,
      notes: req.user.role === "hod" ? req.body.notes || null : null,
      department
    });

    await newReg.save();

    return res.status(201).json(
      buildResponse(res, 201, "Courses registered successfully", newReg)
    );

  } catch (err) {
    console.error(err);
    return res.status(500).json(
      buildResponse(res, 500, "Course registration failed", null, true, err)
    );
  }
};

export const getStudentRegistrations = async (req, res) => {
  try {
    let { session } = req.query;   // semester removed from query
    let studentId = req.params.studentId;

    // Student: force their own ID
    if (req.user.role === "student") {
      studentId = req.user._id;
    }

    // HOD validation
    if (req.user.role === "hod") {
      if (!studentId) {
        return buildResponse.error(res, "studentId is required for HOD");
      }

      const hodDept = await departmentModel.findOne({ hod: req.user._id }).lean();
      if (!hodDept) return buildResponse.error(res, "HOD department not found");

      const targetStudent = await studentModel.findById(studentId).lean();
      if (!targetStudent) return buildResponse.error(res, "Student not found");

      if (String(targetStudent.departmentId) !== String(hodDept._id)) {
        return buildResponse.error(res, "You can only access students in your department");
      }
    }

    // Fetch student
    const student = await studentModel.findById(studentId).lean();
    if (!student) {
      return buildResponse.error(res, "Student not found");
    }

    // 1️⃣ Determine active semester ALWAYS
    const departmentId =
      req.user.role === "hod"
        ? (await departmentModel.findOne({ hod: req.user._id }).lean())?._id
        : student.departmentId;

    if (!departmentId) {
      return buildResponse.error(res, "Department not found");
    }

    const currentSemester = await Semester.findOne({
      department: departmentId,
      isActive: true
    }).lean();

    if (!currentSemester) {
      return buildResponse.error(res, "Active semester not found");
    }

    // 2️⃣ Build filter ALWAYS using active semester
    const filter = {
      student: studentId,
      semester: currentSemester._id
    };

    // 3️⃣ Fetch registrations
    let registrations = await CourseRegistration.find(filter)
      .populate("student courses semester approvedBy")
      .sort({ createdAt: -1 })
      .lean();

    // 4️⃣ Borrowed courses resolution
    for (const reg of registrations) {
      reg.courses = await Promise.all(
        reg.courses.map(async (course) => {
          if (!course.borrowedId) return course;

          const original = await Course.findById(course.borrowedId).lean();
          return original || course;
        })
      );
    }

    return buildResponse.success(res, "Registrations fetched", registrations);

  }
  catch (err) {
    return res
      .status(500)
      .json(buildResponse.error(res, err.message));
  }
};


// =========================================================
// 🧑‍🏫 LECTURER COURSE MANAGEMENT
// =========================================================

export const getLecturerCourses = async (req, res) => {
  try {
    const lecturerId = req.user?._id;

    // 1️⃣ Ensure lecturer exists
    const lecturer = await lecturerModel.findById(lecturerId).lean();
    if (!lecturer) {
      return buildResponse(res, 404, "Lecturer not found");
    }

    // 2️⃣ Get all semesters where this lecturer has assignments
    const assignedSemesterIds = await courseAssignmentModel.distinct(
      "semester",
      { lecturer: lecturerId }
    );

    if (!assignedSemesterIds.length) {
      return buildResponse(res, 200, "No course assignments found", []);
    }

    // 3️⃣ Filter only ACTIVE semesters
    const activeSemesterIds = await Semester.distinct("_id", {
      _id: { $in: assignedSemesterIds },
      isActive: true
    });

    if (!activeSemesterIds.length) {
      return buildResponse(res, 200, "No active semesters found", []);
    }

    // 4️⃣ Let fetchDataHelper do its magic ✨
    const result = await fetchDataHelper(req, res, courseAssignmentModel, {
      forceFind: true,
      configMap: dataMaps.CourseAssignment,
      autoPopulate: true,
      models: { courseModel, lecturerModel },
      additionalFilters: {
        lecturer: lecturerId,
        semester: { $in: activeSemesterIds }
      },
      populate: [
        {
          path: "course",
          populate: [
            {
              path: "borrowedId",
              select: "courseCode title unit level semester department",
              populate: {
                path: "department",
                select: "name" // nested department inside borrowedId
              }
            },
            {
              path: "department",
              select: "name" // top-level department on course
            }
          ]
        },
        "semester"
      ]

    });

    return res.json(
      buildResponse(res, 200, "Lecturer courses fetched", result)
    );

  } catch (err) {
    console.error(err);
    return res.status(500).json(
      buildResponse(res, 500, err.message)
    );
  }
};



// =========================================================
// 📊 ANALYTICS & REPORTS
// =========================================================

export const getCourseRegistrationReport = async (req, res) => {
  try {
    const user_id = req.user._id;
    const role = req.user.role;
    const { level, semester, session } = req.query;

    let match_filter = {};
    let carryover_filter = {};

    // 🔐 Role-based filtering for HOD
    if (role === "hod") {
      const department = await Department.findOne({ hod: user_id });

      if (!department) {
        return res.status(404).json({
          success: false,
          message: "Department not found for this HOD",
        });
      }

      match_filter.department = department._id;
      carryover_filter.department = department._id;
    }

    // 🎛 Optional filters from frontend
    if (level) match_filter.level = Number(level);
    if (semester) {
      match_filter.semester = semester;
      carryover_filter.semester = semester;
    }
    if (session) match_filter.session = session;

    // ===============================
    // 1️⃣ Summary cards from CourseRegistration
    // ===============================
    const summary = await CourseRegistration.aggregate([
      { $match: match_filter },
      {
        $group: {
          _id: null,
          total_registrations: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
          total_units: { $sum: "$totalUnits" },
        },
      },
    ]);

    // ===============================
    // 2️⃣ Carryover summary cards
    // ===============================
    const carryover_summary = await CarryoverCourse.aggregate([
      { $match: carryover_filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          cleared: { $sum: { $cond: [{ $eq: ["$cleared", true] }, 1, 0] } },
          uncleared: { $sum: { $cond: [{ $eq: ["$cleared", false] }, 1, 0] } },
        },
      },
    ]);

    // ===============================
    // 3️⃣ Status distribution (Pie)
    // ===============================
    const status_chart = await CourseRegistration.aggregate([
      { $match: match_filter },
      {
        $group: {
          _id: "$status",
          value: { $sum: 1 },
        },
      },
      {
        $project: { _id: 0, label: "$_id", value: 1 },
      },
    ]);

    // ===============================
    // 4️⃣ Level distribution (Bar)
    // ===============================
    const level_chart = await CourseRegistration.aggregate([
      { $match: match_filter },
      {
        $group: {
          _id: "$level",
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: { _id: 0, level: "$_id", total: 1 },
      },
    ]);

    // ===============================
    // 5️⃣ Semester trend (Line)
    // ===============================
    const semester_chart = await CourseRegistration.aggregate([
      { $match: match_filter },
      {
        $lookup: {
          from: "semesters",
          localField: "semester",
          foreignField: "_id",
          as: "semester_info",
        },
      },
      {
        $unwind: {
          path: "$semester_info",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$semester_info.name", "Unknown"] },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          semester: "$_id",
          total: 1,
        },
      },
    ]);




    // ===============================
    // 6️⃣ Carryover reason chart (Pie)
    // ===============================
    const carryover_reason_chart = await CarryoverCourse.aggregate([
      { $match: carryover_filter },
      {
        $group: {
          _id: "$reason",
          value: { $sum: 1 },
        },
      },
      {
        $project: { _id: 0, label: "$_id", value: 1 },
      },
    ]);

    // ===============================
    // 7️⃣ Carryover status chart (Cleared vs Uncleared)
    // ===============================
    const carryover_status_chart = await CarryoverCourse.aggregate([
      { $match: carryover_filter },
      {
        $group: {
          _id: "$cleared",
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          label: { $cond: [{ $eq: ["$_id", true] }, "Cleared", "Uncleared"] },
          total: 1,
        },
      },
    ]);

    // ===============================
    // 8️⃣ Final response
    // ===============================
    return res.status(200).json({
      success: true,
      role,
      filters_applied: {
        level: level || "all",
        semester: semester || "all",
        session: session || "all",
      },
      summary: {
        ...summary[0],
        carryovers: carryover_summary[0]?.total || 0,
      },
      charts: {
        status_chart,
        level_chart,
        semester_chart,
        carryover_reason_chart,
        carryover_status_chart,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate course registration report",
    });
  }
};



export const getStudentsForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const user = req.user;

    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }

    // 1️⃣ Check if the course exists
    const course = await Course.findById(courseId).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 2️⃣ Role Based Department Restriction
    let allowedDepartment = null;

    if (user.role === "admin") {
      // Admin can see all
      allowedDepartment = null;
    } else if (user.role === "hod") {
      const dept = await Department.findOne({ hod: user._id }).lean();
      if (!dept) return res.status(404).json({ message: "HOD department not found" });
      allowedDepartment = dept._id;
    } else {
      // Students can only view their own dept's course (if allowed)
      allowedDepartment = user.departmentId;
    }

    // If course belongs to another department
    if (allowedDepartment && String(course.department) !== String(allowedDepartment)) {
      // return res.status(403).json({ message: "Not allowed to view students for this course" });
    }

    // 3️⃣ Prepare payload for fetchDataHelper
    const payload = {
      ...req.query,
      filter: {
        course: courseId,
        ...req.query.filter,
      },
      // Add department filter if applicable
      ...(allowedDepartment && {
        additionalFilters: {
          // courses
        }
      })
    };

    const options = {
      populate: [
        {
          path: "semester",
          select: "name session",
        },
        {
          path: "student",  // This populates the User document
          select: "name email",
          populate: {
            path: "_id",  // User._id references the Student document
            select: "matricNumber level gender departmentId",
            model: "Student",
          }
        },

      ],

      // Sort configuration
      sort: { createdAt: -1 },

      // Pagination
      enablePagination: false,
      limit: 1000,

      // Return type
      returnType: 'object',
      additionalFilters: {
        courses: courseId
      }
      ,
      // UPDATED ConfigMap for your actual structure
      configMap: {
        // Basic user info from the populated student (which is actually User)
        name: async (doc) => doc.student?.name || "",

        email: async (doc) => doc.student?.email || "",

        // Student-specific info comes from student._id (populated Student document)
        gender: async (doc) => doc.student?._id?.gender || "",

        matric_no: async (doc) => doc.student?._id?.matricNumber || "",

        level: async (doc) => doc.student?._id?.level || "",

        semesterName: async (doc) => doc.semester?.name || "",

        session: async (doc) => doc.semester?.session || "",

        registrationLevel: async (doc) => doc.level || "",

        // Department - note the different path
        department: async (doc, model) => {
          // Department is in the Student document, not User
          // console.log("Doc student:", doc.student);
          if (doc.student?._id?.departmentId) {
            const dept = await mongoose.model('Department').findById(doc.student._id.departmentId).lean();
            return dept?.name || "n";
          }
          return "s";
        }
      }
    };

    // 5️⃣ Use fetchDataHelper correctly
    const result = await fetchDataHelper(req, res, CourseRegistration, options);

    // 6️⃣ Handle response
    if (!result.data || result.data.length === 0) {
      return res.status(200).json({
        message: "No student has registered for this course yet",
        data: [],
        courseInfo: {
          courseId,
          courseName: course.name,
          courseCode: course.code,
        },
      });
    }

    // 7️⃣ Return structured response
    return res.status(200).json({
      message: "Students retrieved successfully",
      count: result.data.length,
      courseInfo: {
        courseId,
        courseName: course.name,
        courseCode: course.code,
        department: course.department,
      },
      data: result.data,
      metadata: {
        timestamp: new Date().toISOString(),
        requestedBy: {
          userId: user._id,
          role: user.role,
        },
        filtersApplied: {
          courseId,
          departmentFilter: allowedDepartment ? "applied" : "none",
        },
      },
    });

  } catch (error) {
    console.error("❌ getStudentsForCourse Error:", error);
    return res.status(500).json({
      message: "Failed to retrieve students",
      error: error.message,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }
};
export const getRegisterableCourses = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const studentDepartment = await studentModel.findById(studentId).lean()

    const semester = await Semester.findOne({ department: String(studentDepartment.departmentId), isActive: true }).lean()
    console.log("Semester Name", semester)
    // console.log(studentId, semesterId, studentDepartment._id)
    if (!studentId || !semester) {
      return buildResponse.error(res, "studentId and semesterId are required")
    }

    // Fetch student details
    const student = await studentModel.findById(studentId);
    if (!student) {
      return buildResponse.error(res, "Student not found")
    }

    // Fetch semester details
    // const semester = await Semester.findById(semesterId).lean();
    if (!semester) {
      return buildResponse.error(res, "Semester not found")
    }
    console.log(semester.name)
    const fetchConfig = {
      configMap: dataMaps.Course,
      autoPopulate: false,
      autoPopulate: true,
      models: { departmentModel },
      custom_fields: {
        borrowedIdSemester: { path: 'borrowedId.semester' },
        borrowedIdLevel: { path: 'borrowedId.level' }
      },
      populate: ["department", "borrowedId"],
      limit: 100,
      // Make borrowedId.level trigger the pipeline
      // custom_fields: { 'borrowedId.level': "borrowedId" }, // Map the nested field
      additionalFilters: {
        department: student.departmentId,

        $and: [
          {
            $or: [
              { semester: semester.name },
              { "borrowedId.semester": semester.name }
            ]
          },
          {
            $or: [
              { level: parseInt(student.level) },
              { "borrowedId.level": parseInt(student.level) }
            ]
          }
        ]
      }


    };


    const result = await fetchDataHelper(req, res, Course, fetchConfig);
  } catch (err) {
    console.log(err)
    return buildResponse.error(res, err.message)
  }
}

// =========================================================
// 🧹 CLEANUP & SAFETY UTILITIES
// =========================================================

export const cleanupInactiveCourses = async (req, res) => {
  try {
    const result = await Course.deleteMany({ status: "Inactive" });
    res.json(buildResponse(true, `${result.deletedCount} inactive courses removed`));
  } catch (err) {
    res.status(500).json(buildResponse(false, err.message));
  }
};
