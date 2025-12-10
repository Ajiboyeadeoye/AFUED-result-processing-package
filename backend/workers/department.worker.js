// workers/department.worker.js
import mongoose from "mongoose";
import Agenda from "agenda";
import { processDepartmentJob } from "../domain/result/computation.controller.js";
import { sendNotificationCore } from "../domain/notification/notification.controller.js";
import departmentModel from "../domain/department/department.model.js";

let agendaInstance;

/**
 * Initialize Agenda worker
 */
export async function initDepartmentWorker() {
  if (agendaInstance) {
    console.log("[Agenda Init] Agenda instance already exists.");
    return agendaInstance;
  }

  console.log("[Agenda Init] Creating new Agenda instance...");
  agendaInstance = new Agenda({
    mongo: mongoose.connection,
    db: { collection: "agendaJobs" },
    defaultLockLifetime: 60000,
    maxConcurrency: 5,
    processEvery: "3 seconds",
  });

  // Event listeners
  agendaInstance.on("start", job =>
    console.log(`[Agenda Event] Job started: ${job.attrs.name} (${job.attrs._id})`)
  );
  agendaInstance.on("complete", job =>
    console.log(`[Agenda Event] Job completed: ${job.attrs.name} (${job.attrs._id})`)
  );
  agendaInstance.on("success", job =>
    console.log(`[Agenda Event] Job success: ${job.attrs.name} (${job.attrs._id})`)
  );
  agendaInstance.on("fail", (err, job) =>
    console.error(`[Agenda Event] Job failed: ${job.attrs.name} (${job.attrs._id}) ->`, err.message)
  );

  // Wait for ready
  await new Promise((resolve, reject) => {
    agendaInstance.once("ready", () => {
      console.log("[Agenda Event] Agenda ready and polling the DB...");
      resolve();
    });
    agendaInstance.once("error", err => {
      console.error("[Agenda Event] Agenda startup error:", err);
      reject(err);
    });
  });

  // Heartbeat job
  agendaInstance.define("heartbeat", async () => {
    console.log("[Heartbeat] Agenda alive at", new Date());
  });
  await agendaInstance.every("10 seconds", "heartbeat");

  // Define notification job
  agendaInstance.define(
    "send-notification",
    { priority: "normal", concurrency: 10 },
    async job => {
      const { target, recipientId, templateId, message, metadata } = job.attrs.data;
      console.log(`[Notification Worker] Processing notification job: ${job.attrs._id}`);
      
      try {
        await sendNotificationCore({
          target,
          recipientId,
          message,
          templateId,
          metadata
        });
        console.log(`[Notification Worker] Notification sent successfully: ${job.attrs._id}`);
        return true;
      } catch (error) {
        console.error(`[Notification Worker] Failed to send notification: ${job.attrs._id}`, error.message);
        throw error; // Let Agenda handle retries
      }
    }
  );

  // Department job
  agendaInstance.define(
    "department-computation",
    { priority: "high", concurrency: 3 },
    async job => {
      console.log("[Department Worker] >>> START job:", job.attrs._id);
      const { departmentId, masterComputationId, computedBy, jobId } = job.attrs.data;

      try {
        const result = await processDepartmentJob(job.attrs.data);
        console.log("[Department Worker] <<< FINISHED job:", job.attrs._id, "Result:", result);
        
        // Send success notification
        await queueNotification({
          target: "specific",
          recipientId: computedBy,
          message: `Job (${jobId}) for department completed successfully`,
          metadata: {
            jobId,
            departmentId,
            masterComputationId,
            status: "success"
          }
        });
        
        return result;
      } catch (error) {
        console.error("[Department Worker] Job failed:", job.attrs._id, error.message);

        let departmentName = departmentId;
        try {
          const dep = await departmentModel.findById(departmentId).lean();
          if (dep?.name) departmentName = dep.name;
        } catch (err) {
          console.error("Failed fetching department name:", err.message);
        }

        // Send failure notification using Agenda
        await queueNotification({
          target: "specific",
          recipientId: computedBy,
          message: `Job (${jobId}) for department (${departmentName}) failed: ${error.message}`,
          metadata: {
            jobId,
            departmentId,
            departmentName,
            masterComputationId,
            status: "failed",
            error: error.message
          }
        });

        throw error;
      }
    }
  );

  // Start Agenda
  await agendaInstance.start();
  console.log("[Agenda Init] Agenda started! Polling jobs every 3 seconds.");

  // Monitor pending jobs
  setInterval(async () => {
    const pending = await agendaInstance.jobs({ nextRunAt: { $ne: null }, lockedAt: null });
    console.log(`[Agenda Monitor] Pending jobs count: ${pending.length}`);
  }, 10000);

  return agendaInstance;
}

