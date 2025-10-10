const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  title: {
    type: String,
    required: true
  },
  unit: {
    type: Number,
    required: true
  },
  level: {
    type: Number,
    required: true
  },
  semester: {
    type: String,
    enum: ['First', 'Second'],
    required: true
  }
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema);
module.exports = Course;