import express from "express";
import { createNewUser, authenticateAdmin, authenticateLecturer, authenticateStudent } from "./user.controller.js";
import authenticate from "../../middlewares/authenticate.js";
import User from "./user.model.js";
import Admin from "../admin/admin.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import studentModel from "../student/student.model.js";
import { getPasswordStatus } from "../auth/auth.service.js";

const router = express.Router();

// ✅ SIGNIN route
router.post("/signin/:role", async (req, res) => {
  try {
    const { role } = req.params;
    let { email, password, matric_no, admin_id, staff_id, lecturer_id } = req.body;

    if (
      (!email && !matric_no && !admin_id && !staff_id && !lecturer_id) ||
      !password
    ) {
      return res.status(400).json({ message: "Email/ID and password are required." });
    } else if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email) && email) {
      return res.status(400).json({ message: "Invalid email format." });
    } else if (password.length < 0) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    if (email){

      email = email.trim().toLowerCase();
    }
    password = password.trim();

    let authenticatedUser;

    // Handle different sign-in roles
    switch (role) {
      case "admin":
        console.log("Admin signin attempt");
        authenticatedUser = await authenticateAdmin({ email, password , admin_id });
        break;
      case "student":
        authenticatedUser = await authenticateStudent({ email, password, matric_no });
        break;

      case "lecturer":
        authenticatedUser = await authenticateLecturer({ email, password, staff_id });
        break;
      default:
        return res.status(400).json({ message: "Invalid signin role." });
    }

    return res.status(200).json({ message: `${role} signin successful!`, user: authenticatedUser });
  } catch (error) {
    return res.status(400).json({ message: error.message, error: true });
  }
});


// ✅ SIGNUP route
router.post("/signup", async (req, res) => {
  try {
    let { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required." });
    } else if (!/^[a-zA-Z\s]+$/.test(name)) {
      return res.status(400).json({ message: "Name can only contain letters and spaces." });
    } else if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    } else if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    } else if (!["student", "lecturer", "admin"].includes(role.toLowerCase())) {
      return res.status(400).json({ message: "Role must be either student, lecturer, or admin." });
    }

    name = name.trim();
    email = email.trim().toLowerCase();
    password = password.trim();
    role = role ? role.toLowerCase() : "student";
    const newUser = await createNewUser({
      name,
      email,
      password,
      role
    });
    console.log(role);

    return res.status(201).json({ message: "Signup successful!", user: newUser });
  } catch (error) {
    return res.status(400).json({ message: error.message, error: true });
  }
});

// Add this endpoint
router.get('/profile', authenticate(), async (req, res) => {
  try {
    // const { userId } = req.params;
    const userId = req.user._id
    
    // Get user profile from appropriate model based on role
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    // let profileData;
    // switch (user.role) {
    //   case 'admin':
    //     profileData = await Admin.findById(userId);
    //     break;
    //   case 'lecturer':
    //     profileData = await lecturerModel.findById(userId);
    //     break;
    //   case 'student':
    //     profileData = await studentModel.findById(userId);
    //     break;
    //   default:
    //     return res.status(400).json({ error: "Invalid user role" });
    // }
    
    // Get password status
    const passwordStatus = await getPasswordStatus(userId);
    
    // Combine profile data with password status
    const response = {
      ...user.toObject(),
      lastPasswordChange: user.lastPasswordChange,
      passwordAgeDays: passwordStatus.passwordAgeDays,
      passwordExpiryDays: user.passwordExpiryDays,
      passwordStrength: passwordStatus.passwordStrength,
      passwordStatus // Include full status object
    };
    
    res.status(200).json({data: response, status: "success"});
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
