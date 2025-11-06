# 🛠️ Developer Notes

A quick reference guide for important backend developer utilities, database commands, and admin tools.

---

## ⚙️ Project Setup

### 1️⃣ Install Dependencies
```bash
npm install
````

### 2️⃣ Environment Variables

Make sure your `.env` file contains the correct MongoDB connection string:

```bash
MONGODB_URI2=mongodb+srv://<username>:<password>@<cluster-url>/your-database
```

---

## 🧑‍💼 Admin Tools

### 🏗️ Create a New Admin

Create a new admin account (both in `User` and `Admin` collections) safely using transactions.

```bash
npm run create-admin -- --id=ADM-002 --name="Mike Ross" --email="mike@school.edu" --password="admin123"
```

💡 **Notes:**

* `--id` → Unique Admin ID (e.g., ADM-001, ADM-002)
* `--name` → Full name of the admin
* `--email` → Admin’s email address (must be unique)
* `--password` → Optional; defaults to the admin ID if not provided
* Password is securely hashed before being saved.

---

### 📜 List All Admins

View all admins currently in the database:

```bash
npm run devtool -- list-admins
```

---

### 🗑️ Delete an Admin

Delete both the `Admin` and associated `User` record by email:

```bash
npm run devtool -- delete-admin --email="mike@school.edu"
```

---

## 🧰 Useful Utilities

### 🚀 Connect to MongoDB Shell

If you want to inspect data manually:

```bash
mongosh <your-mongodb-uri>
```

### 💾 Backup Your Database (optional)

```bash
mongodump --uri="<your-mongodb-uri>" --out=./db_backups/
```

---

## 🧩 Tips

* Always make sure your `.env` file is loaded before running scripts.
* Run scripts from the project root to avoid path issues.
* Keep this `DEV_NOTES.md` updated as you add more utilities.

---

### ✨ Example Workflow

```bash
# Create new admin
npm run create-admin -- --id=ADM-005 --name="Harvey Specter" --email="harvey@school.edu"

# Check all admins
npm run devtool -- list-admins

# Remove test admin
npm run devtool -- delete-admin --email="harvey@school.edu"
```