// import * as XLSX from "xlsx";
// import fs from "fs";

// const fileBuffer = fs.readFileSync("CSC 103.xlsx");
// const workbook = XLSX.read(fileBuffer, { type: "buffer" });

// // Get the first sheet
// const sheetName = workbook.SheetNames[0];
// const sheet = workbook.Sheets[sheetName];
// const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
// const headers = data[10];
// console.log("Headers:", headers);

import mongoose from "mongoose";

async function removeUserIdIndex() {
  try {
    await mongoose.connect("mongodb://localhost:27017/afued_db", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const collection = mongoose.connection.collection("lecturers");

    const indexes = await collection.indexes();
    const hasUserIdIndex = indexes.some(index => index.name === "userId_1");

    if (hasUserIdIndex) {
      await collection.dropIndex("userId_1");
      console.log("✅ userId index dropped successfully!");
    } else {
      console.log("ℹ️ userId index does not exist.");
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

removeUserIdIndex();
