import mongoose from "mongoose";
import courseModel from "../domain/course/course.model.js";
// import Course from "./models/Course.js"; // adjust path if needed

// TODO: Replace with real ObjectIds from your DB
const departmentId = "68f9fff1f6606ce32d8de13e";
const facultyId = null;  
const userId = null;

const rawCourses = [
  {
    "courseCode": "CSC 101",
    "title": "Introduction to Computing Sciences",
    "unit": 3,
    "type": "Core",
    "level": 100,
    "semester": 1
  },
  {
    "courseCode": "CSC 103",
    "title": "Computer Application Packages I",
    "unit": 1,
    "type": "Core",
    "level": 100,
    "semester": 1
  },
  {
    "courseCode": "CSC 102",
    "title": "Problem Solving",
    "unit": 3,
    "type": "Core",
    "level": 100,
    "semester": 2
  },
  {
    "courseCode": "CSC 104",
    "title": "Basic Concepts of Programming",
    "unit": 3,
    "type": "Core",
    "level": 100,
    "semester": 2
  },
  {
    "courseCode": "CSC 106",
    "title": "Computer Application Packages II",
    "unit": 1,
    "type": "Core",
    "level": 100,
    "semester": 2
  },
  {
    "courseCode": "CSC 201",
    "title": "Computer Programming I",
    "unit": 3,
    "type": "Core",
    "level": 200,
    "semester": 1
  },
  {
    "courseCode": "CSC 203",
    "title": "Discrete Structures",
    "unit": 2,
    "type": "Core",
    "level": 200,
    "semester": 1
  },
  {
    "courseCode": "CSC 207",
    "title": "Introduction to Web Technologies",
    "unit": 2,
    "type": "Core",
    "level": 200,
    "semester": 1
  },
  {
    "courseCode": "CSC 211",
    "title": "Digital Logic Design",
    "unit": 2,
    "type": "Core",
    "level": 200,
    "semester": 1
  },
  {
    "courseCode": "CSC 213",
    "title": "Introduction to Software Engineering",
    "unit": 2,
    "type": "Core",
    "level": 200,
    "semester": 1
  },
  {
    "courseCode": "CSC 202",
    "title": "Computer Programming II",
    "unit": 3,
    "type": "Core",
    "level": 200,
    "semester": 2
  },
  {
    "courseCode": "CSC 214",
    "title": "Human-Computer Interaction",
    "unit": 2,
    "type": "Core",
    "level": 200,
    "semester": 2
  },
  {
    "courseCode": "CSC 301",
    "title": "Data Structures",
    "unit": 3,
    "type": "Core",
    "level": 300,
    "semester": 1
  },
  {
    "courseCode": "CSC 303",
    "title": "Introduction to Cyber Security and Strategy",
    "unit": 2,
    "type": "Core",
    "level": 300,
    "semester": 1
  },
  {
    "courseCode": "CSC 305",
    "title": "Data Communication System & Network",
    "unit": 3,
    "type": "Core",
    "level": 300,
    "semester": 1
  },
  {
    "courseCode": "CSC 309",
    "title": "Artificial Intelligence",
    "unit": 2,
    "type": "Core",
    "level": 300,
    "semester": 1
  },
  {
    "courseCode": "CSC 304",
    "title": "Data Management I",
    "unit": 3,
    "type": "Core",
    "level": 300,
    "semester": 2
  },
  {
    "courseCode": "CSC 308",
    "title": "Operating Systems II",
    "unit": 3,
    "type": "Core",
    "level": 300,
    "semester": 2
  },
  {
    "courseCode": "CSC 401",
    "title": "Algorithms and Complexity Analysis",
    "unit": 2,
    "type": "Core",
    "level": 400,
    "semester": 1
  },
  {
    "courseCode": "CSC 497",
    "title": "Final Year Project I",
    "unit": 3,
    "type": "Core",
    "level": 400,
    "semester": 1
  },
  {
    "courseCode": "CSC 498",
    "title": "Final Year Project II",
    "unit": 3,
    "type": "Core",
    "level": 400,
    "semester": 2
  }
];

// normalize + map to schema format
const prepareData = raw =>
  raw.map(c => ({
    courseCode: c.courseCode.toUpperCase(),
    title: c.title,
    unit: c.unit,
    level: c.level,
    semester: c.semester === 1 ? "first" : "second",
    type: c.type.toLowerCase() === "core" ? "core" : "elective",
    department: departmentId,
    faculty: facultyId,
    createdBy: userId,
    description: "",
  }));

async function seed() {
  try {
const { MONGODB_URI, MONGODB_URI2 } = process.env;

    // const {MO}
    await mongoose.connect("mongodb://localhost:27017/afued_db");
    console.log("Connected to DB");

    const courses = prepareData(rawCourses);

    await courseModel.insertMany(courses);
    console.log("Courses seeded successfully!");

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

async function deleteCoursesBeforeYesterday() {
  try {
    // await mongoose.connect("mongodb://127.0.0.1:27017/YOUR_DB_NAME");
    await mongoose.connect("mongodb://localhost:27017/afued_db");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const result = await courseModel.deleteMany({
      createdAt: { $lt: yesterday }
    });

    console.log(`Deleted ${result.deletedCount} old courses`);
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

deleteCoursesBeforeYesterday();

// seed();
