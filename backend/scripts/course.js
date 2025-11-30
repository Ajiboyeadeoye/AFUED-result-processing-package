import mongoose from "mongoose";
import dotenv from "dotenv";
import readline from "readline";
import User from "../domain/user/user.model.js";
import Student from "../domain/student/student.model.js";
import departmentModel from "../domain/department/department.model.js";
import Semester from "../domain/semester/semester.model.js";
import courseModel from "../domain/course/course.model.js";
import { hashData } from "../utils/hashData.js";
// import { hashData } from "../utils/auth.js";
// 
dotenv.config({ path: "../.env" });

let { MONGODB_URI, MONGODB_URI2 } = process.env;
MONGODB_URI = MONGODB_URI2
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// ==================== COURSE DATA EXTRACTION ====================

// Comprehensive course data for all departments
const departmentCourses = {
  "BIOLOGY": {
    "100": {
      "first": [
        { courseCode: "BIO 101", title: "General Biology I", unit: 2, type: "Core" },
        { courseCode: "BIO 105", title: "Laboratory Management", unit: 2, type: "Core" },
        { courseCode: "BIO 107", title: "General Biology Practical I", unit: 1, type: "Core" }
      ],
      "second": [
        { courseCode: "BIO 102", title: "General Biology II", unit: 1, type: "Core" },
        { courseCode: "BIO 104", title: "Applied Biology", unit: 2, type: "Core" },
        { courseCode: "BIO 108", title: "General Biology Practical II", unit: 1, type: "Core" },
        { courseCode: "BIO 112", title: "Basic Principles of Biology", unit: 2, type: "Core" }
      ]
    },
    "200": {
      "first": [
        { courseCode: "BIO 201", title: "Genetics I", unit: 2, type: "Core" },
        { courseCode: "BIO 203", title: "General Physiology", unit: 2, type: "Core" },
        { courseCode: "BIO 205", title: "Introductory Developmental/Cell Biology", unit: 2, type: "Core" },
        { courseCode: "MCB 221", title: "General Microbiology", unit: 2, type: "Core" },
        { courseCode: "BCH 201", title: "General Biochemistry", unit: 2, type: "Core" },
        { courseCode: "BOT 203", title: "Seed Plant", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "BIO 202", title: "Introductory Ecology", unit: 2, type: "Core" },
        { courseCode: "BIO 204", title: "Biological Techniques", unit: 2, type: "Core" },
        { courseCode: "BIO 206", title: "Hydrobiology", unit: 2, type: "Core" },
        { courseCode: "BIO 208", title: "Biostatistics", unit: 2, type: "Core" },
        { courseCode: "BOT 202", title: "Seedless Plant", unit: 2, type: "Core" },
        { courseCode: "SED 202", title: "Biology Method I", unit: 2, type: "Core" }
      ]
    },
    "300": {
      "first": [
        { courseCode: "BIO 301", title: "Genetics II", unit: 2, type: "Core" },
        { courseCode: "BIO 303", title: "Biogeography and Soil Biology", unit: 2, type: "Core" },
        { courseCode: "BIO 307", title: "Field Course I", unit: 1, type: "Core" },
        { courseCode: "BOT 303", title: "Plant Physiology", unit: 3, type: "Core" },
        { courseCode: "ZOO 301", title: "Vertebrate Zoology", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "BIO 302", title: "Population Biology and Evolution", unit: 2, type: "Core" },
        { courseCode: "BIO 304", title: "Nigerian Flora and Fauna", unit: 2, type: "Core" },
        { courseCode: "BIO 306", title: "Systematic Biology", unit: 2, type: "Core" },
        { courseCode: "SED 302", title: "General Biology Method II", unit: 2, type: "Core" }
      ]
    },
    "400": {
      "first": [
        { courseCode: "BIO 403", title: "Wildlife Conservation and Management", unit: 2, type: "Core" },
        { courseCode: "BIO 407", title: "Field Course II", unit: 1, type: "Core" },
        { courseCode: "BIO 413", title: "Bioinformatics", unit: 2, type: "Core" },
        { courseCode: "BOT 407", title: "Plant Reproduction", unit: 3, type: "Core" },
        { courseCode: "ZOO 411", title: "Entomology", unit: 2, type: "Core" },
        { courseCode: "ZOO 421", title: "Introductory Parasitology", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "BIO 402", title: "Principles of Plant and Animal Breeding", unit: 2, type: "Core" },
        { courseCode: "BIO 404", title: "Nigerian Plants and Animals in Prophylactics and Therapeutics", unit: 2, type: "Core" },
        { courseCode: "BIO 406", title: "Principles of Pest Management", unit: 2, type: "Core" },
        { courseCode: "BIO 408", title: "Applied Biotechnology", unit: 2, type: "Core" },
        { courseCode: "BIO 410", title: "Bio-Entrepreneurship", unit: 2, type: "Core" },
        { courseCode: "BIO 414", title: "Molecular Biology", unit: 2, type: "Core" }
      ]
    }
  },

  "CHEMISTRY": {
    "100": {
      "first": [
        { courseCode: "CHM 101", title: "General Chemistry I (Inorganic)", unit: 2, type: "Core" },
        { courseCode: "CHM 107", title: "General Chemistry Practical I", unit: 1, type: "Core" }
      ],
      "second": [
        { courseCode: "CHM 102", title: "General Chemistry II (Organic)", unit: 2, type: "Core" },
        { courseCode: "CHM 104", title: "Chemistry Laboratory Techniques and Safety", unit: 2, type: "Core" },
        { courseCode: "CHM 106", title: "Application of Mathematics to Chemistry", unit: 2, type: "Core" },
        { courseCode: "CHM 108", title: "General Chemistry Practical II", unit: 1, type: "Core" }
      ]
    },
    "200": {
      "first": [
        { courseCode: "CHM 204", title: "Liquid State and Colloids", unit: 2, type: "Core" },
        { courseCode: "CHM 207", title: "General Chemistry Practical III", unit: 1, type: "Core" },
        { courseCode: "CHM 211", title: "Organic Chemistry I", unit: 2, type: "Core" },
        { courseCode: "CHM 213", title: "Analytical Chemistry I", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "CHM 206", title: "Chemistry Methodology", unit: 2, type: "Core" },
        { courseCode: "CHM 208", title: "General Chemistry Practical IV", unit: 1, type: "Core" },
        { courseCode: "CHM 210", title: "Physical Chemistry I", unit: 2, type: "Core" },
        { courseCode: "CHM 212", title: "Inorganic Chemistry I", unit: 2, type: "Core" },
        { courseCode: "CHM 214", title: "Structure And Bonding", unit: 2, type: "Core" }
      ]
    },
    "300": {
      "first": [
        { courseCode: "CHM 301", title: "Physical Chemistry II", unit: 2, type: "Core" },
        { courseCode: "CHM 303", title: "Organic Chemistry II", unit: 2, type: "Core" },
        { courseCode: "CHM 319", title: "Environmental Chemistry", unit: 2, type: "Core" },
        { courseCode: "CHM 321", title: "Natural Product Chemistry I", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "CHM 302", title: "Inorganic Chemistry II", unit: 2, type: "Core" },
        { courseCode: "CHM 304", title: "Atomic & Molecular Structure & Symmetry", unit: 2, type: "Core" },
        { courseCode: "CHM 312", title: "Analytical atomic spectroscopy", unit: 2, type: "Core" },
        { courseCode: "CHM 314", title: "Entrepreneurship skill in Chemistry", unit: 2, type: "Core" },
        { courseCode: "CHM 316", title: "Applied spectroscopy", unit: 2, type: "Core" },
        { courseCode: "CHM 322", title: "Chemical Thermodynamics", unit: 1, type: "Core" }
      ]
    },
    "400": {
      "first": [
        { courseCode: "CHM 401", title: "Nuclear Chemistry", unit: 2, type: "Core" },
        { courseCode: "CHM 423", title: "Organometallic Chemistry", unit: 2, type: "Core" },
        { courseCode: "CHM 425", title: "Natural Product Chemistry II", unit: 2, type: "Core" },
        { courseCode: "CHM 431", title: "Quantum Chemistry", unit: 2, type: "Core" },
        { courseCode: "CHM 433", title: "Transition Metal Chemistry", unit: 3, type: "Core" }
      ],
      "second": [
        { courseCode: "CHM 320", title: "Chemistry of Carbohydrate and Macromolecules", unit: 2, type: "Core" },
        { courseCode: "CHM 400", title: "Seminar", unit: 2, type: "Core" },
        { courseCode: "CHM 406", title: "Reaction Kinetics", unit: 2, type: "Core" },
        { courseCode: "CHM 410", title: "Analytical Chemistry II", unit: 2, type: "Core" },
        { courseCode: "CHM 424", title: "Coordination Chemistry", unit: 2, type: "Core" },
        { courseCode: "CHM 426", title: "Organic Reaction and Synthesis", unit: 2, type: "Core" }
      ]
    }
  },

  "COMPUTER SCIENCE": {
    "100": {
      "first": [
        { courseCode: "CSC 101", title: "Introduction to Computing Sciences", unit: 3, type: "Core" },
        { courseCode: "CSC 103", title: "Computer Application Packages I", unit: 1, type: "Core" }
      ],
      "second": [
        { courseCode: "CSC 102", title: "Problem Solving", unit: 3, type: "Core" },
        { courseCode: "CSC 104", title: "Basic Concepts of Programming", unit: 2, type: "Core" },
        { courseCode: "CSC 106", title: "Computer Application Packages II", unit: 1, type: "Core" }
      ]
    },
    "200": {
      "first": [
        { courseCode: "CSC 201", title: "Computer Programming I", unit: 3, type: "Core" },
        { courseCode: "CSC 203", title: "Discrete Structures", unit: 2, type: "Core" },
        { courseCode: "CSC 207", title: "Introduction to Web Technologies", unit: 2, type: "Core" },
        { courseCode: "CSC 211", title: "Digital Logic Design", unit: 2, type: "Core" },
        { courseCode: "CSC 213", title: "Introduction to Software Engineering", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "CSC 202", title: "Computer Programming II", unit: 3, type: "Core" },
        { courseCode: "CSC 204", title: "Systems Analysis and Design", unit: 2, type: "Core" },
        { courseCode: "CSC 212", title: "Computer Architecture and Organization", unit: 2, type: "Core" },
        { courseCode: "CSC 214", title: "Human-Computer Interaction", unit: 2, type: "Core" },
        { courseCode: "CSC 216", title: "The Teaching of Computer Science", unit: 1, type: "Core" }
      ]
    },
    "300": {
      "first": [
        { courseCode: "CSC 301", title: "Data Structures", unit: 2, type: "Core" },
        { courseCode: "CSC 303", title: "Introduction to Cyber Security and Strategy", unit: 2, type: "Core" },
        { courseCode: "CSC 305", title: "Data Communication System & Network", unit: 3, type: "Core" },
        { courseCode: "CSC 309", title: "Artificial Intelligence", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "CSC 304", title: "Data Management I", unit: 3, type: "Core" },
        { courseCode: "CSC 308", title: "Operating Systems II", unit: 2, type: "Core" },
        { courseCode: "CSC 322", title: "Computer Science Innovation and New Technologies", unit: 2, type: "Core" }
      ]
    },
    "400": {
      "first": [
        { courseCode: "CSC 401", title: "Algorithms and Complexity Analysis", unit: 2, type: "Core" },
        { courseCode: "CSC 403", title: "Project Management", unit: 2, type: "Core" },
        { courseCode: "CSC 407", title: "Seminar", unit: 2, type: "Core" },
        { courseCode: "CSC 409", title: "Research Methodology and Technical Report Writing", unit: 2, type: "Core" },
        { courseCode: "CSC 431", title: "Distributed Computing Systems", unit: 2, type: "Core" },
        { courseCode: "CSC 497", title: "Final Year Project I", unit: 3, type: "Core" }
      ],
      "second": [
        { courseCode: "CSC 402", title: "Ethics and Legal Issues in Computer Science", unit: 1, type: "Core" },
        { courseCode: "CSC 408", title: "Modeling and Simulation", unit: 2, type: "Core" },
        { courseCode: "CSC 442", title: "Wireless Communications and Networking", unit: 2, type: "Core" },
        { courseCode: "CSC 446", title: "Electronic Learning Methodology", unit: 2, type: "Core" },
        { courseCode: "CSC 448", title: "Computer Science Innovation and New Technologies", unit: 2, type: "Core" },
        { courseCode: "CSC 498", title: "Final Year Project II", unit: 3, type: "Core" }
      ]
    }
  },

  "MATHEMATICS": {
    "100": {
      "first": [
        { courseCode: "MTH 101", title: "Elementary Mathematics I", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "MTH 102", title: "Elementary Mathematics II", unit: 2, type: "Core" },
        { courseCode: "MTH 104", title: "Elementary Mathematics III", unit: 2, type: "Core" }
      ]
    },
    "200": {
      "first": [
        { courseCode: "MTH 201", title: "Mathematical Methods I", unit: 2, type: "Core" },
        { courseCode: "MTH 203", title: "Linear Algebra I", unit: 2, type: "Core" },
        { courseCode: "MTH 205", title: "Sets, Logic and Algebra I", unit: 2, type: "Core" },
        { courseCode: "MTH 207", title: "Real Analysis I", unit: 2, type: "Core" },
        { courseCode: "MTH 209", title: "Introduction to Numerical Analysis", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "MTH 202", title: "Elementary Differential Equations", unit: 2, type: "Core" },
        { courseCode: "MTH 204", title: "Linear Algebra II", unit: 1, type: "Core" },
        { courseCode: "MTH 210", title: "Vector Analysis", unit: 1, type: "Core" }
      ]
    },
    "300": {
      "first": [
        { courseCode: "MTH 300", title: "Abstract Algebra I", unit: 2, type: "Core" },
        { courseCode: "MTH 301", title: "Metric Space Topology", unit: 2, type: "Core" },
        { courseCode: "MTH 303", title: "Vector and Tensor Analysis", unit: 2, type: "Core" },
        { courseCode: "MTH 305", title: "Complex Analysis I", unit: 2, type: "Core" },
        { courseCode: "MTH 307", title: "Real Analysis II", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "MTH 302", title: "Ordinary Differential Equations", unit: 2, type: "Core" },
        { courseCode: "MTH 310", title: "Mathematical Methods II", unit: 2, type: "Core" }
      ]
    },
    "400": {
      "first": [
        { courseCode: "MTH 401", title: "Theory of Ordinary Differential Equations", unit: 2, type: "Core" },
        { courseCode: "MTH 403", title: "Functional Analysis", unit: 2, type: "Core" },
        { courseCode: "MTH 405", title: "General Topology", unit: 2, type: "Core" },
        { courseCode: "MTH 407", title: "Mathematical Methods III", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "MTH 304", title: "Abstract Algebra II", unit: 2, type: "Core" },
        { courseCode: "MTH 316", title: "Complex Analysis II", unit: 2, type: "Core" },
        { courseCode: "MTH 308", title: "Introduction to Mathematical Modelling", unit: 2, type: "Core" },
        { courseCode: "MTH 402", title: "Theory Of Partial Differential Equations", unit: 2, type: "Core" },
        { courseCode: "MTH 414", title: "Algebraic Topology", unit: 2, type: "Core" }
      ]
    }
  },

  "PHYSICS": {
    "100": {
      "first": [
        { courseCode: "PHY 101", title: "General Physics I", unit: 2, type: "Core" },
        { courseCode: "PHY 103", title: "General Physics III", unit: 2, type: "Core" },
        { courseCode: "PHY 107", title: "General Physics Practical I", unit: 1, type: "Core" }
      ],
      "second": [
        { courseCode: "PHY 102", title: "General Physics II", unit: 2, type: "Core" },
        { courseCode: "PHY 104", title: "General Physics IV", unit: 2, type: "Core" },
        { courseCode: "PHY 108", title: "General Physics Practical II", unit: 1, type: "Core" }
      ]
    },
    "200": {
      "first": [
        { courseCode: "PHY 201", title: "General Physics V (Modern Physics)", unit: 2, type: "Core" },
        { courseCode: "PHY 205", title: "Thermal Physics", unit: 3, type: "Core" },
        { courseCode: "PHY 207", title: "General Practical Physics III", unit: 1, type: "Core" },
        { courseCode: "PHY 211", title: "Workshop Practice", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "PHY 202", title: "Introduction To Electronic Circuits And Electronics", unit: 2, type: "Core" },
        { courseCode: "PHY 204", title: "General Physics VI (Waves and Optics)", unit: 2, type: "Core" },
        { courseCode: "PHY 206", title: "General Physics VII (Energy & Environment)", unit: 2, type: "Core" },
        { courseCode: "PHY 208", title: "General Physics Practical IV", unit: 1, type: "Core" }
      ]
    },
    "300": {
      "first": [
        { courseCode: "PHY 301", title: "Analytical Mechanics I", unit: 3, type: "Core" },
        { courseCode: "PHY 303", title: "Electromagnetism", unit: 3, type: "Core" },
        { courseCode: "PHY 305", title: "Quantum Physics", unit: 3, type: "Core" },
        { courseCode: "PHY 307", title: "General Physics Practical V", unit: 1, type: "Core" }
      ],
      "second": [
        { courseCode: "PHY 304", title: "Electromagnetic Waves and Optics", unit: 3, type: "Core" },
        { courseCode: "PHY 306", title: "Statistical and Thermal Physics I", unit: 3, type: "Core" },
        { courseCode: "PHY 308", title: "General Physics Practical VI", unit: 1, type: "Core" }
      ]
    },
    "400": {
      "first": [
        { courseCode: "PHY 401", title: "Quantum Mechanics I", unit: 3, type: "Core" },
        { courseCode: "PHY 403", title: "Mathematical Methods in Physics I", unit: 3, type: "Core" },
        { courseCode: "PHY 405", title: "Physics Entrepreneurship", unit: 2, type: "Core" },
        { courseCode: "PHY 451", title: "Atmospheric Physics I", unit: 2, type: "Core" }
      ],
      "second": [
        { courseCode: "PHY 402", title: "Quantum Mechanics II", unit: 3, type: "Core" },
        { courseCode: "PHY 404", title: "Mathematical Methods in Physics II", unit: 3, type: "Core" },
        { courseCode: "PHY 425", title: "Solid State Physics", unit: 3, type: "Core" },
        { courseCode: "PHY 452", title: "Atmospheric Physics II", unit: 2, type: "Core" },
        { courseCode: "PHY 454", title: "Computational Physics", unit: 2, type: "Core" },
        { courseCode: "PHY 490", title: "Seminar", unit: 1, type: "Core" }
      ]
    }
  }
};

