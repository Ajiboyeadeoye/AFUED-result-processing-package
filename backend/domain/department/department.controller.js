import Department from "./department.model.js";
import User from "../user/user.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";

// ✅ Assign HOD to Department

export const getAllDepartment = async (req, res) => {
  return await fetchDataHelper(req, res, Department, {
    autoPopulate: true, // will handle faculty automatically
  });
};

export const assignHOD = async (req, res) => {
  try {
    const { userId } = req.body; // userId of the lecturer
    const { departmentId } = req.params;


    // Check department exists
    const department = await Department.findById(departmentId);
    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    // Check user exists
    const lecturer = await User.findById(userId);
    if (!lecturer) {
      return buildResponse(res, 404, "User not found");
    }

    // Ensure only a Lecturer can become HOD
    if (lecturer.role !== "Lecturer") {
      return buildResponse(res, 400, "Only lecturers can be assigned as HOD");
    }

    // Ensure lecturer belongs to this department
    if (!lecturer.department || lecturer.department.toString() !== departmentId) {
      return buildResponse(res, 400, "Lecturer must belong to this department before becoming HOD");
    }

    // Check if department already has HOD
    if (department.hod) {
      return buildResponse(res, 400, "This department already has an HOD");
    }

    // ✅ Assign HOD
    department.hod = userId;
    await department.save();

    // ✅ Update user role to HOD
    lecturer.role = "HOD";
    await lecturer.save();

    return buildResponse(res, 200, "HOD assigned successfully", department);
  } catch (error) {
    return buildResponse(res, 500, "Failed to assign HOD", null, true, error);
  }
};

// ✅ Remove HOD
export const removeHOD = async (req, res) => {
  try {
    const { departmentId } = req.params;

    const department = await Department.findById(departmentId);
    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    if (!department.hod) {
      return buildResponse(res, 400, "No HOD assigned yet");
    }

    // Find HOD user
    const hodUser = await User.findById(department.hod);
    if (hodUser) {
      hodUser.role = "Lecturer"; // revert back to lecturer
      await hodUser.save();
    }

    department.hod = null;
    await department.save();

    return buildResponse(res, 200, "HOD removed successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to remove HOD", null, true, error);
  }
};


// ✅ Assign Lecturer to Department
export const assignLecturerToDepartment = async (req, res) => {
  try {
    const { userId } = req.body;
    const { departmentId } = req.params;

    // Check department exists
    const department = await Department.findById(departmentId);
    if (!department) return buildResponse(res, 404, "Department not found");

    // Check user exists
    const user = await User.findById(userId);
    if (!user) return buildResponse(res, 404, "User not found");

    // Only lecturers can be assigned
    if (user.role !== "Lecturer") {
      return buildResponse(res, 400, "Only lecturers can be assigned to a department");
    }

    // Assign lecturer to department
    user.department = departmentId;
    await user.save();

    return buildResponse(res, 200, "Lecturer assigned to department successfully", user);
  } catch (error) {
    return buildResponse(res, 500, "Failed to assign lecturer", null, true, error);
  }
};

// ✅ Remove Lecturer from Department
export const removeLecturerFromDepartment = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user) return buildResponse(res, 404, "User not found");
    if (user.role !== "Lecturer" && user.role !== "HOD") {
      return buildResponse(res, 400, "Only lecturers or HODs belong to departments");
    }

    // Prevent removing current HOD this way
    if (user.role === "HOD") {
      return buildResponse(res, 400, "Remove as HOD first before removing from department");
    }

    user.department = null;
    await user.save();

    return buildResponse(res, 200, "Lecturer removed from department successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to remove lecturer from department", null, true, error);
  }
};

// ✅ Create Department
export const createDepartment = async (req, res) => {
  try {
    const { name, code, faculty_id: faculty , fields, search_term, filters, page } = req.body;
    console.log(name, code, faculty, fields, search_term, filters, page)

    if (fields || search_term || filters || page) {
          const result = await fetchDataHelper( req, res, Department,);
          return buildResponse(res, 200, "Filtered departments fetched", result);
    }
    
    
    // Validate input
    if (!name || !code) {
      return buildResponse(res, 400, "Department name and code are required");
    }

    // Check if department already exists
    const existingDept = await Department.findOne({ name });
    if (existingDept) {
      return buildResponse(res, 400, "Department with this name already exists");
    }

    // Create new department
    const newDepartment = await Department.create({
      name,
      code,
      faculty: faculty || null,
    });

    return buildResponse(res, 201, "Department created successfully", newDepartment);
  } catch (error) {
    
    console.log(error)
    return buildResponse(res, 500, "Failed to create department", null, true, error);
  }
};




// ✅ Get Departments by Faculty
export const getDepartmentsByFaculty = async (req, res) => {
  try {
    const { facultyId } = req.params;

    const departments = await Department.find({ faculty: facultyId }).populate("hod", "name email");
    if (!departments || departments.length === 0) {
      return buildResponse(res, 404, "No departments found for this faculty");
    }

    return buildResponse(res, 200, "Departments fetched successfully", departments);
  } catch (error) {
    return buildResponse(res, 500, "Failed to get departments", null, true, error);
  }
};

// ✅ Get Department by ID
export const getDepartmentById = async (req, res) => {
  try {
    const { departmentId } = req.params;

    const department = await Department.findById(departmentId)
      .populate("hod", "name email role")
      .populate("faculty", "name");

    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    return buildResponse(res, 200, "Department fetched successfully", department);
  } catch (error) {
    return buildResponse(res, 500, "Failed to get department", null, true, error);
  }
};

// ✅ Update Department
export const updateDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { name, code, faculty } = req.body;

    const department = await Department.findById(departmentId);
    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    // Update fields
    if (name) department.name = name;
    if (code) department.code = code;
    if (faculty) department.faculty = faculty;

    await department.save();

    return buildResponse(res, 200, "Department updated successfully", department);
  } catch (error) {
    return buildResponse(res, 500, "Failed to update department", null, true, error);
  }
};

// ✅ Delete Department
export const deleteDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;

    const department = await Department.findById(departmentId);
    if (!department) {
      return buildResponse(res, 404, "Department not found");
    }

    if (department.hod) {
      return buildResponse(res, 400, "Cannot delete department with an assigned HOD");
    }

    const lecturers = await User.find({ department: departmentId });
    if (lecturers.length > 0) {
      return buildResponse(res, 400, "Cannot delete department with assigned lecturers");
    }

    await Department.findByIdAndDelete(departmentId);

    return buildResponse(res, 200, "Department deleted successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to delete department", null, true, error);
  }
};



