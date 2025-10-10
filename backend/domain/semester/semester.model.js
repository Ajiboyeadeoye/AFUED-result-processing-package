const mongoose = require("mongoose");

const semesterSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ["First Semester", "Second Semester"],
    required: true,
  },
  session: {
    type: String,
    required: true,
  },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  isActive: { type: Boolean, default: false },
  isRegistrationOpen: { type: Boolean, default: false },
  isResultsPublished: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Semester", semesterSchema);