// General Studies and Education courses (common to all departments)
const generalCourses = {
  "GST": [
    { courseCode: "GST 111", title: "Communication in English", unit: 2, type: "Core", level: 100, semester: "first" },
    { courseCode: "GST 112", title: "Nigerian Peoples and Culture", unit: 2, type: "Core", level: 100, semester: "second" },
    { courseCode: "GST 212", title: "Philosophy, Logic and Human Existence", unit: 2, type: "Core", level: 200, semester: "second" },
    { courseCode: "GST 312", title: "Peace and Conflict Resolution", unit: 2, type: "Core", level: 300, semester: "second" }
  ],
  "EDU": [
    { courseCode: "EDU 101", title: "Introduction to Teaching and Foundations of Education", unit: 2, type: "Core", level: 100, semester: "first" },
    { courseCode: "EDU 201", title: "Curriculum, Curriculum Delivery and General Teaching Methods", unit: 2, type: "Core", level: 200, semester: "first" },
    { courseCode: "EDU 301", title: "Teaching Practice I", unit: 3, type: "Core", level: 300, semester: "first" },
    { courseCode: "EDU 302", title: "Educational Measurements, Tests, Research Methods and Statistics", unit: 3, type: "Core", level: 300, semester: "second" },
    { courseCode: "EDU 401", title: "Teaching Practice II", unit: 3, type: "Core", level: 400, semester: "first" },
    { courseCode: "EDU 400", title: "Project", unit: 3, type: "Core", level: 400, semester: "second" }
  ],
  "ENT": [
    { courseCode: "ENT 211", title: "Entrepreneurship and Innovation", unit: 2, type: "Core", level: 200, semester: "first" },
    { courseCode: "ENT 312", title: "Venture Creation", unit: 2, type: "Core", level: 300, semester: "second" }
  ]
};

