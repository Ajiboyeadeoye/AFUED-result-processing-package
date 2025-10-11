const Semester = require("./semester.model");
const Settings = require("../settings/settings.model");

/**
 * 🟢 MARK START OF A NEW SEMESTER
 * - Ends any active semester
 * - Creates new semester record
 * - Updates global settings
 */
exports.startNewSemester = async (req, res) => {
  try {
    const { name, session } = req.body; // e.g. "First Semester", "2025/2026"
    const userId = req.user._id;

    // Step 1: End any currently active semester
    await Semester.updateMany({ isActive: true }, { isActive: false, endDate: new Date() });

    // Step 2: Create a new semester
    const newSemester = await Semester.create({
      name,
      session,
      isActive: true,
      createdBy: userId,
    });

    // Step 3: Update global settings
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

    res.status(201).json({
      message: `${name} for ${session} has officially begun.`,
      semester: newSemester,
      settings,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error starting new semester", error });
  }
};

/**
 * 🟠 OPEN OR CLOSE COURSE REGISTRATION
 */
exports.toggleRegistration = async (req, res) => {
  try {
    const { status } = req.body; // true = open, false = close
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
    res.status(500).json({ message: "Error updating registration status", error });
  }
};

/**
 * 🟣 OPEN OR CLOSE RESULT PUBLICATION
 */
exports.toggleResultPublication = async (req, res) => {
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

    res.status(200).json({
      message: `Result publication has been ${status ? "opened" : "closed"}.`,
      settings,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating result publication", error });
  }
};

/**
 * 🔵 GET CURRENT ACTIVE SEMESTER
 */
exports.getActiveSemester = async (req, res) => {
  try {
    const semester = await Semester.findOne({ isActive: true });
    if (!semester) return res.status(404).json({ message: "No active semester found" });
    res.status(200).json(semester);
  } catch (error) {
    res.status(500).json({ message: "Error fetching semester", error });
  }
};
