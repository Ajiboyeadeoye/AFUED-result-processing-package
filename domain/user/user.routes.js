const express = require('express');
const router = express.Router();
const { createNewUser, authenticateUser } = require("./user.controller");


// signin route
router.post('/signin', async (req, res) => {
    try {
        let { email, password } = req.body;
        email = email.trim().toLowerCase();
        password = password.trim();

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
            return res.status(400).json({ message: 'Invalid email format.' });
        } else if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
        } else {
            // good credentials, proceed to signin user.
            const authenticatedUser = await authenticateUser({ email, password});

            res.status(200).json({ message: 'Signin successful!', authenticatedUser });
        }
    }catch (error) {
        res.status(400).send(error.message);
    }
});


//Signup route
router.post('/signup', async (req, res) => {
    try {
        let { name, email, password, role } = req.body;
        name = name.trim();
        email = email.trim().toLowerCase();
        password = password.trim();
        role = role ? role.trim().toLowerCase() : 'student';

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required.' });
        } else if (!/^[a-zA-Z\s]+$/.test(name)) {
            return res.status(400).json({ message: 'Name can only contain letters and spaces.' });
        } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
            return res.status(400).json({ message: 'Invalid email format.' });
        } else if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
        } else if (!['student', 'lecturer', 'admin'].includes(role)) {
            return res.status(400).json({ message: 'Role must be either student, lecturer, or admin.' });
        } else {

            // good credentials, create new user.
            const newUser = await createNewUser({
                name,
                email,
                password
            });
            res.status(200).json(newUser);
        }
    } catch (error) {
        res.status(400).send(error.message)
    };
});

module.exports = router;