// Department code mapping
const departmentCodes = {
  "COMPUTER SCIENCE": "CSC",
  "PHYSICS": "PHS", 
  "MATHEMATICS": "MAT",
  "BIOLOGY": "BIO",
  "CHEMISTRY": "CHM"
};

// Student data organized by department
const studentData = {
  "COMPUTER SCIENCE": [
    { name: "Adewale Ojo", matricNumber: "CSC/2024/0001D" },
    { name: "Adegbenro Kayode", matricNumber: "CSC/2024/0002D" },
    { name: "Adekemi Tayo", matricNumber: "CSC/2024/0003D" },
    { name: "Akingade Tope", matricNumber: "CSC/2024/0004D" },
    { name: "Akintope Femi", matricNumber: "CSC/2024/0005D" },
    { name: "Fakunle Yolade", matricNumber: "CSC/2024/0006D" },
    { name: "Falope Dayo", matricNumber: "CSC/2024/0007D" },
    { name: "Sunday Dare", matricNumber: "CSC/2024/0008D" },
    { name: "Suzan James", matricNumber: "CSC/2024/0009D" },
    { name: "David Gbenga", matricNumber: "CSC/2024/0010D" },
    { name: "Hellen John", matricNumber: "CSC/2024/0012D" },
    { name: "Kayode John", matricNumber: "CSC/2024/0013D" },
    { name: "Queen Tayo", matricNumber: "CSC/2024/0014D" },
    { name: "Zarah Tope", matricNumber: "CSC/2024/0015D" },
    { name: "Mathew Femi", matricNumber: "CSC/2024/0016D" },
    { name: "Hellen Joel", matricNumber: "CSC/2024/0017D" },
    { name: "Kayode Ibrahin", matricNumber: "CSC/2024/0018D" },
    { name: "Quidril Tayo", matricNumber: "CSC/2024/0019D" },
    { name: "Zarubal Tope", matricNumber: "CSC/2024/0011D" },
    { name: "Mathew Fehinti", matricNumber: "CSC/2024/0020D" }
  ],
  "PHYSICS": [
    { name: "Adetale Olupo", matricNumber: "PHS/2024/0001D" },
    { name: "Benson Kayode", matricNumber: "PHS/2024/0002D" },
    { name: "Adewumii Ayo", matricNumber: "PHS/2024/0003D" },
    { name: "Akugade Tope", matricNumber: "PHS/2024/0004D" },
    { name: "Lintope Semiyu", matricNumber: "PHS/2024/0005D" },
    { name: "Fakunle Yetunde", matricNumber: "PHS/2024/0006D" },
    { name: "Fapetu Dayo", matricNumber: "PHS/2024/0007D" },
    { name: "Sunday Lasisi", matricNumber: "PHS/2024/0008D" },
    { name: "Sunday James", matricNumber: "PHS/2024/0009D" },
    { name: "David Blessing", matricNumber: "PHS/2024/0010D" },
    { name: "Allyson Johson", matricNumber: "PHS/2024/0011D" },
    { name: "Kaye James", matricNumber: "PHS/2024/0012D" },
    { name: "Tayo Titi", matricNumber: "PHS/2024/0013D" },
    { name: "Zarah Tinto", matricNumber: "PHS/2024/0014D" },
    { name: "Mathew Kemi", matricNumber: "PHS/2024/0015D" },
    { name: "Hellen Joseph", matricNumber: "PHS/2024/0016D" },
    { name: "Abraham Ibrahin", matricNumber: "PHS/2024/0017D" },
    { name: "Abraham Tayo", matricNumber: "PHS/2024/0018D" },
    { name: "Zaruba Kemi", matricNumber: "PHS/2024/0019D" },
    { name: "Mathew Olulari", matricNumber: "PHS/2024/0020D" }
  ],
  "MATHEMATICS": [
    { name: "James Okoye", matricNumber: "MAT/2024/0001D" },
    { name: "Felicia Adeyemi", matricNumber: "MAT/2024/0002D" },
    { name: "Michael Danjuma", matricNumber: "MAT/2024/0003D" },
    { name: "Olivia Bassey", matricNumber: "MAT/2024/0004D" },
    { name: "Samuel Olorunfemi", matricNumber: "MAT/2024/0005D" },
    { name: "Rita Chukwura", matricNumber: "MAT/2024/0006D" },
    { name: "John Eze", matricNumber: "MAT/2024/0007D" },
    { name: "Miriam Olatunde", matricNumber: "MAT/2024/0008D" },
    { name: "Victor Suleiman", matricNumber: "MAT/2024/0009D" },
    { name: "Amara Mgbechi", matricNumber: "MAT/2024/0010D" },
    { name: "Emmanuel Nwachukwu", matricNumber: "MAT/2024/0011D" },
    { name: "Blessing Adediran", matricNumber: "MAT/2024/0012D" },
    { name: "Chris Obiakor", matricNumber: "MAT/2024/0013D" },
    { name: "Patience Omoregie", matricNumber: "MAT/2024/0014D" },
    { name: "David Akintola", matricNumber: "MAT/2024/0015D" },
    { name: "Gloria Oche", matricNumber: "MAT/2024/0016D" },
    { name: "Anthony Ifeanyi", matricNumber: "MAT/2024/0017D" },
    { name: "Joy Udom", matricNumber: "MAT/2024/0018D" },
    { name: "Stephen Alabi", matricNumber: "MAT/2024/0019D" },
    { name: "Khadija Usman", matricNumber: "MAT/2024/0020D" }
  ],
  "BIOLOGY": [
    { name: "James Okoye", matricNumber: "BIO/2024/0001D" },
    { name: "Felicia Adeyemi", matricNumber: "BIO/2024/0002D" },
    { name: "Michael Danjuma", matricNumber: "BIO/2024/0003D" },
    { name: "Olivia Bassey", matricNumber: "BIO/2024/0004D" },
    { name: "Samuel Olorunfemi", matricNumber: "BIO/2024/0005D" },
    { name: "Rita Chukwura", matricNumber: "BIO/2024/0006D" },
    { name: "John Eze", matricNumber: "BIO/2024/0007D" },
    { name: "Miriam Olatunde", matricNumber: "BIO/2024/0008D" },
    { name: "Victor Suleiman", matricNumber: "BIO/2024/0009D" },
    { name: "Amara Mgbechi", matricNumber: "BIO/2024/0010D" },
    { name: "Emmanuel Nwachukwu", matricNumber: "BIO/2024/0011D" },
    { name: "Blessing Adediran", matricNumber: "BIO/2024/0012D" },
    { name: "Chris Obiakor", matricNumber: "BIO/2024/0013D" },
    { name: "Patience Omoregie", matricNumber: "BIO/2024/0014D" },
    { name: "David Akintola", matricNumber: "BIO/2024/0015D" },
    { name: "Gloria Oche", matricNumber: "BIO/2024/0016D" },
    { name: "Anthony Ifeanyi", matricNumber: "BIO/2024/0017D" },
    { name: "Joy Udom", matricNumber: "BIO/2024/0018D" },
    { name: "Stephen Alabi", matricNumber: "BIO/2024/0019D" },
    { name: "Khadija Usman", matricNumber: "BIO/2024/0020D" }
  ],
  "CHEMISTRY": [
    { name: "James Okoye", matricNumber: "CHM/2024/0001D" },
    { name: "Felicia Adeyemi", matricNumber: "CHM/2024/0002D" },
    { name: "Michael Danjuma", matricNumber: "CHM/2024/0003D" },
    { name: "Olivia Bassey", matricNumber: "CHM/2024/0004D" },
    { name: "Samuel Olorunfemi", matricNumber: "CHM/2024/0005D" },
    { name: "Rita Chukwura", matricNumber: "CHM/2024/0006D" },
    { name: "John Eze", matricNumber: "CHM/2024/0007D" },
    { name: "Miriam Olatunde", matricNumber: "CHM/2024/0008D" },
    { name: "Victor Suleiman", matricNumber: "CHM/2024/0009D" },
    { name: "Amara Mgbechi", matricNumber: "CHM/2024/0010D" },
    { name: "Emmanuel Nwachukwu", matricNumber: "CHM/2024/0011D" },
    { name: "Blessing Adediran", matricNumber: "CHM/2024/0012D" },
    { name: "Chris Obiakor", matricNumber: "CHM/2024/0013D" },
    { name: "Patience Omoregie", matricNumber: "CHM/2024/0014D" },
    { name: "David Akintola", matricNumber: "CHM/2024/0015D" },
    { name: "Gloria Oche", matricNumber: "CHM/2024/0016D" },
    { name: "Anthony Ifeanyi", matricNumber: "CHM/2024/0017D" },
    { name: "Joy Udom", matricNumber: "CHM/2024/0018D" },
    { name: "Stephen Alabi", matricNumber: "CHM/2024/0019D" },
    { name: "Khadija Usman", matricNumber: "CHM/2024/0020D" }
  ]
};

