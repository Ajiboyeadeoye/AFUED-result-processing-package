import Student from "./student.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import  fetchDataHelper  from "../../utils/fetchDataHelper.js";
import Semester from "../semester/semester.model.js";
import User from "../user/user.model.js";
import departmentModel from "../department/department.model.js";
import { hashData } from "../../utils/hashData.js";
import { dataMaps } from "../../config/dataMap.js";
import studentModel from "./student.model.js";


/**
 * 🧍‍♂️ Get Logged-in Student Profile
 * ---------------------------------
 * Fetch profile details for the logged-in student.
 */
export const getMyProfile = async (req, res) => {
  try {
    // const s
        return fetchDataHelper(req, res, studentModel, {
          configMap: dataMaps.Student,
          autoPopulate: true,
          models: { departmentModel, User, Semester },
          populate: ["departmentId", "_id"],
          additionalFilters: { _id: req.user._id },
    
        });

  } catch (error) {
    console.error("❌ getMyProfile Error:", error);
    return buildResponse(res, 500, "Error fetching student profile", null, true, error);
  }
};

/**
 * 🧾 Register Courses
 * -------------------
 * Students register their semester courses.
 */
export const registerCourses = async (req, res) => {
  try {
    const { courseIds = [] } = req.body;
    const student = await Student.findOne({ userId: req.user.id });

    if (!student) return buildResponse(res, 404, "Student not found");

    // Ensure all course IDs are valid
    const validCourses = await Course.find({ _id: { $in: courseIds } });
    if (validCourses.length !== courseIds.length)
      return buildResponse(res, 400, "One or more courses are invalid");

    student.courses = [...new Set([...student.courses, ...courseIds])]; // Avoid duplicates
    await student.save();

    return buildResponse(res, 200, "Courses registered successfully", student);
  } catch (error) {
    console.error("❌ registerCourses Error:", error);
    return buildResponse(res, 500, "Failed to register courses", null, true, error);
  }
};

/**
 * 📚 View Registered Courses
 * --------------------------
 */
export const getMyCourses = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.id })
      .populate("courses", "title code unit semester");

    if (!student) return buildResponse(res, 404, "Student not found");

    return buildResponse(res, 200, "Registered courses fetched successfully", student.courses);
  } catch (error) {
    console.error("❌ getMyCourses Error:", error);
    return buildResponse(res, 500, "Failed to fetch registered courses", null, true, error);
  }
};

/**
 * 📊 View Semester Results
 * -------------------------
 * Fetch student’s results for a specific session and semester.
 */
export const viewResults = async (req, res) => {
  try {
    const { session, semester } = req.query;

    const student = await Student.findOne({ userId: req.user.id });
    if (!student) return buildResponse(res, 404, "Student not found");

    const results = await Result.find({
      studentId: student._id,
      session,
      semester,
    })
      .populate("courseId", "title code unit")
      .sort({ createdAt: -1 });

    return buildResponse(res, 200, "Results fetched successfully", results);
  } catch (error) {
    console.error("❌ viewResults Error:", error);
    return buildResponse(res, 500, "Failed to fetch results", null, true, error);
  }
};

/**
 * 🧾 Print Transcript
 * -------------------
 * Generate full academic transcript or session-based result.
 */
export const printTranscript = async (req, res) => {
  try {
    const { session } = req.query;
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) return buildResponse(res, 404, "Student not found");

    const query = { studentId: student._id };
    if (session) query.session = session;

    const results = await Result.find(query)
      .populate("courseId", "title code unit semester")
      .sort({ session: 1, semester: 1 });

    // Optional: compute GPA/CGPA
    const transcript = {
      student: {
        name: req.user.name,
        matricNumber: student.matricNumber,
        department: student.departmentId,
        faculty: student.facultyId,
      },
      results,
      computedAt: new Date().toISOString(),
    };

    return buildResponse(res, 200, "Transcript generated successfully", transcript);
  } catch (error) {
    console.error("❌ printTranscript Error:", error);
    return buildResponse(res, 500, "Failed to generate transcript", null, true, error);
  }
};


