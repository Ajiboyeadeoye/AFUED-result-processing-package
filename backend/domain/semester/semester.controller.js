import Semester from "./semester.model.js";
import Settings from "../settings/settings.model.js";
import buildResponse from "../../utils/responseBuilder.js";

/**
 * Valid semester names (type-safe)
 */
const VALID_SEMESTERS = ["First Semester", "Second Semester", "Summer Semester"];

/**
 * Regex patterns for validation
 */
const sessionRegex = /^\d{4}\/\d{4}$/; // e.g., "2024/2025"
const nameRegex = /^(First|Second|Summer)\sSemester$/; // e.g., "First Semester"

export const startNewSemester = async (req, res) => {
  try {
    const { name, session } = req.body;
    const userId = req.user._id;

    // Validate inputs
    if (!name || !session) {
      return res.status(400).json(buildResponse.error("Semester name and session are required."));
    }

    // Regex validation
    if (!nameRegex.test(name)) {
      return res.status(400).json(buildResponse.error("Invalid semester name format." ));
    }
    if (!sessionRegex.test(session)) {
      return res.status(400).json(buildResponse.error("Session must be in YYYY/YYYY format (e.g., 2024/2025)"));
    }

    // Type-safe validation
    if (!VALID_SEMESTERS.includes(name)) {
      return res.status(400).json(buildResponse.error("Invalid semester name. Must be one of: " + VALID_SEMESTERS.join(", ") ));
    }

    // End any active semesters
    await Semester.updateMany({ isActive: true }, { isActive: false, endDate: new Date() });

    // Create new semester
    const newSemester = await Semester.create({
      name,
      session,
      isActive: true,
      createdBy: userId,
    });

    // Update settings
    const settings = await Settings.findOneAndUpdate(
      {},
      {
        currentSession: session,
        currentSemester: name,
        activeSemesterId: newSemester._id,
        registrationOpen: false,
        resultPublicationOpen: false,
        updatedBy: userId,
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: `${name} for ${session} has officially begun.`,
      semester: newSemester,
      settings,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json(buildResponse.error("Error starting new semester"));
  }
};

// 🟠 OPEN OR CLOSE COURSE REGISTRATION
export const toggleRegistration = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user._id;

    const settings = await Settings.findOneAndUpdate(
      {},
      { registrationOpen: status, updatedBy: userId },
      { new: true }
    );

    if (settings.activeSemesterId) {
      await Semester.findByIdAndUpdate(settings.activeSemesterId, { isRegistrationOpen: status });
    }

    res.status(200).json({
      message: `Course registration has been ${status ? "opened" : "closed"}.`,
      settings,
    });
  } catch (error) {
    res.status(500).json(buildResponse.error("Error updating registration status"));
  }
};

// 🟣 OPEN OR CLOSE RESULT PUBLICATION
export const toggleResultPublication = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user._id;

    const settings = await Settings.findOneAndUpdate(
      {},
      { resultPublicationOpen: status, updatedBy: userId },
      { new: true }
    );

    if (settings.activeSemesterId) {
      await Semester.findByIdAndUpdate(settings.activeSemesterId, { isResultsPublished: status });
    }

    res.status(200).json(buildResponse.success(`Result publication has been ${status ? "opened" : "closed"}.`,
      settings));
  } catch (error) {
    const response = buildResponse.error("Error updating result publication")
    res.status(500).json(response);
  }
};

// 🔵 GET CURRENT ACTIVE SEMESTER
export const getActiveSemester = async (req, res) => {
  try {
    const semester = await Semester.findOne({ isActive: true });
    if (!semester) return res.status(404).json({ message: "No active semester found" });
    res.status(200).json(semester);
  } catch (error) {
    res.status(500).json({ message: "Error fetching semester", error });
  }
};
/**
 * 🔴 Deactivate Current Semester
 */
export const deactivateSemester = async (req, res) => {
  try {
    // Find the currently active semester
    const activeSemester = await Semester.findOne({ isActive: true });
    if (!activeSemester) {
      return buildResponse.error(res,"No active semester to deactivate.")
    }

    // Deactivate it
    activeSemester.isActive = false;
    activeSemester.endDate = new Date();
    await activeSemester.save();

    // Optionally update settings
    await Settings.findOneAndUpdate(
      {},
      {
        activeSemesterId: null,
        currentSemester: null,
        registrationOpen: false,
        resultPublicationOpen: false,
        updatedBy: req.user?._id,
      }
    );

    return buildResponse.success(res,"Semester deactivated successfully.", activeSemester)
  } catch (error) {
    console.error("❌ deactivateSemester Error:", error);
    return buildResponse.error(res, "Error deactivating semester", 500, true);
  }
};