// ==================== COURSE MANAGEMENT FUNCTIONS ====================

const prepareData = (raw, departmentId, facultyId = null, userId = null) =>
  raw.map(c => ({
    courseCode: c.courseCode.toUpperCase(),
    title: c.title,
    unit: c.unit,
    level: c.level,
    semester: c.semester,
    type: c.type.toLowerCase() === "core" ? "core" : "elective",
    department: departmentId,
    faculty: facultyId,
    createdBy: userId,
    description: "",
  }));

async function seedAllDepartmentCourses() {
  try {
    console.log("\n🌱 Seeding All Department Courses");
    console.log("=================================");
    
    await mongoose.connect(MONGODB_URI2);
    console.log("✅ Connected to database");

    // Get all departments
    const departments = await departmentModel.find({});
    
    if (departments.length === 0) {
      console.log("❌ No departments found. Please create departments first.");
      return;
    }

    const departmentMap = {};
    departments.forEach(dept => {
      departmentMap[dept.name.toUpperCase()] = dept._id;
      departmentMap[dept.code] = dept._id;
    });

    let totalCoursesCreated = 0;

    // Process each department
    for (const [deptName, levels] of Object.entries(departmentCourses)) {
      console.log(`\n📚 Processing ${deptName} Department...`);
      
      const departmentId = departmentMap[deptName] || departmentMap[departmentCodes[deptName]];
      
      if (!departmentId) {
        console.log(`   ⚠️  No department found for ${deptName}. Skipping...`);
        continue;
      }

      let deptCoursesCreated = 0;

      // Process each level
      for (const [level, semesters] of Object.entries(levels)) {
        // Process each semester
        for (const [semester, courses] of Object.entries(semesters)) {
          const coursesWithLevel = courses.map(course => ({
            ...course,
            level: parseInt(level),
            semester: semester
          }));

          const preparedCourses = prepareData(coursesWithLevel, departmentId);
          
          try {
            await courseModel.insertMany(preparedCourses);
            console.log(`   ✅ Level ${level} ${semester} semester: ${courses.length} courses created`);
            deptCoursesCreated += courses.length;
            totalCoursesCreated += courses.length;
          } catch (error) {
            if (error.code === 11000) {
              console.log(`   ⚠️  Level ${level} ${semester} semester: Some courses already exist (skipped duplicates)`);
            } else {
              console.log(`   ❌ Level ${level} ${semester} semester: Error - ${error.message}`);
            }
          }
        }
      }

      console.log(`   📊 ${deptName}: ${deptCoursesCreated} courses created`);
    }

    console.log(`\n🎉 All Department Courses Seeding Complete!`);
    console.log(`   Total Courses Created: ${totalCoursesCreated}`);

  } catch (error) {
    console.error("❌ Error during course seeding:", error);
  }
}

