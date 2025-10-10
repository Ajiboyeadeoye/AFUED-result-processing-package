const express = require('express');
const router = express.Router();
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorizeRoles'); 
// const auth = require('../../middlewares/authenticate');

console.log(authorizeRoles)
router.get(
  '/profile',
  authenticate(),                  // ✅ call the function
  authorizeRoles('student'),       // ✅ role check middleware
  (req, res) => {
    res.json({ message: 'Welcome Student', user: req.user });
  }
);

module.exports = router;
