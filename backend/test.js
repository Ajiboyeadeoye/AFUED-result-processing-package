import * as XLSX from "xlsx";
import fs from "fs";

const fileBuffer = fs.readFileSync("CSC 103.xlsx");
const workbook = XLSX.read(fileBuffer, { type: "buffer" });

// Get the first sheet
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const headers = data[10];
console.log("Headers:", headers);