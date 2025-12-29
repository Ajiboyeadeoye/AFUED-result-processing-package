```markdown
# Course Controller Documentation
## Nigerian University System - Course Management Module

## Overview
Handles comprehensive course operations including CRUD, assignment, registration, approvals, departmental operations, lecturer management, and analytics.

## File Structure
```
controllers/
└── course/
    ├── course.controller.js     # This file (main controller)
    ├── course.model.js          # Course data model
    ├── courseAssignment.model.js # Assignment model
    └── courseRegistration.model.js # Registration model
```

## Dependencies
```javascript
import Course from "./course.model.js";
import CourseAssignment from "./courseAssignment.model.js";
import CourseRegistration from "./courseRegistration.model.js";
import Department from "../department/department.model.js";
import Faculty from "../faculty/faculty.model.js";
import Semester from "../semester/semester.model.js";
import User from "../user/user.model.js";
import mongoose from "mongoose";
import buildResponse from "../../utils/responseBuilder.js";
import { dataMaps } from "../../config/dataMap.js";
import fetchDataHelper from "../../utils/fetchDataHelper.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import studentModel from "../student/student.model.js";
import carryOverSchema from "../result/carryover.model.js";
import CarryoverCourse from "../result/carryover.model.js";
```

## Utility Functions

### `calculateTotalUnits(courseIds)`
**Purpose:** Calculate total credit units for given course IDs
```javascript
const calculateTotalUnits = async (courseIds = []) => {
  const courses = await Course.find({ _id: { $in: courseIds } }).lean();
  return courses.reduce((sum, course) => sum + (course.unit || 0), 0);
};
```

## Core API Endpoints

### 🧱 COURSE CRUD OPERATIONS

#### `createCourse(req, res)`
**Method:** POST  
**Endpoint:** `/courses`  
**Description:** Create new course (original or borrowed) with HOD restrictions
```javascript
// Request Body:
{
  "courseCode": "CSC401",    // Required for original courses
  "title": "Advanced Programming",
  "unit": 3,
  "level": 400,
  "semester": "First",
  "type": "core",           // core | elective | borrowed
  "department_id": "dept123",
  "faculty": "faculty123",
  "description": "Course description",
  "borrowedId": "course123" // For borrowed courses only
}
```

#### `getAllCourses(req, res)`
**Method:** GET  
**Endpoint:** `/courses`  
**Description:** Fetch all courses with role-based filtering (HOD sees only their department)
- **HOD Restriction:** Automatically filters by HOD's department
- **Populates:** department, borrowedId
- **Custom Fields:** courseCode, courseTitle, departmentName

#### `getBorrowedCoursesFromMyDept(req, res)`
**Method:** GET  
**Endpoint:** `/courses/borrowed-from-my-dept`  
**Description:** HOD-only endpoint to view courses borrowed from their department
**Permissions:** HOD only

#### `getCourseById(req, res)`
**Method:** GET  
**Endpoint:** `/courses/:courseId`  
**Description:** Fetch single course by ID with full population

#### `updateCourse(req, res)`
**Method:** PUT  
**Endpoint:** `/courses/:id`  
**Description:** Update course details
```javascript
// Request Body: Partial course fields to update
```

#### `deleteCourse(req, res)`
**Method:** DELETE  
**Endpoint:** `/courses/:id`  
**Description:** Delete course permanently

### 🎓 COURSE ASSIGNMENT HANDLING

#### `assignCourse(req, res)`
**Method:** POST  
**Endpoint:** `/courses/assign`  
**Description:** Assign lecturer to course(s) with transaction support
```javascript
// Request Body:
{
  "course": "course123",      // Selected course ID
  "staffId": "lecturer123",   // Lecturer ID
  "assignToAll": true         // Assign to original + all borrowed copies
}
```
**Features:**
- Transaction-based assignment
- HOD can only assign courses from their department
- Handles both original and borrowed courses
- Prevents duplicate assignments per semester

### 🧾 COURSE REGISTRATION SYSTEM

#### `registerCourses(req, res)`
**Method:** POST  
**Endpoint:** `/courses/register`  
**Description:** Register student for courses with comprehensive validation
```javascript
// Request Body:
{
  "courses": ["course1", "course2", "course3"]
}
```
**Validation Steps:**
1. Student existence check
2. Active semester determination
3. Level settings validation (min/max units/courses)
4. Core course requirement check
5. Prerequisite verification
6. Carryover course inclusion check
7. Attempt number calculation

#### `getStudentRegistrations(req, res)`
**Method:** GET  
**Endpoint:** `/registrations/:studentId?`  
**Description:** Get student's course registrations
**Role-Based Access:**
- **Student:** Can only view own registrations
- **HOD:** Can view students in their department only
- **Admin:** Full access

#### `getRegisterableCourses(req, res)`
**Method:** GET  
**Endpoint:** `/courses/registerable`  
**Description:** Fetch courses available for student registration based on level and semester
**Filters:** Department, level, semester (including borrowed courses)

### 🧑‍🏫 LECTURER COURSE MANAGEMENT

#### `getLecturerCourses(req, res)`
**Method:** GET  
**Endpoint:** `/lecturer/courses`  
**Description:** Get all courses assigned to logged-in lecturer
**Features:**
- Only shows courses in active semesters
- Populates course details including borrowed originals

### 📊 ANALYTICS & REPORTS

#### `getCourseRegistrationReport(req, res)`
**Method:** GET  
**Endpoint:** `/courses/reports/registration`  
**Description:** Generate comprehensive registration analytics
**Query Parameters:**
- `level` (optional): Filter by academic level
- `semester` (optional): Filter by semester
- `session` (optional): Filter by academic session

**Response Structure:**
```javascript
{
  "summary": {
    "total_registrations": 150,
    "approved": 120,
    "pending": 20,
    "rejected": 10,
    "total_units": 450,
    "carryovers": 15
  },
  "charts": {
    "status_chart": [...],           // Registration status distribution
    "level_chart": [...],            // Registration by level
    "semester_chart": [...],         // Semester trend
    "carryover_reason_chart": [...], // Carryover reasons
    "carryover_status_chart": [...]  // Cleared vs uncleared
  }
}
```

#### `getStudentsForCourse(req, res)`
**Method:** GET  
**Endpoint:** `/courses/:courseId/students`  
**Description:** Get all students registered for a specific course
**Role Restrictions:**
- **Admin:** Can see all students
- **HOD:** Can only see students in their department
- **Student:** Restricted to own department

### 🧹 CLEANUP & SAFETY UTILITIES

#### `cleanupInactiveCourses(req, res)`
**Method:** POST  
**Endpoint:** `/courses/cleanup/inactive`  
**Description:** Remove all courses marked as "Inactive"

## Data Models Reference

### Course Model Key Fields
```javascript
{
  courseCode: String,      // Unique for original courses
  title: String,
  unit: Number,
  level: Number,
  semester: String,        // "First" | "Second"
  type: String,           // "core" | "elective" | "borrowed"
  department: ObjectId,
  faculty: ObjectId,
  borrowedId: ObjectId,   // Reference to original course
  prerequisites: [ObjectId],
  status: String          // "Active" | "Inactive"
}
```

### Course Assignment Model
```javascript
{
  course: ObjectId,
  lecturer: ObjectId,
  semester: ObjectId,
  session: String,
  department: ObjectId,
  assignedBy: ObjectId,
  assignedAt: Date
}
```

### Course Registration Model
```javascript
{
  student: ObjectId,
  courses: [ObjectId],
  semester: ObjectId,
  session: String,
  level: Number,
  totalUnits: Number,
  status: String,         // "Pending" | "Approved" | "Rejected"
  attemptNumber: Number,
  approvedBy: ObjectId,
  notes: String
}
```

## Error Handling
All endpoints use `buildResponse` utility for consistent error responses:
- `buildResponse.success(res, message, data)`
- `buildResponse.error(res, message, data, isError)`
- `buildResponse(res, status, message, data, isError, error)`

## Security & Permissions Matrix

| Role       | Create Course | Assign Course | View All Courses | Approve Registration |
|------------|---------------|---------------|------------------|----------------------|
| Student    | ❌            | ❌            | Department only  | ❌                   |
| Lecturer   | ❌            | ❌            | Assigned only    | ❌                   |
| HOD        | Department only | Department only | Department only  | Department only      |
| Admin      | ✅            | ✅            | ✅               | ✅                   |

## Environment Variables
No specific environment variables required beyond standard MongoDB connection.

## Testing Notes
Key test scenarios:
1. HOD department restriction enforcement
2. Borrowed course inheritance
3. Registration validation rules
4. Transaction rollback on assignment failure
5. Role-based access control

## Common Response Patterns
```javascript
// Success
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}

// Error
{
  "success": false,
  "message": "Error description",
  "data": null,
  "error": "Detailed error" // In development
}
```

## API Flow Examples

### Course Creation Flow
1. Validate user role (HOD → department restriction)
2. Check for duplicate course code (original courses only)
3. Handle borrowed course logic
4. Create course document
5. Return populated course data

### Course Registration Flow
1. Verify student existence
2. Determine active semester
3. Validate against level settings
4. Check prerequisites and carryovers
5. Calculate attempt number
6. Save registration

### Course Assignment Flow
1. Start MongoDB transaction
2. Determine original course (for borrowed courses)
3. Verify HOD department permission
4. Find all related courses (if assignToAll)
5. Create/update assignment records
6. Commit transaction
```