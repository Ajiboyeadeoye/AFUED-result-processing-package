import XLSX from "xlsx";
import fs from "fs";
import mongoose from "mongoose";
import Result from "./result.model.js";
import Student from "../student/student.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";

/**
 * Helper: upsert a single result object
 * - data: { studentId?, matricNumber?, courseId, ca?, exam?, score?, session, semester, lecturerId? }
 * - options: { actor: req.user, allowOverrideRoles: ['admin','hod'] }
 *
 * Returns { ok: true, created: true/false, doc, reason? } or { ok: false, reason }
 */
async function upsertSingleResult(data, options = {}) {
  const { actor = null, allowOverrideRoles = ["admin", "hod"] } = options;

  // Normalize input
  const {
    studentId,
    matricNumber,
    courseId,
    ca = 0,
    exam = 0,
    score = null,
    session,
    matric_no
  } = data || {};

  if (matric_no) {
    // matricNumber = matric_no
  }
  if (!courseId) return { ok: false, reason: "courseId is required" };
  if (!studentId && !matricNumber && !matric_no) {
    return { ok: false, reason: "Provide either studentId or matricNumber" };
  }

  // Resolve student
  let student = null;
  if (studentId) {
    student = await Student.findById(studentId).lean();
  } else {
    if (matric_no) {
      student = await Student.findOne({ matricNumber: matric_no }).lean();

    } else {

      student = await Student.findOne({ matricNumber }).lean();
    }
  }

  if (!student) {
    return { ok: false, reason: "Student not found" };
  }

  // 🔥 AUTO-RESOLVE ACTIVE SEMESTER BASED ON DEPARTMENT
  const Semester = mongoose.model("Semester");
  const semesterDoc = await Semester.findOne({
    department: student.departmentId,
    isActive: true
  }).lean();

  if (!semesterDoc) {
    return { ok: false, reason: "No active semester found for student's department" };
  }

  const semester = semesterDoc._id;

  // Prepare payload
  const payload = {
    studentId: student._id,
    courseId,
    semester,
    ca,
    exam
  };

  // If client supplied score → use it  
  if (typeof score === "number") payload.score = score;

  // Check existing result
  const existing = await Result.findOne({
    studentId: student._id,
    courseId,
    semester
  });

  if (existing) {
    // lock protection
    if (existing.locked || existing.approved) {
      const role = actor?.role || actor?.roles;
      const authorized = Array.isArray(role)
        ? role.some(r => allowOverrideRoles.includes(r))
        : allowOverrideRoles.includes(role);

      if (!authorized) {
        return { ok: false, reason: "Result is locked/approved and cannot be modified" };
      }
    }

    existing.ca = payload.ca;
    existing.exam = payload.exam;
    if (payload.score !== undefined) existing.score = payload.score;
    existing.lecturerId = actor?._id || existing.lecturerId;

    await existing.save();
    return { ok: true, created: false, doc: existing.toObject() };
  }

  // Create new
  const created = await Result.create({
    ...payload,
    lecturerId: actor?._id || null,
    createdBy: actor?._id || null
  });

  return { ok: true, created: true, doc: created.toObject() };
}


/**
 * 🧾 Upload Single Result OR JSON Array (Lecturer)
 * - Accepts either:
 *    POST body: { studentId, courseId, score, session, semester, ca, exam }
 *    OR POST body: [ { ... }, { ... } ]
 */
export const uploadResult = async (req, res) => {
  try {
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [payload];

    const courseId = req.params.courseId; // <— inject this

    const results = [];
    const errors = [];

    for (const item of items) {
      delete item.semester;

      item.courseId = courseId; // <— FIX HERE 🔥🔥🔥

      const r = await upsertSingleResult(item, { actor: req.user });
      if (!r.ok) errors.push({ item, reason: r.reason });
      else results.push({ item, created: r.created, doc: r.doc });
    }

    console.log(errors)
    return buildResponse(res, errors.length ? 207 : 201, "Processed", { results, errors });
  } catch (error) {
    console.error("❌ uploadResult Error:", error);
    return buildResponse(res, 500, "Failed", null, true, error);
  }
};


/**
 * 📤 Bulk Result Upload (Lecturer / HOD / Admin)
 * - Keeps Excel parsing for file uploads
 * - Also accepts JSON array in body.rows (so frontend can POST processed rows)
 */
