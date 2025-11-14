import Notification from "./notification.model.js";
import User from "../user/user.model.js";
import Department from "../department/department.model.js";
import Settings from "../settings/settings.model.js";
import { sendEmail } from "../../utils/sendEmail.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { Template } from "./template.model.js";
import buildResponse from "../../utils/responseBuilder.js";
import fetchDataHelper from "../../utils/fetchDataHelper.js";
import { dataMaps } from "../../config/dataMap.js";

/* 🧠 Dynamic variable resolver */
async function resolveVariable(variable, context) {
  const [scope, ...keys] = variable.split(".");

  // Map available data sources
  const sources = {
    user: context.user,
    settings: context.settings,
    department: context.department,
  };

  let data = sources[scope];
  for (const key of keys) {
    if (!data) break;
    data = data[key];
  }

  // 🧩 Handle computed or custom variables
  if (!data) {
    switch (variable) {
      case "user.age_category":
        if (context.user?.dob) {
          const age = new Date().getFullYear() - new Date(context.user.dob).getFullYear();
          data = age < 18 ? "Underage" : age < 30 ? "Young Adult" : "Mature";
        }
        break;
      case "settings.current_semester_name":
        data = context.settings?.semester ? `Semester ${context.settings.semester}` : "Unknown";
        break;
      case "departments.count":
        data = context.departmentCount ?? 0;
        break;
      case "user.department.course_count":
        if (context.user?.department_id) {
          const count = await Course.countDocuments({ department_id: context.user.department_id });
          data = count;
        } else {
          data = 0;
        }
        break;
      case "portal_url":
        data = context.settings?.websiteUrl || "";
        break;

      default:
        data = "";
    }
  }

  return data ?? "";
}

/* 🧩 Template renderer */
async function renderTemplate(template, context) {
  const matches = template.match(/{{\s*([\w.]+)\s*}}/g) || [];

  let rendered = template;
  for (const match of matches) {
    const variable = match.replace(/{{\s*|\s*}}/g, "");
    const value = await resolveVariable(variable, context);
    rendered = rendered.replace(match, value);
  }
  return rendered;
}

/* ✨ CREATE Template */
export const createTemplate = async (req, res) => {
  try {
    const { title: name, channel, email_content: email_template, whatsapp_content: whatsapp_template, variables } = req.body;

    if ((channel == "both" || !channel) && (!email_template || !whatsapp_template)) {
      return res.status(400).json({ success: false, message: "Both (email or whatsapp) is required for 'both' channel" });
    } else if (channel == "email" && !email_template) {
      return res.status(400).json({ success: false, message: "Email template is required for 'email' channel" });
    } else if (channel == "whatsapp" && !whatsapp_template) {
      return res.status(400).json({ success: false, message: "WhatsApp template is required for 'whatsapp' channel" });
    }
    if (!name) {
      return res.status(400).json({ success: false, message: "Template name is required" });
    }

    const exists = await Template.findOne({ name });
    if (exists) {
      return res.status(400).json({ success: false, message: "Template already exists" });
    }

    const template = await Template.create({
      name,
      channel,
      email_template,
      whatsapp_template,
      variables,
      created_by: req.user?._id || null,
    });

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to create template" });
  }
};

/* 📋 GET All Templates */
export const getTemplates = async (req, res) => {
  try {
    const result = await fetchDataHelper(req, res, Template, {
      configMap: dataMaps.Template,
      autoPopulate: true,
      models: {},
      populate: [],
    });
    // const templates = await Template.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.log(error)
    res.status(500).json({ success: false, message: "Failed to fetch templates" });
    return buildResponse(res, 500, "Failed to fetch departments", null, true, error);
  }
};

/* 🔍 GET Single Template */
export const getTemplateById = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });
    res.status(200).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching template" });
  }
};

/* 🛠️ UPDATE Template */
export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await Template.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Template not found" });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update template" });
  }
};

/* ❌ DELETE Template */
export const deleteTemplate = async (req, res) => {
  try {
    const deleted = await Template.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Template not found" });
    res.status(200).json({ success: true, message: "Template deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete template" });
  }
};

export const sendNotification = async (req, res) => {
  try {
    const { target, recipientId, templateId } = req.body;
    const template = await Template.findById(templateId);
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });

    // Global context data
    const settings = await Settings.findOne({});
    const departmentCount = await Department.countDocuments();

    let recipients = [];
    if (target === "all") recipients = await User.find({});
    else if (target === "students") recipients = await User.find({ role: "student" });
    else if (target === "lecturers") recipients = await User.find({ role: "lecturer" });
    else if (target === "hods") recipients = await User.find({ role: "hod" });
    else if (target === "specific" && recipientId) {
      const user = await User.findById(recipientId);
      if (user) recipients = [user];
    }

    if (recipients.length === 0)
      return res.status(400).json({ success: false, message: "No recipients found" });

    for (const user of recipients) {
      const context = { user, settings, departmentCount };
      const emailContent = template.email_template
        ? await renderTemplate(template.email_template, context)
        : "";
      const whatsappContent = template.whatsapp_template
        ? await renderTemplate(template.whatsapp_template, context)
        : "";

      await Notification.create({
        recipient_id: user._id,
        title: template.name,
        message: whatsappContent || emailContent,
        type: template.channel,
      });

      if ((template.channel === "email" || template.channel === "both") && user.email && emailContent)
        await sendEmail({ to: user.email, subject: template.name, html: emailContent });

      if ((template.channel === "whatsapp" || template.channel === "both") && whatsappContent) {
        const phone = user.phone || "08143185267";
        await sendWhatsAppMessage(phone, whatsappContent);
      }
    }

    res.status(200).json({
      success: true,
      message: `Notification sent via ${template.channel} to ${recipients.length} users`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send notification" });
  }
};


/* 📬 GET User Notifications */
export const getNotifications = async (req, res) => {
  try {
    const user_id = req.user._id;
    // 2️⃣ Mark all as read
    await Notification.updateMany(
      { recipient_id: user_id, is_read: false },
      { $set: { is_read: true } }
    );

    // 1️⃣ Fetch all notifications for this user
    const notifications = await fetchDataHelper(req, res, Notification, {
      configMap: dataMaps.Notifications,
      autoPopulate: true,
      models: {},
      additionalFilters: { recipient_id: user_id },
    });


    // 3️⃣ Return notifications
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching notifications" });
  }
};
/* 📬 GET User Notifications */
export const getTopUnread = async (req, res) => {
  try {
    const user_id = req.user._id;
    // 2️⃣ Mark all as read
    await Notification.updateMany(
      { recipient_id: user_id, is_read: false },
      { $set: { is_read: true } }
    );

    // 1️⃣ Fetch all notifications for this user
    const notifications = await fetchDataHelper(req, res, Notification, {
      configMap: dataMaps.Notifications,
      autoPopulate: true,
      models: {},
      additionalFilters: { recipient_id: user_id },
      maxLimit: 3
    });


    // 3️⃣ Return notifications
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching notifications" });
  }
};

export const getUnreadNotificationCount = async (req, res) => {
  try {
    const user_id = req.user._id;

    console.log(user_id)
    // Count unread notifications for this user
    const unreadCount = await Notification.countDocuments({
      recipient_id: user_id,
      // is_read: false,
    });

    console.log("Notification Count fetched")
    
    return buildResponse.success(res, "", unreadCount)
    // Return count
    // res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching unread notifications count" });
  }
};
