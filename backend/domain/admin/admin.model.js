import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    admin_id: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "admin",
    },
    phone: {
      type: String,
      default: "",
    },
    department: {
      type: String,
      default: "",
    },
    token: {
      type: String,
      default: "",
    },
    last_login: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// 📌 Middleware: Update last_login automatically when token changes
AdminSchema.pre("save", function (next) {
  if (this.isModified("token")) {
    this.last_login = new Date();
  }
  next();
});

const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

export default Admin;
