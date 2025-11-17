import express from "express";
import { createNewUser, authenticateAdmin, authenticateLecturer, authenticateStudent } from "./user.controller.js";
import authenticate from "../../middlewares/authenticate.js";

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
    } else if (password.length < 6) {
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

export default router;
