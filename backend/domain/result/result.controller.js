import XLSX from "xlsx";
import fs from "fs";
import Result from "./result.model.js";
import Student from "../student/student.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { fetchDataHelper } from "../../utils/fetchDataHelper.js";

/**
 * 🧾 Upload Single Result (Lecturer)
 */
export const uploadResult = async (req, res) => {
  try {
    const { studentId, courseId, score, session, semester } = req.body;

    const existing = await Result.findOne({ studentId, courseId, session, semester });
    if (existing)
      return buildResponse(res, 400, "Result for this course and session already exists");

    const result = await Result.create({
      studentId,
      courseId,
      score,
      session,
      semester,
      lecturerId: req.user._id,
    });

    return buildResponse(res, 201, "Result uploaded successfully", result);
  } catch (error) {
    console.error("❌ uploadResult Error:", error);
    return buildResponse(res, 500, "Failed to upload result", null, true, error);
  }
};

/**
 * 📤 Bulk Result Upload (Lecturer / HOD / Admin)
 * ----------------------------------------------
 * Accepts Excel or CSV via fileHandler("excel")
 * Handles structured exam sheets with header metadata.
 */
export const bulkUploadResults = async (req, res) => {
  try {
    const { courseId, session, semester } = req.body;

    if (!req.file?.path) return buildResponse(res, 400, "No file uploaded");

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Skip metadata (headers start at row 10 → index 9)
    const rows = XLSX.utils.sheet_to_json(sheet, { range: 9 });

    if (!Array.isArray(rows) || rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return buildResponse(res, 400, "Uploaded file is empty or invalid");
    }

    let processed = 0;
    for (const row of rows) {
      const matricNumber =
        row["Canditate's No."] || row["Candidate No"] || row["Matric Number"];
      const ca = Number(row["Course Mark"]) || 0;
      const exam = Number(row["Exam Marks"]) || 0;
      const total = Number(row["Total"]) || ca + exam;
      const grade = row["Grade"] || computeGrade(total);

      if (!matricNumber) continue;

      const student = await Student.findOne({ matricNumber });
      if (!student) continue;

      const existing = await Result.findOne({ studentId: student._id, courseId, session, semester });
      if (existing) {
        existing.score = total;
        existing.grade = grade;
        existing.ca = ca;
        existing.exam = exam;
        await existing.save();
      } else {
        await Result.create({
          studentId: student._id,
          courseId,
          session,
          semester,
          score: total,
          grade,
          ca,
          exam,
          lecturerId: req.user._id,
        });
      }
      processed++;
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    return buildResponse(res, 201, "Bulk results processed successfully", { processed });
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
      .populate("courseId", "title code unit")
      .populate("lecturerId", "name email");

    if (!result) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result fetched successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to fetch result", null, true, error);
  }
};

/**
 * ✏️ Update Result (Lecturer / HOD)
 */
export const updateResult = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Result.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result updated successfully", updated);
  } catch (error) {
    return buildResponse(res, 500, "Failed to update result", null, true, error);
  }
};

/**
 * ✅ Approve Result (HOD)
 */
export const approveResult = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findByIdAndUpdate(
      id,
      { approved: true, approvedBy: req.user._id },
      { new: true }
    );

    if (!result) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result approved successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to approve result", null, true, error);
  }
};

/**
 * 🔒 Lock Result (HOD / Admin)
 */
export const lockResult = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findByIdAndUpdate(id, { locked: true }, { new: true });

    if (!result) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result locked successfully", result);
  } catch (error) {
    return buildResponse(res, 500, "Failed to lock result", null, true, error);
  }
};

/**
 * 📈 Analytics Summary (Admin / HOD)
 */
export const getResultAnalytics = async (req, res) => {
  try {
    const { session, semester, courseId } = req.query;
    const filter = {};
    if (session) filter.session = session;
    if (semester) filter.semester = semester;
    if (courseId) filter.courseId = courseId;

    const results = await Result.find(filter).populate("studentId", "matricNumber gpa");

    if (!results.length) return buildResponse(res, 404, "No results found for analytics");

    const total = results.length;
    const passed = results.filter((r) => r.grade !== "F").length;
    const failed = total - passed;
    const gradeDistribution = results.reduce((acc, r) => {
      acc[r.grade] = (acc[r.grade] || 0) + 1;
      return acc;
    }, {});
    const avgGPA = (
      results.reduce((sum, r) => sum + (r.studentId?.gpa || 0), 0) / total
    ).toFixed(2);

    return buildResponse(res, 200, "Analytics fetched successfully", {
      total_results: total,
      passed,
      failed,
      pass_rate: ((passed / total) * 100).toFixed(1) + "%",
      grade_distribution: gradeDistribution,
      average_gpa: avgGPA,
    });
  } catch (error) {
    return buildResponse(res, 500, "Failed to get analytics", null, true, error);
  }
};

/**
 * 🗑️ Delete Result (Admin)
 */
export const deleteResult = async (req, res) => {
  try {
    const deleted = await Result.findByIdAndDelete(req.params.id);
    if (!deleted) return buildResponse(res, 404, "Result not found");

    return buildResponse(res, 200, "Result deleted successfully");
  } catch (error) {
    return buildResponse(res, 500, "Failed to delete result", null, true, error);
  }
};
