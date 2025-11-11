import express from "express";
import { createTemplate, deleteTemplate, getNotifications, getTemplates, sendNotification, updateTemplate } from "./notification.controller.js";

const router = express.Router();

router.get("/templates", getTemplates)
router.post("/templates", createTemplate)
router.put("/templates/:id", updateTemplate)
router.delete("/templates/:id", deleteTemplate)
router.post("/send", sendNotification);
router.get("/:user_id", getNotifications);

export default router;
