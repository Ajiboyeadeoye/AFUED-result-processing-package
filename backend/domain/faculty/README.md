
# 🎓 Faculty Management API

This module handles **Faculty creation, retrieval, updating, and deletion** within the AFUED Result Processing Package.  
It ensures only authenticated users (and specifically admins) can modify faculties, while normal users can view them.

---

## 📁 File Structure

```

faculty/
│
├── faculty.controller.js   # Contains all faculty CRUD operations
├── faculty.model.js        # Defines the Faculty Mongoose schema
├── faculty.routes.js       # Handles route definitions and middleware
└── README.md               # (You’re reading this file)

````

---

## ⚙️ Controller Functions

### 1️⃣ `createFaculty(req, res)`
Creates a new faculty in the system.

- **Access:** Admin only  
- **Middleware:** `authenticateUser`, `authorizeRoles("admin")`
- **Body:**
  ```json
  {
    "name": "Faculty of Science"
  }
````

* **Response:**

  ```json
  {
    "success": true,
    "message": "Faculty created successfully",
    "data": {
      "_id": "670fdfg3...",
      "name": "Faculty of Science",
      "createdBy": "66ab... (User ID)"
    }
  }
  ```

---

### 2️⃣ `getAllFaculties(req, res)`

Fetches all faculties from the database.

* **Access:** Authenticated users
* **Middleware:** `authenticateUser`
* **Response:**

  ```json
  {
    "success": true,
    "message": "Faculties fetched",
    "data": [
      { "_id": "...", "name": "Faculty of Science" },
      { "_id": "...", "name": "Faculty of Education" }
    ]
  }
  ```

---

### 3️⃣ `getFacultyById(req, res)`

Fetches a single faculty by its ID.

* **Access:** Authenticated users

* **Middleware:** `authenticateUser`

* **Params:**

  * `facultyId` (MongoDB ObjectId)

* **Response:**

  ```json
  {
    "success": true,
    "message": "Faculty found",
    "data": {
      "_id": "670fdfg3...",
      "name": "Faculty of Science"
    }
  }
  ```

---

### 4️⃣ `updateFaculty(req, res)`

Updates a faculty’s information.

* **Access:** Admin only
* **Middleware:** `authenticateUser`, `authorizeRoles("admin")`
* **Params:**

  * `facultyId`
* **Body Example:**

  ```json
  {
    "name": "Faculty of Applied Sciences"
  }
  ```
* **Response:**

  ```json
  {
    "success": true,
    "message": "Faculty updated",
    "data": {
      "_id": "670fdfg3...",
      "name": "Faculty of Applied Sciences"
    }
  }
  ```

---

### 5️⃣ `deleteFaculty(req, res)`

Deletes a faculty by ID.

* **Access:** Admin only
* **Middleware:** `authenticateUser`, `authorizeRoles("admin")`
* **Params:**

  * `facultyId`
* **Response:**

  ```json
  {
    "success": true,
    "message": "Faculty deleted"
  }
  ```

---

## 🚀 Routes Summary

| HTTP Method | Endpoint                    | Description                | Access Level  |
| ----------- | --------------------------- | -------------------------- | ------------- |
| **POST**    | `/api/faculties/`           | Create a new faculty       | Admin only    |
| **GET**     | `/api/faculties/`           | Get all faculties          | Authenticated |
| **GET**     | `/api/faculties/:facultyId` | Get a single faculty by ID | Authenticated |
| **PATCH**   | `/api/faculties/:facultyId` | Update faculty details     | Admin only    |
| **DELETE**  | `/api/faculties/:facultyId` | Delete a faculty           | Admin only    |

---

## 🧠 Notes

* `req.user` is assumed to be injected by the authentication middleware (`authenticateUser`).
* All responses are handled using the custom utility `buildResponse(res, status, message, data, isError, errorDetails?)`.
* The faculty model should include at least:

  ```js
  {
    name: { type: String, required: true, unique: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }
  ```
* Make sure to import the routes into your main `app.js` like so:

  ```js
  import facultyRoutes from "./modules/faculty/faculty.routes.js";
  app.use("/api/faculties", facultyRoutes);
  ```

---

## 🧩 Example cURL Commands

**Create Faculty**

```bash
curl -X POST http://localhost:5000/api/faculties \
-H "Authorization: Bearer <token>" \
-H "Content-Type: application/json" \
-d '{"name":"Faculty of Education"}'
```

**Get All Faculties**

```bash
curl -X GET http://localhost:5000/api/faculties \
-H "Authorization: Bearer <token>"
```

---

👩🏽‍💻 **Author:** AFUED Result Processing Team
📅 **Last Updated:** October 2025
🧠 **Maintainer:** Tiko ❤️