async function seedDepartmentCourses() {
  try {
    console.log("\n🌱 Seeding Specific Department Courses");
    console.log("=====================================");
    
    await mongoose.connect(MONGODB_URI2);

    // Show available departments
    const departments = await departmentModel.find({});
    
    console.log("\nAvailable Departments:");
    departments.forEach((dept, index) => {
      console.log(`${index + 1}. ${dept.name} (${dept.code})`);
    });

    const deptChoice = await question("\nSelect department number: ");
    const selectedDept = departments[parseInt(deptChoice) - 1];
    
    if (!selectedDept) {
      console.log("❌ Invalid department selection.");
      return;
    }

    // Find department in our course data
    const deptKey = Object.keys(departmentCodes).find(
      key => departmentCodes[key] === selectedDept.code
    );

    if (!deptKey || !departmentCourses[deptKey]) {
      console.log(`❌ No course data found for ${selectedDept.name}`);
      return;
    }

    const levels = departmentCourses[deptKey];
    let totalCreated = 0;

    console.log(`\nSeeding courses for ${selectedDept.name}...`);

    // Process each level
    for (const [level, semesters] of Object.entries(levels)) {
      // Process each semester
      for (const [semester, courses] of Object.entries(semesters)) {
        const coursesWithLevel = courses.map(course => ({
          ...course,
          level: parseInt(level),
          semester: semester
        }));

        const preparedCourses = prepareData(coursesWithLevel, selectedDept._id);
        
        try {
          await courseModel.insertMany(preparedCourses);
          console.log(`   ✅ Level ${level} ${semester} semester: ${courses.length} courses created`);
          totalCreated += courses.length;
        } catch (error) {
          if (error.code === 11000) {
            console.log(`   ⚠️  Level ${level} ${semester} semester: Some courses already exist (skipped duplicates)`);
          } else {
            console.log(`   ❌ Level ${level} ${semester} semester: Error - ${error.message}`);
          }
        }
      }
    }

    console.log(`\n📊 ${selectedDept.name}: ${totalCreated} courses created`);

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

async function seedGeneralCourses() {
  try {
    console.log("\n🌍 Seeding General Studies & Education Courses");
    console.log("============================================");
    
    await mongoose.connect(MONGODB_URI2);
    console.log("✅ Connected to database");

    let totalCreated = 0;

    // Process GST courses
    console.log("\n📚 Processing General Studies (GST) courses...");
    for (const course of generalCourses.GST) {
      const department  = await departmentModel.findOne({code: "GST"}).lean()
      
      try {
        await courseModel.create({
          courseCode: course.courseCode,
          title: course.title,
          unit: course.unit,
          level: course.level,
          semester: course.semester,
          type: course.type.toLowerCase() === "core" ? "core" : "elective",
          department: department._id, // General courses don't belong to specific department
          faculty: null,
          createdBy: null,
          description: "",
        });
        console.log(`   ✅ Created ${course.courseCode}: ${course.title}`);
        totalCreated++;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`   ⚠️  Skipping ${course.courseCode} - already exists`);
        } else {
          console.log(`   ❌ Error creating ${course.courseCode}: ${error.message}`);
        }
      }
    }

    // Process EDU courses
    console.log("\n🎓 Processing Education (EDU) courses...");
    for (const course of generalCourses.EDU) {
      const department  = await departmentModel.findOne({code: "EDU"}).lean()

      try {
        await courseModel.create({
          courseCode: course.courseCode,
          title: course.title,
          unit: course.unit,
          level: course.level,
          semester: course.semester,
          type: course.type.toLowerCase() === "core" ? "core" : "elective",
          department: department._id,
          faculty: null,
          createdBy: null,
          description: "",
        });
        console.log(`   ✅ Created ${course.courseCode}: ${course.title}`);
        totalCreated++;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`   ⚠️  Skipping ${course.courseCode} - already exists`);
        } else {
          console.log(`   ❌ Error creating ${course.courseCode}: ${error.message}`);
        }
      }
    }

    // Process ENT courses
    console.log("\n💼 Processing Entrepreneurship (ENT) courses...");
    for (const course of generalCourses.ENT) {
      const department  = await departmentModel.findOne({code: "ENT"}).lean()

      try {
        await courseModel.create({
          courseCode: course.courseCode,
          title: course.title,
          unit: course.unit,
          level: course.level,
          semester: course.semester,
          type: course.type.toLowerCase() === "core" ? "core" : "elective",
          department: department._id,
          faculty: null,
          createdBy: null,
          description: "",
        });
        console.log(`   ✅ Created ${course.courseCode}: ${course.title}`);
        totalCreated++;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`   ⚠️  Skipping ${course.courseCode} - already exists`);
        } else {
          console.log(`   ❌ Error creating ${course.courseCode}: ${error.message}`);
        }
      }
    }

    console.log(`\n🎉 General Courses Seeding Complete!`);
    console.log(`   Total Courses Created: ${totalCreated}`);

  } catch (error) {
    console.error("❌ Error during general course seeding:", error);
  }
}

