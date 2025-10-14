import Department from "./department.model.js";
import User from "../../user/user.model.js";
import buildResponse from "../../utils/responseBuilder.js";

// ✅ Assign HOD to Department
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
