🧾 Student Management Module (Node.js + Express + Mongoose)

This module manages student data, course registration, and academic self-service operations for a student result processing system.
It integrates seamlessly with the Admin, Faculty, Department, Lecturer, and HOD modules.

⚙️ Tech Stack

Backend: Node.js, Express.js
Database: MongoDB (via Mongoose ODM)
Frontend: React.js (connected via REST APIs)
Authentication: JWT + bcrypt
Authorization: Role-based middleware (authenticate.js)

🔧 Utilities
File	Purpose
responseBuilder.js	Unified API response formatting
fetchDataHelper.js	Universal pagination, filtering & export logic
universalQueryHandler.js	Backend advanced query builder
🧩 Module Overview

The Student module extends the existing User model, allowing students to manage their academic records and perform self-service tasks (like viewing results or registering courses).

✨ Key Features
Feature	Description
🔐 Secure Student Management	Admins can create, update, and soft-delete student records.
📘 Course Registration	Students can register courses each semester.
📊 Result Viewing	Students can view semester/session results.
📄 Transcript Generation	Students can print transcripts (full/session-based).
🧾 Pagination & Search	All lists support pagination and filtering.
🧱 Soft Deletes	Students are “soft-deleted” using a deletedAt timestamp.
🛡️ Role-based Security	Access is controlled via JWT and user roles (Admin, Student).
🗂️ Folder Structure
backend/
│
├── models/
│   ├── User.js
│   ├── Student.js
│   ├── Course.js
│   ├── Department.js
│   ├── Faculty.js
│   └── Result.js
│
├── controllers/
│   └── student.controller.js
│
├── routes/
│   └── student.routes.js
│
├── utils/
│   ├── responseBuilder.js
│   ├── fetchDataHelper.js
│   └── universalQueryHandler.js
│
├── middlewares/
│   └── authenticate.js
│
└── server.js / app.js

🧠 Data Model Summary
Student Model
{
  userId: ObjectId,        // Reference to User
  matricNumber: String,    // Unique student ID
  departmentId: ObjectId,  // Reference to Department
  facultyId: ObjectId,     // Reference to Faculty
  level: String,           // e.g. "100", "200"
  session: String,         // e.g. "2024/2025"
  courses: [ObjectId],     // Enrolled course IDs
  gpa: Number,
  cgpa: Number,
  isActive: Boolean,
  deletedAt: Date
}

🚀 API Endpoints
🔹 Admin Routes
Method	Endpoint	Description	Role
GET	/api/students	Get all students (with pagination)	admin
POST	/api/students	Create a new student	admin
GET	/api/students/:id	Get a student by ID	admin
PUT	/api/students/:id	Update a student record	admin
DELETE	/api/students/:id	Soft delete a student	admin
🔹 Student Self-Service Routes
Method	Endpoint	Description	Role
GET	/api/students/me	Get logged-in student profile	student
POST	/api/students/register-courses	Register courses for the semester	student
GET	/api/students/my-courses	View registered courses	student
GET	/api/students/results	View results by session and semester	student
GET	/api/students/transcript	Generate or print transcript	student
🧩 Controller Summary
Function	Description	Access
getMyProfile	Returns the logged-in student’s populated profile	Student
registerCourses	Allows students to register courses using course IDs	Student
getMyCourses	Returns a student’s registered courses	Student
viewResults	Fetches results for a given semester/session	Student
printTranscript	Generates transcript (optionally session-based)	Student
getAllStudents	Fetches all students with pagination	Admin
createStudent	Creates a new student record	Admin
getStudentById	Retrieves a specific student by ID	Admin
updateStudent	Updates a student’s details	Admin
deleteStudent	Soft-deletes a student record	Admin
🔒 Middleware & Security
authenticate.js

Single, unified middleware for both authentication and authorization.

Usage Examples:

router.get("/", authenticate("admin"), getAllStudents);
router.get("/me", authenticate("student"), getMyProfile);


Features:

Verifies JWT token (Authorization: Bearer <token>)

Attaches user payload to req.user

Accepts either:

a single role → authenticate("admin")

multiple roles → authenticate(["admin", "hod"])

Rejects unauthorized roles automatically

🧾 Example Requests (Postman)
🔹 Admin — Create a Student

POST /api/students
Headers:

Authorization: Bearer <admin-token>
Content-Type: application/json


Body:

{
  "userId": "6710abf1d5b9b2b3c84d1f6c",
  "matricNumber": "CST/22/0012",
  "departmentId": "670ea13c8fd12a44d80a4913",
  "facultyId": "670e9ac45f84f7b8fa4e3d11",
  "level": "200",
  "session": "2024/2025"
}

🔹 Student — Register Courses

POST /api/students/register-courses
Headers:

Authorization: Bearer <student-token>


Body:

{
  "courseIds": ["670ea13c8fd12a44d80a4913", "670ea14e8fd12a44d80a4921"]
}

🔹 Student — View Results

GET /api/students/results?session=2024/2025&semester=1
Headers:

Authorization: Bearer <student-token>

🧱 Sample Response Format

All endpoints follow your unified structure (buildResponse.js):

{
  "status": "success",
  "message": "Student created successfully",
  "data": {
    "_id": "6710b1c3d5b9b2b3c84d1f70",
    "matricNumber": "CST/22/0012",
    "level": "200"
  },
  "timestamp": "2025-10-17T10:00:00.000Z"
}

⚙️ Environment Variables
Variable	Description
MONGO_URI	MongoDB connection string
TOKEN_KEY	JWT signing key
PORT	Server port (default: 5000)
NODE_ENV	Environment mode (development / production)
🧩 Setup & Run
# Install dependencies
npm install

# Start development server
npm run dev

🔐 Security Best Practices

Always use HTTPS in production.

Keep TOKEN_KEY secret and stored securely.

Validate and sanitize all user input.

Implement request rate-limiting.

Log all admin/student activity for audits.

Avoid exposing internal IDs or error stacks to clients.

🧭 Future Enhancements

Email notifications for registration/results updates.

Parent/guardian data integration.

Automated GPA/CGPA computation.

Enhanced query filters using universalQueryHandler.

👨‍💻 Author

Backend: Built with ❤️ using Node.js, Express & MongoDB
Frontend: React.js interface developed by project partner