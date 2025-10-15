# ⚙️ General Usage Pattern

```js
import { fetchDataHelper } from "../utils/fetchDataHelper.js";
import Faculty from "../models/Faculty.js";
```

Then you just use:

```js
export const getAllFaculties = async (req, res) => {
  return fetchDataHelper(req, res, Faculty);
};
```

And it automatically handles:

* Pagination
* Search
* Filters
* Sorting
* GET or POST

---

## 🧩 Example 1 — Basic Pagination

**Backend:**

```js
export const getAllFaculties = async (req, res) => {
  return fetchDataHelper(req, res, Faculty);
};
```

**Frontend sends (GET or POST):**

```json
{
  "page": 1,
  "limit": 20
}
```

**Output:**

```json
{
  "message": "Faculties fetched",
  "pagination": { "current_page": 1, "limit": 20, "total_pages": 5, "total_items": 100 },
  "data": [ { "_id": "...", "name": "Faculty of Science" }, ... ]
}
```

---

## 🔍 Example 2 — Multi-field Search

**Backend:**

```js
export const searchStudents = async (req, res) => {
  return fetchDataHelper(req, res, Student);
};
```

**Frontend sends:**

```json
{
  "fields": ["name", "matric_number"],
  "search_term": "breakthrough"
}
```

**Effect:**
Searches both `name` and `matric_number` fields using regex like `$regex: "breakthrough", $options: "i"`.

---

## 🧠 Example 3 — Advanced Filter (from AdvancedFilterSystem)

**Backend:**

```js
export const filterCourses = async (req, res) => {
  return fetchDataHelper(req, res, Course);
};
```

**Frontend sends:**

```json
{
  "filter": {
    "$or": [
      { "credits": { "$gte": 3 } },
      { "department": { "$regex": "computer", "$options": "i" } }
    ]
  }
}
```

**Effect:**
Returns all courses that have credits ≥ 3 OR belong to “computer” department.

---

## 💬 Example 4 — With Pagination + Filter Together

**Backend:**

```js
export const getFilteredStudents = async (req, res) => {
  return fetchDataHelper(req, res, Student);
};
```

**Frontend sends:**

```json
{
  "page": 2,
  "limit": 15,
  "filter": { "level": "400", "status": "active" }
}
```

**Effect:**
Gives page 2 of all active 400-level students.

---

## 🧮 Example 5 — Combined Search + Pagination

**Backend:**

```js
export const getCourses = async (req, res) => {
  return fetchDataHelper(req, res, Course);
};
```

**Frontend sends:**

```json
{
  "fields": ["title", "code"],
  "search_term": "math",
  "page": 1,
  "limit": 10
}
```

**Effect:**
Searches course title or code that contains "math", paginated to 10 per page.

---

## 🧰 Example 6 — Default Filters (e.g., Only Approved)

**Backend:**

```js
export const getApprovedResults = async (req, res) => {
  return fetchDataHelper(req, res, Result, {
    additionalFilters: { approved: true }
  });
};
```

**Frontend sends:**

```json
{}
```

**Effect:**
Even with no frontend filters, backend automatically restricts results to `{ approved: true }`.

---

## 🧾 Example 7 — Custom Sorting

**Backend:**

```js
export const getDepartments = async (req, res) => {
  return fetchDataHelper(req, res, Department, { sort: { createdAt: -1 } });
};
```

**Frontend sends:**

```json
{}
```

**Effect:**
Returns newest departments first.

---

## 🧩 Example 8 — Sorting Controlled from Frontend

**Backend:**

```js
export const getLecturers = async (req, res) => {
  return fetchDataHelper(req, res, Lecturer);
};
```

**Frontend sends:**

```json
{
  "sort": { "name": 1 }
}
```

**Effect:**
Sorts lecturers alphabetically by name (ascending).

---

## 📊 Example 9 — Combined Search + Advanced Filter

**Backend:**

```js
export const searchCourses = async (req, res) => {
  return fetchDataHelper(req, res, Course);
};
```

**Frontend sends:**

```json
{
  "fields": ["title", "code"],
  "search_term": "bio",
  "filter": {
    "credits": { "$gte": 2 },
    "level": "100"
  }
}
```

**Effect:**
Searches "bio" in title/code and only returns 100-level courses with ≥ 2 credits.

---

## 🧑‍🏫 Example 10 — Completely Raw Filter (Admin use)

**Backend:**

```js
export const adminFetch = async (req, res) => {
  return fetchDataHelper(req, res, Student, { enablePagination: false });
};
```

**Frontend sends:**

```json
{
  "filter": { "cgpa": { "$gte": 4.5 }, "status": "active" }
}
```

**Effect:**
Fetches **all** students with CGPA ≥ 4.5 and active status — no pagination (bulk export style).

---

## 🚀 Bonus Example — Using GET Query

**URL:**
`GET /api/faculties?page=1&limit=20&search_term=science&fields=name,department`

**Backend:**

```js
export const getFaculties = async (req, res) => {
  return fetchDataHelper(req, res, Faculty);
};
```

**Effect:**
Same as the POST version. The utility auto-converts comma-separated fields to array.

---

## 📚 Summary Table

| #  | Use Case                   | Example Frontend Data                      | Notes                  |
| -- | -------------------------- | ------------------------------------------ | ---------------------- |
| 1  | Simple pagination          | `{ page: 1, limit: 20 }`                   | Default listing        |
| 2  | Search multiple fields     | `{ fields: ["name"], search_term: "bio" }` | Multi-field regex      |
| 3  | Advanced filters           | `{ filter: { "$or": [...] } }`             | From filter builder    |
| 4  | Filter + Pagination        | `{ filter: {...}, page: 2 }`               | Combined query         |
| 5  | Search + Pagination        | `{ fields: ["code"], search_term: "ENG" }` | Search paginated       |
| 6  | Default filters            | `{}`                                       | Backend restricts data |
| 7  | Backend sort               | `{}`                                       | Custom default sort    |
| 8  | Frontend sort              | `{ sort: { name: 1 } }`                    | Dynamic sorting        |
| 9  | Search + Filter            | `{ fields: [...], filter: {...} }`         | Complex combo          |
| 10 | Raw filter (no pagination) | `{ filter: {...} }`                        | For admin exports      |

---

Would you like me to include **TypeScript typings + inline JSDoc docs** for `fetchDataHelper`, so it’ll give you autocompletion and type hints everywhere you use it? 🤓🔥

🧠💻⚙️🔍🧾🚀✨📡💪🔥
