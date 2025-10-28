import User from "../user/user.model.js";
import Applicant from "./applicant.model.js";
import Student from "../student/student.model.js";
import AdmissionSettings from "../admission/admissionSettings.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import { hashData } from "../../utils/hashData.js";
import createToken from "../../utils/createToken.js";

/**
 * 🧾 Register Applicant (Post-JAMB)
 * ---------------------------------
 * Handles public applicant signup for Post-JAMB registration.
 */
export const registerApplicant = async (req, res) => {
  try {
    const { name, email, password, jambRegNumber, programChoice, score } = req.body;

    
    // Basic validation for JAMB Reg Number
    if (!jambRegNumber || typeof jambRegNumber !== 'string') {
      return buildResponse(res, 400, "Invalid or missing JAMB registration number");
    }
    // Trim whitespace
    const trimmed = jambRegNumber.trim();

    // Example format check: allow 8-20 characters, digits and optionally letters, no spaces
    const jambRegex = /^[A-Za-z0-9]{8,20}$/;
    if (!jambRegex.test(trimmed)) {
      return buildResponse(res, 400, "JAMB registration number format is invalid");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser)
        return buildResponse(res, 400, "Email already registered");

    // ✅ Use your project-wide hashing helper
    const hashedPassword = await hashData(password);

    // Then use normalizedEmail when creating the user
    const user = await User.create({
     name,
     email: normalizedEmail,
    password: hashedPassword,
    role: "applicant",
});

    // const existingUser = await User.findOne({ email });
    // if (existingUser)
    //   return buildResponse(res, 400, "Email already registered");

    // ✅ Use your project-wide hashing helper
    // const hashedPassword = await hashData(password);

    // const user = await User.create({
    //   name,
    //   email,
    //   password: hashedPassword,
    //   role: "applicant",
    // });

    const applicant = await Applicant.create({
      userId: user._id,
      jambRegNumber,
      programChoice,
      score,
    });

    // Optionally issue JWT immediately
    const token = await createToken({ id: user._id, role: user.role });

    return buildResponse(res, 201, "Application submitted successfully", {
      token,
      user,
      applicant,
    });
  } catch (error) {
    console.error("❌ registerApplicant Error:", error);
    return buildResponse(res, 500, "Failed to register applicant", null, true, error);
  }
};

/**
 * 🔐 Applicant Login
 */
export const loginApplicant = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return buildResponse(res, 404, "User not found");

    // Compare passwords using hashData helper (you likely have a compare feature)
    const isMatch = await hashData(password, user.password, "compare");
    if (!isMatch) return buildResponse(res, 401, "Invalid credentials");

    const token = await createToken({ id: user._id, role: user.role });

    return buildResponse(res, 200, "Login successful", { token, user });
  } catch (error) {
    console.error("❌ loginApplicant Error:", error);
    return buildResponse(res, 500, "Login failed", null, true, error);
  }
};

/**
 * 👀 Get Applicant Profile / Application Status
 */
export const getMyApplication = async (req, res) => {
  try {
    const applicant = await Applicant.findOne({ userId: req.user.id })
      .populate("programChoice", "name code");

    if (!applicant) return buildResponse(res, 404, "Applicant not found");

    return buildResponse(res, 200, "Application fetched successfully", applicant);
  } catch (error) {
    console.error("❌ getMyApplication Error:", error);
    return buildResponse(res, 500, "Error fetching application", null, true, error);
  }
};

/**
 * ✏️ Update Applicant Info
 */
export const updateApplicant = async (req, res) => {
  try {
    const updated = await Applicant.findOneAndUpdate(
      { userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) return buildResponse(res, 404, "Applicant not found");

    return buildResponse(res, 200, "Application updated successfully", updated);
  } catch (error) {
    console.error("❌ updateApplicant Error:", error);
    return buildResponse(res, 500, "Failed to update application", null, true, error);
  }
};

/**
 * 🎯 Set Cut-Off Mark (Admin)
 * ----------------------------
 * Admin defines a global cutoff mark for automatic admission.
 * All applicants with scores >= cutoffMark are admitted automatically.
 */
export const setCutOffMark = async (req, res) => {
  try {
    const { cutoffMark } = req.body;
    if (!cutoffMark)
      return buildResponse(res, 400, "Cutoff mark is required");

    let settings = await AdmissionSettings.findOne();
    if (!settings) {
      settings = await AdmissionSettings.create({
        cutoffMark,
        lastUpdatedBy: req.user.id,
      });
    } else {
      settings.cutoffMark = cutoffMark;
      settings.lastUpdatedBy = req.user.id;
      await settings.save();
    }

    // Auto-process admissions
    const result = await autoProcessAdmissions(settings.cutoffMark);

    return buildResponse(res, 200, `Cutoff mark set to ${cutoffMark}`, result);
  } catch (error) {
    console.error("❌ setCutOffMark Error:", error);
    return buildResponse(res, 500, "Failed to set cutoff mark", null, true, error);
  }
};

/**
 * ⚙️ Auto Admission Processing
 * -----------------------------
 * Automatically admits/rejects applicants based on cutoff mark.
 */
export const autoProcessAdmissions = async (cutoffMark) => {
  try {
    const pendingApplicants = await Applicant.find({ admissionStatus: "pending" })
      .populate("programChoice");

    let admitted = 0, rejected = 0;

    for (const applicant of pendingApplicants) {
      if (applicant.score === null) continue;

      if (applicant.score >= cutoffMark) {
        applicant.admissionStatus = "admitted";

        const existingStudent = await Student.findOne({ userId: applicant.userId });
        if (!existingStudent) {
          await Student.create({
            userId: applicant.userId,
            departmentId: applicant.programChoice._id,
            facultyId: applicant.programChoice.faculty,
            level: "100",
            session: new Date().getFullYear(),
            matricNumber: `MAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          });
        }

        await User.findByIdAndUpdate(applicant.userId, { role: "student" });
        admitted++;
      } else {
        applicant.admissionStatus = "rejected";
        rejected++;
      }

      await applicant.save();
    }

    return { admitted, rejected };
  } catch (error) {
    console.error("❌ autoProcessAdmissions Error:", error);
    return { admitted: 0, rejected: 0, error: error.message };
  }
};
