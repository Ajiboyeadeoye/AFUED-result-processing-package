import mongoose from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true },

    email: { type: String,  unique: true, lowercase: true },
    // email: { type: String, required: true, unique: true, lowercase: true },


    password: { type: String, required: true },

    role: {
      type: String,
      enum: ["admin", "dean", "hod", "lecturer", "student", "applicant", "staff"],
      default: "Student",
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    staffId: {
      type: String,
      unique: true,
      sparse: true, // Allows null values
    },

    matricNo: {
      type: String,
      unique: true,
      sparse: true, // For students
    }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
