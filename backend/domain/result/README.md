🧾 Result Management Module (Node.js + Express + Mongoose)

This module handles all student result operations — uploading, updating, approving, locking, analyzing, and auditing — within the Student Result Processing System.

It integrates seamlessly with the Student, Course, Department, and Faculty modules and enforces strict role-based access control.

⚙️ Tech Stack

Backend: Node.js + Express.js

Database: MongoDB (via Mongoose)

Auth & Security: JWT authentication, Role-based middleware

Utilities:

responseBuilder.js — Unified API response format

fetchDataHelper.js — Pagination, filters & exports

fileHandler.js — Universal file upload/download middleware

auditLogger.js — Centralized activity logging

🧩 Module Overview
Role	Capability
Lecturer	Upload or bulk upload student results
HOD	Approve, update, or lock results
Admin	Full result management, analytics, and deletion
Student	View approved results (via Student module)
🧠 Data Model (Result)
Field	Type	Description
studentId	ObjectId → Student	The student this result belongs to
courseId	ObjectId → Course	Related course
lecturerId	ObjectId → User	Lecturer who uploaded/graded
session	String	Academic session, e.g., "2024/2025"
semester	String	"1" or "2"
ca	Number	Continuous Assessment (max 40)
exam	Number	Examination score (max 60)
score	Number	Total score (CA + Exam)
grade	String	Computed automatically (A–F)
gradePoint	Number	Auto-calculated (0–5)
approved	Boolean	True once approved by HOD
approvedBy	ObjectId → User	Who approved the result
locked	Boolean	Prevents further editing
deletedAt	Date	Soft delete timestamp
timestamps	Auto	Created and updated automatically
🚀 API Endpoints
🧑‍🏫 Lecturer / HOD / Admin Routes
Method	Endpoint	Description	Auth
POST	/api/results	Upload a single student result	Lecturer, HOD, Admin
POST	/api/results/bulk-upload	Upload multiple results via Excel/CSV	Lecturer, HOD, Admin
PATCH	/api/results/:id	Update a specific result	Lecturer, HOD
🧠 HOD / Admin Routes
Method	Endpoint	Description	Auth
PATCH	/api/results/:id/approve	Approve a result	HOD
PATCH	/api/results/:id/lock	Lock a result (no further edits)	HOD, Admin
🧾 Admin / HOD Routes
Method	Endpoint	Description	Auth
GET	/api/results	Fetch all results (paginated/filterable)	Admin, HOD
GET	/api/results/:id	Fetch a specific result by ID	Admin, HOD, Lecturer
GET	/api/results/analytics	Fetch statistics (pass rate, GPA, etc.)	Admin, HOD
DELETE	/api/results/:id	Soft delete a result record	Admin
📤 Bulk Upload (Excel/CSV)

Endpoint:
POST /api/results/bulk-upload

Auth:
Bearer <lecturer-token> | <hod-token> | <admin-token>

Body (form-data):

file: CSC103.xlsx
courseId: 670ea13c8fd12a44d80a4913
session: 2024/2025
semester: 1


Example Excel Columns:

Canditate's No.	Course Mark	Exam Marks	Total	Grade
ccs/2024/0001u	20	38	58	C
ccs/2024/0002u	16	46	62	B
ccs/2024/0003u	35	50	85	A

The system automatically skips metadata rows and starts reading from the header row.

Response:

{
  "status": "success",
  "message": "Bulk results processed successfully",
  "data": { "processed": 45 },
  "timestamp": "2025-10-20T12:00:00.000Z"
}

📈 Result Analytics (Admin / HOD)

Endpoint:
GET /api/results/analytics?session=2024/2025&semester=1

Response:

{
  "status": "success",
  "message": "Analytics fetched successfully",
  "data": {
    "total_results": 120,
    "passed": 98,
    "failed": 22,
    "pass_rate": "81.6%",
    "grade_distribution": {
      "A": 25,
      "B": 40,
      "C": 33,
      "D": 15,
      "E": 7,
      "F": 0
    },
    "average_gpa": "3.85"
  }
}

📦 File Upload / Download System
Upload

Handled by middlewares/fileHandler.js:

fileHandler("excel") // for result uploads
fileHandler("image") // for student profile pictures


Automatically stores uploads in:

uploads/
 ├── image/
 │   └── 2025/
 ├── excel/
 │   └── 2025/
 └── misc/
     └── 2025/

Download

Secure for authorized users:

GET /api/files/download/:folder/:year/:filename

🧮 Automatic GPA / CGPA Calculation

Triggered when results are:

created

updated

approved

or locked

Formula:

GPA = totalGradePoints / totalCourses


Automatically stored in the Student record (gpa, cgpa).

🛡️ Security & Access Control

✅ All endpoints require JWT authentication
✅ Roles enforced with authenticate(role)
✅ auditLogger records every action (uploads, approvals, deletions)
✅ Locked results are immutable
✅ File uploads restricted by MIME type
✅ Unified API responses using buildResponse()
✅ Soft delete prevents data loss

🧾 Example Success Response
{
  "status": "success",
  "message": "Result updated successfully",
  "data": {
    "_id": "6710b1c3d5b9b2b3c84d1f70",
    "studentId": "6710b1c3d5b9b2b3c84d1f70",
    "grade": "A",
    "score": 85,
    "session": "2024/2025"
  },
  "timestamp": "2025-10-20T12:20:00.000Z"
}

🧩 Environment Variables
Variable	Description
MONGO_URI	MongoDB connection string
JWT_SECRET	JWT signing secret
PORT	Server port (default: 5000)
NODE_ENV	Environment mode (development / production)
ENABLE_DB_LOGGING	Set true to store audit logs in MongoDB instead of file