//admin functionalities on students


// 🧾 Get all students (Admin only)
export const getAllStudents = async (req, res) => {
        return await fetchDataHelper(req, res, Student, {
        configMap: dataMaps.Student,
        autoPopulate: true,
        models: { departmentModel, User },
        populate: ["departmentId", "_id"],
        custom_fields: { name: "_id", email: "_id" },
      });
};

// 🧍 Create a new student (Admin only)
export const createStudent = async (req, res) => {
  try {
    const {
      name,
      email,
      matric_no: matricNumber,
      department_id: departmentId,
      level,
      fields,
      search_term,
      filters,
      page,
      // user: userFromMiddleware,
    } = req.body;

    // 🧮 If filtering/searching students
    if (fields || search_term || filters || page) {
      console.log("📌MMy nm📌")
      return await fetchDataHelper(req, res, Student, {
        configMap: dataMaps.Student,
        autoPopulate: true,
        models: { departmentModel, User },
        populate: ["departmentId", "_id"],
        custom_fields: { name: "_id", email: "_id", department: "departmentId" },
      });
    }

    // 🔍 1. Duplicate matric number
    const existingStudent = await Student.findOne({ matricNumber });
    if (existingStudent) {
      return buildResponse(res, 400, "Student with this matric number already exists");
    }

    // 🔍 2. Duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return buildResponse(res, 400, "User with this email already exists");
    }

    // 🔐 3. Generate default password
    const defaultPassword = `${matricNumber}`;
    const hashedPassword = await hashData(defaultPassword);

    // 👤 4. Create User Account
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "student",
      must_change_password: true,
    });

    try {
      // 📌 5. Get active session
      const session = await Semester.findOne({ isActive: true });

      // 🎓 Create Student using same user._id
      const student = await Student.create({
        _id: user._id,
        matricNumber,
        departmentId,
        level,
        session: session?._id || null,
      });

      // Response
      return buildResponse(res, 201, "Student created successfully", student);

    } catch (studentError) {
      // 🧹 Rollback user if student fails
      await User.findByIdAndDelete(user._id);
      console.error("⚠️ Student creation failed, deleted user:", studentError, departmentId);

      return buildResponse(
        res,
        500,
        "Student creation failed — Session Rollback",
        null,
        true,
        studentError
      );
    }
  } catch (error) {
    console.error("❌ createStudent Error:", error);
    return buildResponse(res, 500, "Failed to create student", null, true, error);
  }
};


// 📋 Get a single student
export const getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate("userId", "name email role")
      .populate("departmentId", "name code")
      .populate("facultyId", "name code");

    if (!student) return buildResponse(res, 404, "Student not found");

    return buildResponse(res, 200, "Student fetched successfully", student);
  } catch (error) {
    return buildResponse(res, 500, "Failed to fetch student", null, true, error);
  }
};

export const myProfile = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id })
      .populate("userId", "name email role")
      .populate("departmentId", "name code")
      .populate("facultyId", "name code")
      .populate("courses", "title code unit");

    if (!student) return buildResponse(res, 404, "Student profile not found");

    return buildResponse(res, 200, "Student profile fetched successfully", student);
  } catch (error) {
    console.error("❌ myProfile Error:", error);
    return buildResponse(res, 500, "Error fetching student profile", null, true, error);
  }
};

// 🧰 Update student
export const updateStudent = async (req, res) => {
  try {
    const updated = await Student.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) return buildResponse(res, 404, "Student not found");

    return buildResponse(res, 200, "Student updated successfully", updated);
  } catch (error) {
    return buildResponse(res, 500, "Failed to update student", null, true, error);
  }
};

// 🗑️ Soft delete student
export const deleteStudent = async (req, res) => {
  try {
    const deleted = await Student.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date() },
      { new: true }
    );

    if (!deleted) return buildResponse(res, 404, "Student not found");

    return buildResponse(res, 200, "Student deleted successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to delete student", null, true, error);
  }
};