/**
 * Queue a notification job using Agenda
 * @param {Object} notificationData - Notification data
 * @param {string} notificationData.target - "specific", "group", or "broadcast"
 * @param {string} notificationData.recipientId - User ID or group ID
 * @param {string} notificationData.message - Notification message
 * @param {string} [notificationData.templateId] - Template ID if using templates
 * @param {Object} [notificationData.metadata] - Additional metadata
 * @param {Object} [options] - Job scheduling options
 * @param {Date|string} [options.schedule] - When to run (ISO string or Date)
 * @param {string} [options.priority] - "low", "normal", "high", "critical"
 * @returns {Promise<boolean>} - Success status
 */
export const queueNotification = async (notificationData, options = {}) => {
  if (!agendaInstance) {
    console.error("[Notification Queue] Agenda not initialized");
    return false;
  }

  try {
    const jobData = {
      ...notificationData,
      timestamp: new Date().toISOString()
    };

    const jobOptions = {
      priority: options.priority || "normal",
      ...(options.schedule && { nextRunAt: new Date(options.schedule) })
    };

    // Create the job
    const job = agendaInstance.create("send-notification", jobData);
    
    // Apply options
    if (jobOptions.priority) job.priority(jobOptions.priority);
    if (jobOptions.nextRunAt) job.schedule(jobOptions.nextRunAt);
    
    // Save the job
    await job.save();
    
    console.log(`[Notification Queue] Notification queued: ${job.attrs._id}`);
    return true;
  } catch (error) {
    console.error("[Notification Queue] Failed to queue notification:", error);
    return false;
  }
};

/**
 * Schedule a notification for later delivery
 * @param {Date|string} when - When to send the notification
 * @param {Object} notificationData - Notification data
 * @returns {Promise<boolean>} - Success status
 */
export const scheduleNotification = async (when, notificationData) => {
  return await queueNotification(notificationData, { schedule: when });
};

/**
 * Get notification job status
 * @param {string} jobId - Agenda job ID
 * @returns {Promise<Object|null>} - Job status or null if not found
 */
export const getNotificationStatus = async (jobId) => {
  if (!agendaInstance) return null;
  
  try {
    const jobs = await agendaInstance.jobs({ _id: new mongoose.Types.ObjectId(jobId) });
    if (jobs.length === 0) return null;
    
    const job = jobs[0];
    return {
      id: job.attrs._id.toString(),
      name: job.attrs.name,
      status: job.attrs.failedAt ? "failed" : 
              job.attrs.lastFinishedAt ? "completed" :
              job.attrs.lockedAt ? "running" : "scheduled",
      nextRunAt: job.attrs.nextRunAt,
      lastRunAt: job.attrs.lastRunAt,
      lastFinishedAt: job.attrs.lastFinishedAt,
      failedAt: job.attrs.failedAt,
      failCount: job.attrs.failCount,
      failReason: job.attrs.failReason,
      data: job.attrs.data
    };
  } catch (error) {
    console.error("[Notification Status] Error fetching job status:", error);
    return null;
  }
};