export const bulkUploadResults = async (req, res) => {
  try {
    const { courseId, session, semester } = req.body || {};

    // if frontend already extracted rows and sent them
    if (Array.isArray(req.body?.rows) && req.body.rows.length) {
      const rows = req.body.rows;
      const results = [];
      const errors = [];

      for (const row of rows) {
        // normalize expected keys: accept studentId or matricNumber and ca/exam/score
        const item = {
          studentId: row.studentId || row.student_id || row.student,
          matricNumber: row.matricNumber || row.matric_number || row.matric,
          courseId: courseId || row.courseId || row.course_id || row.course,
          session: session || row.session,
          semester: semester || row.semester,
          ca: Number(row.ca ?? row["CA"] ?? row["Course Mark"] ?? 0),
          exam: Number(row.exam ?? row["Exam"] ?? row["Exam Marks"] ?? 0),
          score: Number(row.score ?? row.total ?? row.Total ?? null)
        };

        const r = await upsertSingleResult(item, { actor: req.user });
        if (!r.ok) errors.push({ item, reason: r.reason });
        else results.push({ item, created: r.created, doc: r.doc });
      }

      const statusCode = errors.length ? 207 : 201;
      return buildResponse(res, statusCode, "Bulk results processed", { processed: results.length, results, errors });
    }

    // Fallback: handle uploaded excel file (existing behaviour)
    if (!req.file?.path) return buildResponse(res, 400, "No file uploaded");

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Skip metadata (headers start at row 10 → index 9) — keep your previous behavior
    const rows = XLSX.utils.sheet_to_json(sheet, { range: 9 });

    if (!Array.isArray(rows) || rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return buildResponse(res, 400, "Uploaded file is empty or invalid");
    }

    const results = [];
    const errors = [];

    for (const row of rows) {
      const matricNumber =
        row["Canditate's No."] || row["Candidate No"] || row["Matric Number"] || row["matricNumber"];
      const ca = Number(row["Course Mark"]) || 0;
      const exam = Number(row["Exam Marks"]) || 0;
      const total = Number(row["Total"]) || ca + exam;

      // find student
      const student = await Student.findOne({ matricNumber }).lean();
      if (!student) {
        errors.push({ row, reason: "Student not found" });
        continue;
      }

      const item = {
        studentId: student._id,
        courseId: courseId,
        session,
        semester,
        ca,
        exam,
        score: total,
      };

      const r = await upsertSingleResult(item, { actor: req.user });
      if (!r.ok) errors.push({ row: item, reason: r.reason });
      else results.push({ item, created: r.created, doc: r.doc });
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    const statusCode = errors.length ? 207 : 201;
    return buildResponse(res, statusCode, "Bulk results processed successfully", { processed: results.length, results, errors });
  } catch (error) {
    console.error("❌ bulkUploadResults Error:", error);
    return buildResponse(res, 500, "Failed to process bulk upload", null, true, error);
  }
};

function computeGrade(score) {
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

/**
 * 📚 Get All Results (Admin / HOD)
 */
export const getAllResults = async (req, res) => {
  return fetchDataHelper(req, res, Result, {
    enablePagination: true,
    sort: { createdAt: -1 },
  });
};

/**
 * 🔍 Get Single Result
 */
export const getResultById = async (req, res) => {
  try {
    const result = await Result.findById(req.params.id)
      .populate("studentId", "matricNumber name")
      .populate("courseId", "title courseCode courseUnit")
      .populate("lecturerId", "name email");

    if (!result) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result fetched successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to fetch result", null, true, error);
  }
};

/* rest of your controller (updateResult, approveResult, lockResult, analytics, deleteResult)
   can remain unchanged — they will continue to work with the improved model and the helper.
*/


/**
 * ✏️ Update Existing Result (Lecturer / HOD)
 * PATCH /results/edit/:id
 */
export const updateResult = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};

    const existing = await Result.findById(id);
    if (!existing) return buildResponse(res, 404, "Result not found");

    // Protect locked/approved
    if (existing.locked || existing.approved) {
      const allowed = ["admin", "hod"];
      const role = req.user?.role || req.user?.roles || [];

      const authorized = Array.isArray(role)
        ? role.some(r => allowed.includes(r))
        : allowed.includes(role);

      if (!authorized) {
        return buildResponse(res, 403, "This result is locked/approved. You cannot modify it.");
      }
    }

    // Apply updates
    if (body.ca !== undefined) existing.ca = body.ca;
    if (body.exam !== undefined) existing.exam = body.exam;
    if (body.score !== undefined) existing.score = body.score;

    existing.lecturerId = req.user._id; // track who updated it

    await existing.save();

    return buildResponse(res, 200, "Result updated successfully", existing);
  } catch (error) {
    return buildResponse(res, 500, "Failed to update result", null, true, error);
  }
};


/**
 * ✅ Approve Result (HOD)
 * PATCH /results/:id/approve
 */
export const approveResult = async (req, res) => {
  try {
    const id = req.params.id;

    const result = await Result.findById(id);
    if (!result) return buildResponse(res, 404, "Result not found");

    if (result.approved) {
      return buildResponse(res, 400, "Result is already approved");
    }

    result.approved = true;
    result.approvedBy = req.user._id;
    result.approvedAt = new Date();

    await result.save();
    return buildResponse(res, 200, "Result approved successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to approve result", null, true, error);
  }
};


/**
 * 🔒 Lock Result (HOD / Admin)
 * PATCH /results/:id/lock
 */
export const lockResult = async (req, res) => {
  try {
    const id = req.params.id;

    const result = await Result.findById(id);
    if (!result) return buildResponse(res, 404, "Result not found");

    if (result.locked) {
      return buildResponse(res, 400, "Result is already locked");
    }

    result.locked = true;
    result.lockedBy = req.user._id;
    result.lockedAt = new Date();

    await result.save();
    return buildResponse(res, 200, "Result locked successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to lock result", null, true, error);
  }
};


/**
 * 📊 Analytics Summary (Admin / HOD)
 * GET /results/analytics
 */
export const getResultAnalytics = async (req, res) => {
  try {
    const total = await Result.countDocuments();
    const approved = await Result.countDocuments({ approved: true });
    const locked = await Result.countDocuments({ locked: true });

    const gradeStats = await Result.aggregate([
      { $group: { _id: "$grade", count: { $sum: 1 } } },
    ]);

    return buildResponse(res, 200, "Analytics summary", {
      total,
      approved,
      locked,
      gradeStats,
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to fetch analytics", null, true, error);
  }
};


/**
 * 🗑 Delete Result (Admin)
 * DELETE /results/:id
 */
export const deleteResult = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await Result.findById(id);

    if (!result) return buildResponse(res, 404, "Result not found");

    await Result.findByIdAndDelete(id);

    return buildResponse(res, 200, "Result deleted successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to delete result", null, true, error);
  }
};