async function deleteOldCourses() {
  try {
    console.log("\n🗑️ Deleting Old Courses...");
    await mongoose.connect(MONGODB_URI2);

    const days = await question("Enter number of days (courses older than this will be deleted): ");
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const result = await courseModel.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`✅ Deleted ${result.deletedCount} courses older than ${days} days`);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// ==================== STUDENT MANAGEMENT ====================

// Replicate the createStudent controller logic
async function createStudentService(studentData) {
  const {
    name,
    email,
    matricNumber,
    departmentId,
    level
  } = studentData;

  try {
    // 🔍 1. Duplicate matric number
    const existingStudent = await Student.findOne({ matricNumber });
    if (existingStudent) {
      throw new Error("Student with this matric number already exists");
    }

    // 🔍 2. Duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // 🔐 3. Generate default password
    const defaultPassword = `${matricNumber}`;
    const hashedPassword = await hashData(defaultPassword);

    // 👤 4. Create User Account
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "student",
      must_change_password: true,
    });

    try {
      // 📌 5. Get active session
      const session = await Semester.findOne({ isActive: true });

      // 🎓 Create Student using same user._id
      const student = await Student.create({
        _id: user._id,
        matricNumber,
        departmentId,
        level,
        session: session?._id || null,
      });

      return { success: true, student, user };

    } catch (studentError) {
      // 🧹 Rollback user if student fails
      await User.findByIdAndDelete(user._id);
      console.error("⚠️ Student creation failed, deleted user:", studentError);

      throw new Error("Student creation failed — Session Rollback");
    }
  } catch (error) {
    console.error("❌ createStudentService Error:", error);
    throw error;
  }
}

async function createBulkStudents() {
  try {
    console.log("\n👥 Bulk Student Creation");
    console.log("=======================");
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to database");

    // Get all departments to map them correctly
    const departments = await departmentModel.find({});
    
    if (departments.length === 0) {
      console.log("❌ No departments found. Please create departments first.");
      return;
    }

    console.log("\n📋 Available Departments:");
    const departmentMap = {};
    departments.forEach(dept => {
      console.log(`   ${dept.name} (${dept.code})`);
      departmentMap[dept.name.toUpperCase()] = dept._id;
      departmentMap[dept.code] = dept._id;
    });

    const level = await question("\nEnter student level (100, 200, 300, 400): ");
    const levelNum = parseInt(level);
    
    if (isNaN(levelNum) || levelNum < 100 || levelNum > 400) {
      console.log("❌ Invalid level. Please enter 100, 200, 300, or 400.");
      return;
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Process each department
    for (const [deptName, students] of Object.entries(studentData)) {
      console.log(`\n📚 Processing ${deptName} Department...`);
      
      const departmentId = departmentMap[deptName] || departmentMap[departmentCodes[deptName]];
      
      if (!departmentId) {
        console.log(`   ⚠️  No department found for ${deptName}. Skipping...`);
        totalSkipped += students.length;
        continue;
      }

      let deptCreated = 0;
      let deptSkipped = 0;
      let deptErrors = 0;

      for (const student of students) {
        try {
          // Generate email from matric number
          const email = `${student.matricNumber.toLowerCase().replace(/\//g, '')}@university.edu.ng`;

          const result = await createStudentService({
            name: student.name,
            email,
            matricNumber: student.matricNumber,
            departmentId,
            level: levelNum
          });

          if (result.success) {
            console.log(`   ✅ Created ${student.name} (${student.matricNumber})`);
            deptCreated++;
            totalCreated++;
          }

        } catch (error) {
          if (error.message.includes("already exists")) {
            console.log(`   ⚠️  Skipping ${student.name} (${student.matricNumber}) - ${error.message}`);
            deptSkipped++;
            totalSkipped++;
          } else {
            console.log(`   ❌ Error creating ${student.name}: ${error.message}`);
            deptErrors++;
            totalErrors++;
          }
        }
      }

      console.log(`   📊 ${deptName}: ${deptCreated} created, ${deptSkipped} skipped, ${deptErrors} errors`);
    }

    console.log(`\n🎉 Bulk Creation Complete!`);
    console.log(`   Total Created: ${totalCreated}`);
    console.log(`   Total Skipped: ${totalSkipped}`);
    console.log(`   Total Errors: ${totalErrors}`);
    console.log(`   Grand Total Processed: ${totalCreated + totalSkipped + totalErrors}`);

  } catch (error) {
    console.error("❌ Error during bulk student creation:", error);
  }
}

async function createStudentsByDepartment() {
  try {
    console.log("\n🎯 Create Students for Specific Department");
    console.log("=======================================");
    
    await mongoose.connect(MONGODB_URI);

    // Show available departments
    const departments = await departmentModel.find({});
    
    console.log("\nAvailable Departments:");
    departments.forEach((dept, index) => {
      console.log(`${index + 1}. ${dept.name} (${dept.code})`);
    });

    const deptChoice = await question("\nSelect department number: ");
    const selectedDept = departments[parseInt(deptChoice) - 1];
    
    if (!selectedDept) {
      console.log("❌ Invalid department selection.");
      return;
    }

    const level = await question("Enter student level (100, 200, 300, 400): ");
    const levelNum = parseInt(level);

    // Find students for selected department
    const deptKey = Object.keys(departmentCodes).find(
      key => departmentCodes[key] === selectedDept.code
    );

    if (!deptKey || !studentData[deptKey]) {
      console.log(`❌ No student data found for ${selectedDept.name}`);
      return;
    }

    const students = studentData[deptKey];
    let created = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`\nCreating students for ${selectedDept.name}...`);

    for (const student of students) {
      try {
        const email = `${student.matricNumber.toLowerCase().replace(/\//g, '')}@university.edu.ng`;

        const result = await createStudentService({
          name: student.name,
          email,
          matricNumber: student.matricNumber,
          departmentId: selectedDept._id,
          level: levelNum
        });

        if (result.success) {
          console.log(`   ✅ Created ${student.name} (${student.matricNumber})`);
          created++;
        }

      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`   ⚠️  Skipping ${student.name} - ${error.message}`);
          skipped++;
        } else {
          console.log(`   ❌ Error creating ${student.name}: ${error.message}`);
          errors++;
        }
      }
    }

    console.log(`\n📊 Results for ${selectedDept.name}:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${students.length}`);

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ==================== ORPHANED STUDENT CLEANUP ====================

