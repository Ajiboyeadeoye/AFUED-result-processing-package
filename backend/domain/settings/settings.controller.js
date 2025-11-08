import Settings from "./settings.model.js";
import buildResponse from "../../utils/responseBuilder.js";

// ✅ Get Current Settings
export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne().populate("updatedBy", "name email role");

    if (!settings) {
      return buildResponse(res, 404, "Settings not found", null, true);
    }

    return buildResponse(res, 200, "Settings retrieved successfully", settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return buildResponse(res, 500, "Failed to fetch settings", null, true, error);
  }
};

// ⚙️ Update Settings (Super Admin Only)
export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    const userId = req.user?._id;

    const allowedUpdates = Object.keys(Settings.schema.paths);
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedUpdates.includes(key))
    );

    const settings = await Settings.findOneAndUpdate(
      {},
      { ...filteredUpdates, updatedBy: userId },
      { new: true, upsert: true }
    );

    return buildResponse(res, 200, "University settings updated successfully", settings);
  } catch (error) {
    console.error("Error updating settings:", error);
    return buildResponse(res, 500, "Failed to update settings", null, true, error);
  }
};

// 🔄 Reset Settings to Default (Super Admin Only)
export const resetSettings = async (req, res) => {
  try {
    await Settings.deleteMany({});
    const defaultSettings = await Settings.create({});
    return buildResponse(res, 200, "Settings reset to default successfully", defaultSettings);
  } catch (error) {
    console.error("Error resetting settings:", error);
    return buildResponse(res, 500, "Failed to reset settings", null, true, error);
  }
};
