import dotenv from "dotenv";
import mongoose from "mongoose";
import { MongoClient } from "mongodb";

// dotenv.config();
dotenv.config({ path: "../.env" });

// uri
let { MONGODB_URI, MONGODB_URI2 } = process.env;
MONGODB_URI2 = MONGODB_URI
async function run() {
    try {
        console.log(MONGODB_URI2)
        const client = new MongoClient(MONGODB_URI2);
        console.log(MONGODB_URI2)
        await client.connect();

    const db = client.db("test"); // your DB name
    const students = db.collection("students");

    console.log("📌 Connected. Fetching indexes...");
    const indexes = await students.indexes();
    console.log(indexes);

    console.log("🗑 Attempting to drop index userId_1...");
    await students.dropIndex("userId_1");

    console.log("✅ Index userId_1 dropped successfully!");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
    console.log("🔌 Connection closed.");
  }
}

run();
