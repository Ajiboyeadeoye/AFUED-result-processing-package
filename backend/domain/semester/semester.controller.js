import Semester from "./semester.model.js";
import Settings from "../settings/settings.model.js";

// 🟢 MARK START OF A NEW SEMESTER
export const startNewSemester = async (req, res) => {
  try {
    const { name, session } = req.body;
    const userId = req.user._id;

    await Semester.updateMany({ isActive: true }, { isActive: false, endDate: new Date() });

    const newSemester = await Semester.create({
      name,
      session,
      isActive: true,
      createdBy: userId,
    });

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
    res.status(500).json({ message: "Error updating registration status", error });
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

    res.status(200).json({
      message: `Result publication has been ${status ? "opened" : "closed"}.`,
      settings,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating result publication", error });
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
