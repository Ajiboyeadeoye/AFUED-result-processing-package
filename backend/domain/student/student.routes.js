import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import authorizeRoles from "../../middlewares/authorizeRoles.js";

const router = express.Router();

// ✅ Protected route for student profile
router.get(
  "/profile",
  authenticate(),               // Authentication middleware
  authorizeRoles("student"),    // Role-based access control
  (req, res) => {
    res.json({
      message: "Welcome Student",
      user: req.user
    });
  }
);

export default router;


//Admiin functionalities

// creating students: 
//- in json, excel, csv


//
