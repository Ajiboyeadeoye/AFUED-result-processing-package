📘 README.md — Applicant & Admission Automation Module
🧩 Overview

This module handles Post-JAMB registration, automated admission processing, and student onboarding into the main academic system.

Applicants register for admission, upload or provide their Post-JAMB scores, and the system automatically grants admission to qualified candidates once the admin sets a cut-off mark.

🏗️ Folder Structure
modules/
├── applicant/
│   ├── applicant.model.js
│   ├── applicant.controller.js
│   ├── applicant.routes.js
│   └── README.md
└── admission/
    └── admissionSettings.model.js

⚙️ Dependencies

This module integrates seamlessly with the existing system using:

Express – Routing

Mongoose – Data models

JWT / bcryptjs – Authentication

Custom Utilities

authenticate middleware (role-based access)

buildResponse (standardized API responses)

dataMaps (optional transformation for outputs)

🧾 Data Models
🧍 Applicant
Field	Type	Description
userId	ObjectId (ref: User)	Linked user account
jambRegNumber	String	Unique Post-JAMB registration number
score	Number	Applicant’s Post-JAMB score
programChoice	ObjectId (ref: Department)	Chosen department/program
admissionStatus	Enum: pending | admitted | rejected	Admission status
⚙️ AdmissionSettings
Field	Type	Description
cutoffMark	Number	Global cut-off mark set by admin
lastUpdatedBy	ObjectId (ref: User)	Admin who last updated settings
🚦 API Endpoints
🔓 Public Routes
Method	Endpoint	Description
POST	/api/applicants/register	Register new Post-JAMB applicant
POST	/api/applicants/login	Applicant login and token issuance
👩‍🎓 Applicant Routes (Authenticated as applicant)
Method	Endpoint	Description
GET	/api/applicants/me	View own application details & admission status
PUT	/api/applicants/me	Update applicant information (score, program, etc.)
🧑‍💼 Admin Routes (Authenticated as admin)
Method	Endpoint	Description
POST	/api/applicants/cutoff	Set global cut-off mark and auto-process admissions
💡 Admission Automation Logic

When admin calls:

POST /api/applicants/cutoff
{
  "cutoffMark": 180
}


The system automatically:

Updates the AdmissionSettings model.

Scans all applicants with admissionStatus: "pending".

Compares each applicant’s score with the cutoff mark.

If score ≥ cutoff:

Admission granted (admissionStatus: "admitted")

Creates a linked record in Student collection

Upgrades the user’s role to "student"

If score < cutoff:

Sets status to "rejected"

Returns the total admitted and rejected counts.

🧾 Example Responses
✅ Applicant Registration
{
  "status": "success",
  "message": "Application submitted successfully",
  "data": {
    "user": {
      "_id": "671ad6d...123",
      "email": "applicant@mail.com",
      "role": "applicant"
    },
    "applicant": {
      "jambRegNumber": "UTME2025/123456",
      "programChoice": "65f34e...a89",
      "score": 205,
      "admissionStatus": "pending"
    }
  }
}

✅ Admin Cutoff Update & Auto-Admission
{
  "status": "success",
  "message": "Cutoff mark set to 180",
  "data": {
    "admitted": 3421,
    "rejected": 1579
  }
}

🔐 Roles & Access Control
Role	Permissions
Applicant	Register, login, view/update application
Admin	Set cut-off mark, trigger automatic admissions
Student	(Post-admission) access student routes like course registration, results, etc.
🧮 dataMaps Integration (Optional)

If you’re using your system-wide data transformation helper:

Applicant: {
  id: "this._id",
  name: "User.name",
  jamb_reg_number: "this.jambRegNumber",
  score: "this.score",
  program_name: "Department.name",
  faculty_name: "Faculty.name",
  admission_status: "this.admissionStatus",
},
