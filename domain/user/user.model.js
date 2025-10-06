const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the User schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  token: { type: String },
  role: { 
    type: String, 
    enum: ['student', 'lecturer', 'admin'], 
    default: 'student' 
  }
}, { timestamps: true });

// Create the User model
const User = mongoose.model('User', userSchema);

module.exports = User;