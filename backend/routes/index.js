const express = require('express');
const router = express.Router();

const userRoutes = require("../domain/user"); // since we have index file in the user domain
const studentRoutes = require("../domain/student");
const semesterRoutes = require("../domain/semester")

router.use("/user", userRoutes);
router.use("/student", studentRoutes);
router.use('/semester', semesterRoutes)



module.exports = router;