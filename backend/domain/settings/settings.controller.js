import {  response } from "express";
import buildResponse from "../../utils/responseBuilder.js";
import Settings from "./settings.model.js";

// 🟢 Get Current Settings
export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne().populate("updatedBy", "name email role");
    if (!settings) return res.status(404).json(buildResponse.error("Settigs Not found"));
    const response = buildResponse.success("Success", settings)
    res.status(200).json(response);
  } catch (error) {
    const response = buildResponse.error("Server Error")
    res.status(500).json(response);
  }
};

// 🟠 Update Settings (Superuser only)
export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    const userId = req.user._id; // from auth middleware

    const settings = await Settings.findOneAndUpdate(
      {},
      { ...updates, updatedBy: userId },
      { new: true, upsert: true }
    );


    const response = buildResponse.success('University settings updated successfully', settings)
    res.status(200).json(response);
  } catch (error) {
    const response = buildResponse.error('Update failed')
    res.status(500).json(response);
  }
};

// 🟣 Reset to Default (Optional)
export const resetSettings = async (req, res) => {
  try {
    await Settings.deleteMany({});
    const defaultSettings = await Settings.create({});
    res.status(200).json(buildResponse("Settings reset to default successfully.",
      defaultSettings))
  } catch (error) {
    res.status(500).json(buildResponse("Reset Failed"));
  }
};
