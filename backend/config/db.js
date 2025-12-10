import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const { MONGODB_URI2 } = process.env;

let isConnected = false;

const connectToDB = async () => {
  try {
    if (isConnected) {
      return mongoose.connection;
    }

    console.log(MONGODB_URI2);

    await mongoose.connect(MONGODB_URI2, {
      maxPoolSize: 20,
    });

    isConnected = true;

    console.log("✅ Connected to MongoDB");

    return mongoose.connection;
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
    throw error;
  }
};

export default connectToDB;
