🧾 Result Management Module (Node.js + Express + Mongoose)

This module manages all student result operations — uploading, approving, locking, and calculating GPA/CGPA — for the Student Result Processing System.

⚙️ Tech Stack

Backend: Node.js, Express.js

Database: MongoDB (Mongoose ODM)

Security: JWT-based authentication & role-based authorization

Utilities:

responseBuilder.js → Unified API response structure

fetchDataHelper.js → Pagination, filtering, export (CSV/Excel/JSON)

🧩 Module Overview
Role	Capability
Lecturer	Upload or update student scores
HOD	Approve, review, and lock results
Admin	Full result management and audit access
Student	View approved results and GPA/CGPA
🧠 Data Model (Result)
Field	Type	Description
studentId	ObjectId (Student)	Linked student record
courseId	ObjectId (Course)	Linked course
lecturerId	ObjectId (User)	Lecturer who uploaded the result
session	String	e.g., "2024/2025"
semester	String	"1" or "2"
score	Number	Raw score (0–100)
grade	String	Computed automatically (A–F)
gradePoint	Number	Auto-calculated (0–5)
approved	Boolean	Approved by HOD
locked	Boolean	Prevents future edits
remark	String	Optional notes
timestamps	Auto	Created/updated time
🚀 API Endpoints
📚 Lecturer Routes
Method	Endpoint	Description	Auth
POST	/api/results	Upload a student’s score	Lecturer
PATCH	/api/results/:id	Update a student’s score	Lecturer, HOD
🧠 HOD Routes
Method	Endpoint	Description	Auth
PATCH	/api/results/:id/approve	Approve a result	HOD
PATCH	/api/results/:id/lock	Lock a result	HOD, Admin
🔹 Admin Routes
Method	Endpoint	Description	Auth
GET	/api/results	Fetch all results (with pagination)	Admin, HOD
GET	/api/results/:id	Get single result by ID	Admin, HOD, Lecturer
DELETE	/api/results/:id	Delete result	Admin
GET	/api/results/recalculate/:studentId	Force GPA recalculation	Admin
📊 Automatic GPA/CGPA Calculation

Triggered every time a result is created, updated, or approved/locked.

Uses simple average formula:

GPA = totalGradePoints / totalCourses


Auto-updates the student record (gpa and cgpa fields).

🧰 Security Features

✅ JWT authentication required for all endpoints
✅ Role-based access using authenticate(role) middleware
✅ Locked results cannot be edited
✅ Data validation and clean error handling with buildResponse()
✅ Centralized pagination and export through fetchDataHelper()

🧪 Example Request — Upload Result

POST /api/results
Auth: Bearer <lecturer-token>
Body:

{
  "studentId": "6710b1c3d5b9b2b3c84d1f70",
  "courseId": "670ea13c8fd12a44d80a4913",
  "session": "2024/2025",
  "semester": "1",
  "score": 78
}


Response:

{
  "status": "success",
  "message": "Result uploaded successfully",
  "data": {
    "studentId": "...",
    "grade": "A",
    "gradePoint": 5
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}

🧾 Environment Variables
Variable	Description
JWT_SECRET	JWT encryption key
MONGO_URI	MongoDB connection string
PORT	Server port
NODE_ENV	Environment mode