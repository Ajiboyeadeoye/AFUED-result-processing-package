import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

// uri
const { MONGODB_URI, MONGODB_URI2 } = process.env;

// connect to db
const connectToDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI2);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
  }
};

connectToDB();

export default connectToDB;
