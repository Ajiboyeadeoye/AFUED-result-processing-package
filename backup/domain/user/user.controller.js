import User from "./user.model.js";
import { hashData, verifyHashedData } from "../../utils/hashData.js";
import createToken from "../../utils/createToken.js";

const authenticateUser = async (data) => {
  try {
    const { email, password } = data;

    // ✅ Check if user exists
    const fetchedUser = await User.findOne({ email });
    if (!fetchedUser) {
      throw new Error("User with the provided email does not exist, try signing up!");
    }

    // 🔑 Password validation
    const hashedPassword = fetchedUser.password;
    const passwordMatch = await verifyHashedData(password, hashedPassword);

    if (!passwordMatch) {
      throw new Error("Invalid password");
    }

    // 🎟️ Create user token for login
    const tokenData = { userId: fetchedUser._id, email, role: fetchedUser.role };
    console.log("Role:", fetchedUser.role);
    const token = await createToken(tokenData);

    // 🏷️ Attach token to user
    fetchedUser.token = token;
    return fetchedUser;
  } catch (error) {
    throw error;
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

export { createNewUser, authenticateUser };
