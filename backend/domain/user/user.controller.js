import User from "./user.model.js";
import { hashData, verifyHashedData } from "../../utils/hashData.js";
import createToken from "../../utils/createToken.js";
import Admin from "../admin/admin.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import studentModel from "../student/student.model.js";

// import Admin from "../models/admin.model.js";

const authenticateAdmin = async (data) => {
  try {
    const { admin_id, email, password } = data;
    console.log("Authenticating admin with data:", data);

    if (!password || (!admin_id && !email)) {
      throw new Error("Please provide Admin ID or Email, and Password");
    }

    // 🧠 Step 1: Find admin by ID or email
    const query = admin_id
      ? { admin_id: admin_id.trim().toUpperCase() }
      : { email: email.trim().toLowerCase() };

    const fetchedAdmin = await Admin.findOne(query);

    if (!fetchedAdmin) {
      throw new Error(
        admin_id
          ? "Admin with this ID does not exist!"
          : "Admin with this email does not exist!"
      );
    }

    // 🧩 Step 2: Find matching user by _id (linked document)
    const fetchedUser = await User.findById(fetchedAdmin._id);
    if (!fetchedUser) {
      throw new Error("Linked user record not found — possible data mismatch");
    }

    // 🔒 Step 3: Validate password against User model
    const passwordMatch = await verifyHashedData(password, fetchedUser.password);
    if (!passwordMatch) {
      throw new Error("Invalid password");
    }

    // 🎟️ Step 4: Create login token
    const tokenData = {
      _id: fetchedAdmin._id,
      admin_id: fetchedAdmin.admin_id,
      email: fetchedAdmin.email,
      role: "admin",
    };

    console.log("Creating token with data:", tokenData);
    const token = await createToken(tokenData);

    // 🧾 Step 5: Attach token to fetchedUser (not persisted)
    fetchedUser.token = token;

    // ✅ Step 6: Return safe info
    return {
        id: fetchedAdmin._id,
        admin_id: fetchedAdmin.admin_id,
        email: fetchedAdmin.email,
        name: fetchedAdmin.name,
        role: "admin",
        access_token: token
    };
  } catch (error) {
    console.error("❌ Admin authentication error:", error.message);
    throw new Error(error.message || "Admin authentication failed");
  }
};
const authenticateLecturer = async (data) => {
  try {
    const { staff_id, email, password } = data;
    console.log("Authenticating lecturer with data:", data);

    if ((!staff_id && !email)) {
      throw new Error("Please provide Staff ID or Email.");
    }

    // 🧠 Step 1: Find lecturer by ID or email
    const query = staff_id
      ? { staffId: staff_id.trim().toUpperCase() }
      : { email: email.trim().toLowerCase() };

    const fetchedLecturer = await lecturerModel.findOne(query);
    if (!fetchedLecturer) {
      throw new Error(
        staff_id
          ? "Lecturer with this Staff ID does not exist!"
          : "Lecturer with this email does not exist!"
      );
    }

    // 🧩 Step 2: Find linked user document
    const fetchedUser = await User.findById(fetchedLecturer._id);
    if (!fetchedUser) {
      throw new Error("Linked user record not found — possible data mismatch");
    }

    // 🔒 Step 3: Handle password variations
    const expectedDefault = `AFUED@${fetchedLecturer.staff_id}`;
    let authenticated = false;

    if (!fetchedUser.password) {
      // 🧠 Case 1: No password stored — allow default AFUED@staff_id
      if (password === expectedDefault) {
        console.log("✅ Lecturer authenticated with default AFUED@staff_id pattern");
        authenticated = true;
      }
    } else {
      // 🧩 Case 2: Try matching hashed password
      const passwordMatch = await verifyHashedData(password, fetchedUser.password);
      if (passwordMatch) {
        authenticated = true;
      } else if (password === fetchedLecturer.staffId) {
        // 🧩 Case 3: Password equals raw staff_id (legacy case)
        console.log("✅ Lecturer authenticated with raw staff_id password");
        authenticated = true;
      }
    }

    if (!authenticated) {
      throw new Error("Invalid password");
    }

    // 🎟️ Step 4: Create login token
    const tokenData = {
      _id: fetchedLecturer._id,
      staff_id: fetchedLecturer.staff_id,
      email: fetchedLecturer.email,
      role: fetchedUser.role || "lecturerw",
    };

    console.log("Creating token with data:", tokenData);
    const token = await createToken(tokenData);

    // 🧾 Step 5: Attach token (not persisted)
    fetchedUser.token = token;

    // ✅ Step 6: Return safe info
    return {
      id: fetchedLecturer._id,
      staff_id: fetchedLecturer.staffId,
      email: fetchedLecturer.email,
      name: fetchedUser.name,
      role: fetchedUser.role || "lecturer",
      access_token: token,
    };
  } catch (error) {
    console.error("❌ Lecturer authentication error:", error.message);
    throw new Error(error.message || "Lecturer authentication failed");
  }
};


