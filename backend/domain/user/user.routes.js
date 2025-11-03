import express from "express";
import { createNewUser,  authenticateAdmin } from "./user.controller.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();

// ✅ SIGNIN route
router.post("/signin", async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    } else if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    } else if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    email = email.trim().toLowerCase();
    password = password.trim();

    const authenticatedUser = await authenticateAdmin({ email, password });
    return res.status(200).json({ message: "Signin successful!", user: authenticatedUser });
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
