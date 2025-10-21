👨‍🏫 Lecturer Management Module (Node.js + Express + Mongoose)

This module manages lecturer data, departmental assignments, and HOD roles. It provides admin-level control over academic staff and links to departments and faculties.

⚙️ Tech Stack

Node.js + Express.js

MongoDB (via Mongoose)

JWT Authentication

Role-based middleware

Unified responses with responseBuilder.js

Optional: auditLogger.js for admin/HOD activity

🧠 Lecturer Model
{
  userId: ObjectId,        // ref to User
  staffId: String,         // unique staff code
  departmentId: ObjectId,  // ref to Department
  facultyId: ObjectId,     // ref to Faculty
  specialization: String,
  rank: String,            // e.g. "Lecturer II"
  isHOD: Boolean,          // current HOD status
  active: Boolean,
  deletedAt: Date
}

🚀 API Endpoints
Method	Endpoint	Description	Auth
POST	/api/lecturers	Create a new lecturer	Admin
GET	/api/lecturers	Get all lecturers	Admin, HOD
GET	/api/lecturers/:id	Get lecturer details	Admin, HOD
PUT	/api/lecturers/:id	Update lecturer record	Admin
DELETE	/api/lecturers/:id	Soft delete lecturer	Admin
PATCH	/api/lecturers/:departmentId/assign-hod/:lecturerId	Assign as HOD	Admin
PATCH	/api/lecturers/:departmentId/remove-hod/:lecturerId	Remove HOD	Admin
🧱 Security & Access Control

✅ JWT-based authentication
✅ Role-based middleware:

Admin: Full CRUD & HOD assignment

HOD: Can view lecturers within their department
✅ Soft delete preserves data for audits
✅ Consistent responses via buildResponse()
✅ Logs auditable actions via auditLogger

🧩 Example Success Response
{
  "status": "success",
  "message": "Lecturer created successfully",
  "data": {
    "_id": "67200b9fd4b8e2a7e94f1351",
    "staffId": "AFUED/LECT/102",
    "rank": "Lecturer I",
    "departmentId": "670ea13c8fd12a44d80a4913"
  },
  "timestamp": "2025-10-20T15:35:00.000Z"
}