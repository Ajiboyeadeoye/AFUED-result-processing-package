import fs from "fs";
import path from "path";
import mongoose from "mongoose";

/**
 * 🧱 Optional MongoDB schema for persistent logs
 */
const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    role: String,
    action: String,
    endpoint: String,
    method: String,
    ipAddress: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now },
    details: Object,
  },
  { timestamps: true }
);

const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

/**
 * 🧾 Audit Logger Middleware
 * --------------------------
 * Automatically logs:
 *   - userId, role, action
 *   - route & method
 *   - timestamp & IP
 * Works globally or per-route.
 */
export const auditLogger = (actionDescription = "Performed an action") => {
  return async (req, res, next) => {
    try {
      const logData = {
        userId: req.user?._id,
        role: req.user?.role,
        action: actionDescription,
        endpoint: req.originalUrl,
        method: req.method,
        ipAddress:
          req.headers["x-forwarded-for"] || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
        details: req.body,
      };

      // ✅ File logging (default)
      const logDir = "logs";
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
      const logFile = path.join(logDir, "audit.log");

      const logEntry = `[${logData.timestamp}] [${logData.role}] ${
        logData.userId || "Anonymous"
      } - ${logData.action} at ${logData.endpoint} (${logData.method})\n`;

      fs.appendFileSync(logFile, logEntry);

      // ✅ Optional MongoDB logging
      if (process.env.ENABLE_DB_LOGGING === "true") {
        await AuditLog.create(logData);
      }

      next();
    } catch (error) {
      console.error("❌ Audit log error:", error);
      next(); // don't block requests
    }
  };
};
