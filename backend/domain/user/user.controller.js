import User from "./user.model.js";
import { hashData, verifyHashedData } from "../../utils/hashData.js";
import createToken from "../../utils/createToken.js";
import Admin from "../admin/admin.model.js";

// import Admin from "../models/admin.model.js";

const authenticateAdmin = async (data) => {
  try {
    const { admin_id, email, password } = data;

    if (!password || (!admin_id && !email)) {
      throw new Error("Please provide Admin ID or Email, and Password");
    }

    // 🧠 Step 1: Find admin by ID (default) or email
    const query = admin_id
      ? { admin_id: admin_id.trim().toUpperCase() }
      : { email: email.trim().toLowerCase() };

    const fetchedAdmin = await Admin.findOne(query);

    if (!fetchedAdmin) {
      throw new Error(
        admin_id
          ? "Admin with this ID does not exist!"
          : "Admin with this email does not exist!"
      );
    }

    // 🔒 Step 2: Validate password
    const passwordMatch = await verifyHashedData(
      password,
      fetchedAdmin.password
    );

    if (!passwordMatch) {
      throw new Error("Invalid password");
    }

    // 🎟️ Step 3: Create login token
    const tokenData = {
      adminId: fetchedAdmin._id,
      admin_id: fetchedAdmin.admin_id,
      email: fetchedAdmin.email,
      role: "admin",
    };

    const token = await createToken(tokenData);

    // 🧾 Step 4: Attach token to admin
    fetchedAdmin.token = token;

    // ✅ Step 5: Return admin info safely
    return {
      status: "success",
      message: "Admin authenticated successfully",
      admin: {
        id: fetchedAdmin._id,
        admin_id: fetchedAdmin.admin_id,
        email: fetchedAdmin.email,
        name: fetchedAdmin.name,
        role: fetchedAdmin.role,
        token,
      },
    };
  } catch (error) {
    throw new Error(error.message || "Admin authentication failed");
  }
};


const createNewUser = async (data) => {
  try {
    const { name, email, password, role } = data;

    // 🔁 Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("User with this email already exists, please login...");
    }

    // 🔒 Hash password
    const hashedPassword = await hashData(password);

    // 🆕 Create and save new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role
    });
    
    const createdUser = await newUser.save();
    return createdUser;
  } catch (error) {
    throw error;
  }
  
};

export { createNewUser, authenticateAdmin };