async function findOrphanedStudentUsers() {
  try {
    console.log("\n🔍 Finding Orphaned Student Users...");
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to database");

    const orphanedUsers = await User.aggregate([
      {
        $match: {
          role: "student"
        }
      },
      {
        $lookup: {
          from: "students",
          localField: "_id",
          foreignField: "_id",
          as: "studentRecord"
        }
      },
      {
        $match: {
          "studentRecord.0": { $exists: false }
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          matricNumber: 1,
          role: 1,
          createdAt: 1
        }
      }
    ]);

    return orphanedUsers;

  } catch (error) {
    console.error("❌ Error finding orphaned users:", error);
    throw error;
  }
}

async function deleteOrphanedStudentUsers(dryRun = true) {
  try {
    console.log("\n🗑️ Cleaning Up Orphaned Student Users");
    console.log("====================================");
    console.log(`Mode: ${dryRun ? 'DRY RUN (No changes will be made)' : 'LIVE (Records will be deleted)'}`);
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to database");

    const orphanedUsers = await findOrphanedStudentUsers();

    if (orphanedUsers.length === 0) {
      console.log("🎉 No orphaned student users found!");
      return { deletedCount: 0, orphanedUsers: [] };
    }

    console.log(`\n📊 Found ${orphanedUsers.length} orphaned student user(s):`);
    console.log("=" .repeat(80));
    
    orphanedUsers.forEach((user, index) => {
      console.log(`${index + 1}. Name: ${user.name || 'N/A'}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Matric: ${user.matricNumber || 'N/A'}`);
      console.log(`   Created: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}`);
      console.log(`   User ID: ${user._id}`);
      console.log("-".repeat(80));
    });

    if (dryRun) {
      console.log(`\n💡 This was a dry run. ${orphanedUsers.length} orphaned user(s) would be deleted.`);
      console.log(`   Run with live mode to actually delete these records.`);
      return { deletedCount: 0, orphanedUsers };
    }

    console.log(`\n⚠️  WARNING: You are about to delete ${orphanedUsers.length} user record(s).`);
    const confirmation = await question("Type 'DELETE' to confirm deletion: ");
    
    if (confirmation !== 'DELETE') {
      console.log("❌ Deletion cancelled.");
      return { deletedCount: 0, orphanedUsers };
    }

    const userIds = orphanedUsers.map(user => user._id);
    
    const deleteResult = await User.deleteMany({
      _id: { $in: userIds },
      role: "student"
    });

    console.log(`\n✅ Successfully deleted ${deleteResult.deletedCount} orphaned student user(s)!`);

    const remainingOrphans = await findOrphanedStudentUsers();
    if (remainingOrphans.length === 0) {
      console.log("🎉 All orphaned student users have been cleaned up!");
    } else {
      console.log(`⚠️  ${remainingOrphans.length} orphaned users still remain.`);
    }

    return { deletedCount: deleteResult.deletedCount, orphanedUsers };

  } catch (error) {
    console.error("❌ Error deleting orphaned users:", error);
    throw error;
  }
}

