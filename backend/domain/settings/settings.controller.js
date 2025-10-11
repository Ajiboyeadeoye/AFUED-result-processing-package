const Settings = require("../models/Settings");

// 🟢 Get Current Settings
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne().populate("updatedBy", "name email role");
    if (!settings) return res.status(404).json({ message: "Settings not found" });
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// 🟠 Update Settings (Superuser only)
exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    const userId = req.user._id; // from auth middleware

    const settings = await Settings.findOneAndUpdate(
      {},
      { ...updates, updatedBy: userId },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "University settings updated successfully.",
      settings,
    });
  } catch (error) {
    res.status(500).json({ message: "Update failed", error });
  }
};

// 🟣 Reset to Default (Optional)
exports.resetSettings = async (req, res) => {
  try {
    await Settings.deleteMany({});
    const defaultSettings = await Settings.create({});
    res.status(200).json({
      message: "Settings reset to default successfully.",
      defaultSettings,
    });
  } catch (error) {
    res.status(500).json({ message: "Reset failed", error });
  }
};
