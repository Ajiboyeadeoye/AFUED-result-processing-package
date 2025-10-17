import Student from "./student.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import  fetchDataHelper  from "../../utils/fetchDataHelper.js";


/**
 * 🧍‍♂️ Get Logged-in Student Profile
 * ---------------------------------
 * Fetch profile details for the logged-in student.
 */
export const getMyProfile = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.id })
      .populate("userId", "name email role")
      .populate("departmentId", "name code")
      .populate("facultyId", "name code")
      .populate("courses", "title code unit");

    if (!student) return buildResponse(res, 404, "Student profile not found");

    return buildResponse(res, 200, "Student profile fetched successfully", student);
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
  return fetchDataHelper(req, res, Student, {
    enablePagination: true,
    sort: { createdAt: -1 },
  });
};

// 🧍 Create a new student (Admin only)
export const createStudent = async (req, res) => {
  try {
    const { userId, matricNumber, departmentId, facultyId, level, session } = req.body;

    const existing = await Student.findOne({ matricNumber });
    if (existing) return buildResponse(res, 400, "Matric number already exists");

    const newStudent = await Student.create({
      userId,
      matricNumber,
      departmentId,
      facultyId,
      level,
      session,
    });

    return buildResponse(res, 201, "Student created successfully", newStudent);
  } catch (error) {
    console.error("❌ Error creating student:", error);
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