async function showOrphanStatistics() {
  try {
    console.log("\n📊 Orphaned Student Users Statistics");
    console.log("===================================");
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to database");

    const totalStudentUsers = await User.countDocuments({ role: "student" });
    const totalStudentRecords = await Student.countDocuments();
    const orphanedUsers = await findOrphanedStudentUsers();

    console.log(`
    👥 Total Users with Role 'student': ${totalStudentUsers}
    🎓 Total Student Records: ${totalStudentRecords}
    🔍 Orphaned Student Users: ${orphanedUsers.length}
    📈 Health Ratio: ${((totalStudentRecords / totalStudentUsers) * 100).toFixed(1)}%
    `);

    if (orphanedUsers.length > 0) {
      console.log("\n📋 Orphaned Users Details:");
      orphanedUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name || 'Unnamed'} (${user.email}) - Created: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}`);
      });
    }

    return {
      totalStudentUsers,
      totalStudentRecords,
      orphanedCount: orphanedUsers.length,
      healthRatio: (totalStudentRecords / totalStudentUsers) * 100
    };

  } catch (error) {
    console.error("❌ Error getting statistics:", error);
    throw error;
  }
}

// ==================== OTHER UTILITIES ====================

async function restoreStudent() {
  try {
    console.log("\n🔧 Restoring Student...");
    await mongoose.connect(MONGODB_URI);

    const matricNumber = await question("Enter student matric number to restore: ");
    const student = await Student.findOne({ matricNumber });

    if (!student) {
      console.log("❌ Student not found!");
      return;
    }

    const updated = await Student.findOneAndUpdate(
      { matricNumber },
      { deletedAt: null },
      { new: true }
    );

    console.log("✅ Student restored successfully:");
    console.log(`   Name: ${updated.name}, Matric: ${updated.matricNumber}`);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

async function listAllStudents() {
  try {
    console.log("\n📋 Listing All Students...");
    await mongoose.connect(MONGODB_URI);

    const students = await User.find({ role: 'student' }).populate('department');

    if (students.length === 0) {
      console.log("⚠️ No students found in the database.");
    } else {
      console.log(`\n📊 Found ${students.length} students:`);
      students.forEach((s, i) => {
        console.log(`${i + 1}. ${s.name} | ${s.matricNumber} | Dept: ${s.department?.name || 'N/A'} | Active: ${s.active}`);
      });
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

async function listDepartments() {
  try {
    console.log("\n🏫 Listing All Departments...");
    await mongoose.connect(MONGODB_URI);

    const departments = await departmentModel.find({});

    if (departments.length === 0) {
      console.log("⚠️ No departments found in the database.");
    } else {
      console.log(`\n📊 Found ${departments.length} departments:`);
      departments.forEach((dept, i) => {
        console.log(`${i + 1}. ${dept.name} (${dept.code}) - ${dept._id}`);
      });
    }
    return departments;
  } catch (err) {
    console.error("❌ Error:", err);
    return [];
  }
}

async function createSingleStudent() {
  try {
    console.log("\n👨‍🎓 Create Single Student");
    console.log("======================");
    
    await mongoose.connect(MONGODB_URI);

    const name = await question("Student full name: ");
    const matricNumber = await question("Matric number: ");
    const level = await question("Level (100, 200, 300, 400): ");
    const email = `${matricNumber.toLowerCase().replace(/\//g, '')}@university.edu.ng`;

    // Show available departments
    const departments = await departmentModel.find({});
    console.log("\nAvailable Departments:");
    departments.forEach((dept, index) => {
      console.log(`${index + 1}. ${dept.name}`);
    });
    
    const deptChoice = await question("Select department number: ");
    const selectedDept = departments[parseInt(deptChoice) - 1];
    
    if (!selectedDept) {
      console.log("❌ Invalid department selection.");
      return;
    }

    const result = await createStudentService({
      name,
      email,
      matricNumber,
      departmentId: selectedDept._id,
      level: parseInt(level)
    });

    if (result.success) {
      console.log(`\n✅ Student created successfully!`);
      console.log(`   Name: ${name}`);
      console.log(`   Matric: ${matricNumber}`);
      console.log(`   Department: ${selectedDept.name}`);
      console.log(`   Level: ${level}`);
      console.log(`   Email: ${email}`);
      console.log(`   Default Password: ${matricNumber}`);
    }

  } catch (error) {
    console.error("❌ Error creating student:", error.message);
  }
}

async function showDatabaseStats() {
  try {
    console.log("\n📊 Database Statistics");
    await mongoose.connect(MONGODB_URI);

    const [users, students, departments, courses] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'student' }),
      departmentModel.countDocuments(),
      courseModel.countDocuments()
    ]);

    console.log(`
    👥 Total Users: ${users}
    🎓 Students: ${students}
    🏫 Departments: ${departments}
    📚 Courses: ${courses}
    `);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// ==================== MAIN MENU ====================

async function showMenu() {
  console.log(`
🚀 Database Management Console
=================================

COURSE MANAGEMENT:
1.  🌱 Seed All Department Courses
2.  📚 Seed Specific Department Courses  
3.  🌍 Seed General Studies & Education Courses
4.  🗑️ Delete Old Courses

STUDENT MANAGEMENT:
5.  👥 Bulk Create All Students
6.  🎯 Create Students by Department
7.  👨‍🎓 Create Single Student
8.  📋 List All Students
9.  🔧 Restore Student

DATABASE UTILITIES:
10. 🏫 List Departments
11. 📊 Database Statistics
12. 🔍 Find Orphaned Student Users
13. 🗑️ Delete Orphaned Student Users (Dry Run)
14. 🗑️ Delete Orphaned Student Users (Live)
15. ❌ Exit

=================================
  `);

  const choice = await question("Select an option (1-15): ");

  switch (choice) {
    case '1':
      await seedAllDepartmentCourses();
      break;
    case '2':
      await seedDepartmentCourses();
      break;
    case '3':
      await seedGeneralCourses();
      break;
    case '4':
      await deleteOldCourses();
      break;
    case '5':
      await createBulkStudents();
      break;
    case '6':
      await createStudentsByDepartment();
      break;
    case '7':
      await createSingleStudent();
      break;
    case '8':
      await listAllStudents();
      break;
    case '9':
      await restoreStudent();
      break;
    case '10':
      await listDepartments();
      break;
    case '11':
      await showDatabaseStats();
      break;
    case '12':
      await showOrphanStatistics();
      break;
    case '13':
      await deleteOrphanedStudentUsers(true);
      break;
    case '14':
      await deleteOrphanedStudentUsers(false);
      break;
    case '15':
      console.log("👋 Goodbye!");
      rl.close();
      process.exit(0);
      return;
    default:
      console.log("❌ Invalid option. Please try again.");
  }

  await question("\nPress Enter to continue...");
  showMenu();
}

// ==================== CLI ARGUMENT HANDLING ====================

async function handleCLIArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    await showMenu();
    return;
  }

  const command = args[0].toLowerCase();
  
  switch (command) {
    // Course management commands
    case 'seed-all-courses':
      await seedAllDepartmentCourses();
      break;
    case 'seed-department-courses':
      await seedDepartmentCourses();
      break;
    case 'seed-general-courses':
      await seedGeneralCourses();
      break;
    case 'delete-old-courses':
      await deleteOldCourses();
      break;
    // Student management commands
    case 'bulk-create-students':
      await createBulkStudents();
      break;
    case 'create-department-students':
      await createStudentsByDepartment();
      break;
    case 'create-single-student':
      await createSingleStudent();
      break;
    // Orphan cleanup commands
    case 'find-orphans':
      await showOrphanStatistics();
      break;
    case 'delete-orphans-dry-run':
      await deleteOrphanedStudentUsers(true);
      break;
    case 'delete-orphans':
      await deleteOrphanedStudentUsers(false);
      break;
    // Utility commands
    case 'list-students':
      await listAllStudents();
      break;
    case 'list-departments':
      await listDepartments();
      break;
    case 'restore-student':
      await restoreStudent();
      break;
    case 'stats':
      await showDatabaseStats();
      break;
    default:
      console.log("❌ Unknown command. Available commands:");
      console.log("   Course Management: seed-all-courses, seed-department-courses, seed-general-courses, delete-old-courses");
      console.log("   Student Management: bulk-create-students, create-department-students, create-single-student");
      console.log("   Orphan Cleanup: find-orphans, delete-orphans-dry-run, delete-orphans");
      console.log("   Utilities: list-students, list-departments, restore-student, stats");
  }
  
  rl.close();
  process.exit(0);
}

// ==================== ERROR HANDLING ====================

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  rl.close();
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  rl.close();
  process.exit(1);
});

// ==================== START APPLICATION ====================

console.log("🔌 Connecting to database...");
handleCLIArgs().catch(console.error);