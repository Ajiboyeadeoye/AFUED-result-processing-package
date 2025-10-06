const express = require('express');
const router = express.Router();

const userRoutes = require("../domain/user"); // since we have index file in the user domain


router.use("/user", userRoutes);



module.exports = router;