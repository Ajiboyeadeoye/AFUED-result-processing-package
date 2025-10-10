const express = require('express');
const router = express.Router();

const userRoutes = require("../domain/user"); // since we have index file in the user domain
const studentRoutes = require("../domain/student");


router.use("/user", userRoutes);
router.use("/student", studentRoutes);



module.exports = router;