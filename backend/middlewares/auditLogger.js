import fs from "fs";
import path from "path";
import mongoose from "mongoose";

/**
 * 🧱 MongoDB schema for persistent audit logs
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
    status: String,            // success/failure
    details: Object,           // body, query, params
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

/**
 * 🧾 Audit Logger Middleware
 */
export const auditLogger = (actionDescription = "Performed an action") => {
  return async (req, res, next) => {
    const logData = {
      userId: req.user?._id,
      role: req.user?.role || "Anonymous",
      action: actionDescription,
      endpoint: req.originalUrl,
      method: req.method,
      ipAddress: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      details: {
        body: req.body,
        query: req.query,
        params: req.params,
      },
      timestamp: new Date(),
      status: "pending",
    };

    // Log after response is finished to capture status
    res.on("finish", async () => {
      try {
        logData.status = res.statusCode < 400 ? "success" : "failure";

        // ✅ Async file logging
        const logDir = "logs";
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        const logFile = path.join(logDir, "audit.log");
        const logEntry = `[${logData.timestamp.toISOString()}] [${logData.role}] ${
          logData.userId || "Anonymous"
        } - ${logData.action} at ${logData.endpoint} (${logData.method}) - ${
          logData.status
        }\n`;
        fs.appendFile(logFile, logEntry, (err) => {
          if (err) console.error("Audit file log error:", err);
        });

        // ✅ Optional MongoDB logging
        if (process.env.ENABLE_DB_LOGGING === "true") {
          await AuditLog.create(logData);
        }
      } catch (error) {
        console.error("❌ Audit logger error:", error);
      }
    });

    next();
  };
};