const authenticateStudent = async (data) => {
  try {
    const { matric_no, email, password } = data;
    console.log("Authenticating student with data:", data);

    if ((!matric_no && !email)) {
      throw new Error("Please provide Matric Number or Email.");
    }

    // 🧠 Step 1: Find student by matric number or email
    const query = matric_no
      ? { matricNumber: matric_no.trim().toUpperCase() }
      : { email: email.trim().toLowerCase() };

    const fetchedStudent = await studentModel.findOne(query);
    if (!fetchedStudent) {
      throw new Error(
        matric_no
          ? "Student with this Matric Number does not exist!"
          : "Student with this email does not exist!"
      );
    }

    // 🧩 Step 2: Find linked user document
    const fetchedUser = await User.findById(fetchedStudent._id);
    if (!fetchedUser) {
      throw new Error("Linked user record not found — possible data mismatch");
    }

    // 🔒 Step 3: Handle password variations
    const expectedDefault = `AFUED@${fetchedStudent.matricNumber}`;
    let authenticated = false;

    if (!fetchedUser.password) {
      // 🧠 Case 1: No password stored — allow default AFUED@matric_number
      if (password === expectedDefault) {
        console.log("✅ Student authenticated with default AFUED@matric_number pattern");
        authenticated = true;
      }
    } else {
      // 🧩 Case 2: Try matching hashed password
      const passwordMatch = await verifyHashedData(password, fetchedUser.password);
      if (passwordMatch) {
        authenticated = true;
      } else if (password === fetchedStudent.matricNumber) {
        // 🧩 Case 3: Password equals raw matric number (legacy case)
        console.log("✅ Student authenticated with raw matric number password");
        authenticated = true;
      }
    }

    if (!authenticated) {
      throw new Error("Invalid password");
    }

    // 🎟️ Step 4: Create login token
    const tokenData = {
      _id: fetchedStudent._id,
      matric_no: fetchedStudent.matricNumber,
      email: fetchedStudent.email,
      role: fetchedUser.role || "student",
    };

    console.log("Creating token with data:", tokenData);
    const token = await createToken(tokenData);

    // 🧾 Step 5: Attach token (not persisted)
    fetchedUser.token = token;

    // ✅ Step 6: Return safe info
    return {
      id: fetchedStudent._id,
      matric_no: fetchedStudent.matricNumber,
      email: fetchedStudent.email,
      name: fetchedUser.name,
      role: fetchedUser.role || "student",
      access_token: token,
      // Student-specific fields
      department: fetchedStudent.departmentId,
      level: fetchedStudent.level,
      faculty: fetchedStudent.faculty,
    };
  } catch (error) {
    console.error("❌ Student authentication error:", error.message);
    throw new Error(error.message || "Student authentication failed");
  }
};




const createNewUser = async (data) => {
  try {
    const { name, email, password, role } = data;

    // 🔁 Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("User with this email already exists, please login...");
    }

    // 🔒 Hash password
    const hashedPassword = await hashData(password);

    // 🆕 Create and save new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role
    });
    
    const createdUser = await newUser.save();
    return createdUser;
  } catch (error) {
    throw error;
  }
  
};
// modelsMap can map roles to their respective Mongoose models
const modelsMap = {
  lecturer: lecturerModel,
  // student: Student,
  admin: Admin,
  // add other models here
};

/**
 * Generic delete user function
 * @param {String} id - user id
 * @param {String} role - optional role to determine which model to delete
 * @param {Mongoose.Model} model - optional model directly passed
 */
export const deleteUser = async ({ id, role, model }) => {
  try {
    let targetModel;

    // Determine which model to operate on
    if (model) {
      targetModel = model;
    } else if (role && modelsMap[role.toLowerCase()]) {
      targetModel = modelsMap[role.toLowerCase()];
    } else {
      throw new Error("Either a valid role or model must be provided");
    }

    // Hard delete the specific role model
    const doc = await targetModel.findByIdAndDelete(id);

    if (!doc) return { status: 404, message: `${role || 'User'} not found` };

    // Also hard delete the linked user
    await User.findByIdAndDelete(id);

    return { status: 200, message: `${role || 'User'} deleted successfully` };
  } catch (error) {
    return { status: 500, message: `Failed to delete ${role || 'user'}`, error };
  }
};


// Example Express route for deleting a lecturer
export const deleteLecturer = async (req, res) => {
  const { id } = req.params;
  const result = await deleteUser({ id, role: "lecturer" });

  return res.status(result.status).json(result);
};

// Example for deleting by passing model directly
export const deleteStudent = async (req, res) => {
  const { id } = req.params;
  const result = await deleteUser({ id, model: Student });

  return res.status(result.status).json(result);
};

export { createNewUser, authenticateAdmin, authenticateLecturer , authenticateStudent};
