import mongoose from "mongoose";
import dotenv from "dotenv";
import Agenda from "agenda";

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/afued_db";

// Global agenda connection
let agendaInstance = null;

// Create or return existing agenda instance
async function getAgenda() {
  if (!agendaInstance) {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    agendaInstance = new Agenda({
      mongo: mongoose.connection,
      db: { collection: "agendaJobs" }
    });

    console.log("[Agenda] Connected through shared instance");
  }

  return agendaInstance;
}

// Add department job
export async function addDepartmentJob(data) {
  const agenda = await getAgenda();

  const job = agenda.create("department-computation", data);
  job.schedule(new Date());

  if (data.priority) {
    job.priority(data.priority);
  }

  await job.save();
  console.log("[Agenda] Department job added:", job.attrs._id);

  return job;
}

// Queue notification job
export async function queueNotification(
  target,
  recipientId,
  templateId,
  message,
  metadata = {}
) {
  try {
    const agenda = await getAgenda();

    await agenda.now("send-notification", {
      target,
      recipientId,
      templateId,
      message,
      metadata,
      timestamp: new Date().toISOString()
    });

    console.log(`[Agenda] Notification queued for recipient: ${recipientId}`);
    return true;
  } catch (error) {
    console.error("Failed to queue notification:", error);
    return false;
  }
}

// departmentQueue helper
export const departmentQueue = {
  async getWaitingCount() {
    const agenda = await getAgenda();
    const jobs = await agenda.jobs({
      nextRunAt: { $ne: null },
      lockedAt: null,
      disabled: { $ne: true }
    });
    return jobs.length;
  },

  async getActiveCount() {
    const agenda = await getAgenda();
    const jobs = await agenda.jobs({
      lockedAt: { $ne: null },
      disabled: { $ne: true }
    });
    return jobs.length;
  },

  async getCompletedCount() {
    const agenda = await getAgenda();
    const jobs = await agenda.jobs({
      nextRunAt: null,
      $or: [
        { lastFinishedAt: { $ne: null } },
        { lastRunAt: { $ne: null } }
      ]
    });
    return jobs.length;
  },

  async getFailedCount() {
    const agenda = await getAgenda();
    const jobs = await agenda.jobs({
      $or: [
        { failedAt: { $ne: null } },
        { failCount: { $gt: 0 } }
      ]
    });
    return jobs.length;
  },

  async getWaiting() {
    const agenda = await getAgenda();
    return agenda.jobs({
      nextRunAt: { $ne: null },
      lockedAt: null,
      disabled: { $ne: true }
    });
  },

  async getActive() {
    const agenda = await getAgenda();
    return agenda.jobs({
      lockedAt: { $ne: null },
      disabled: { $ne: true }
    });
  },

  async getFailed() {
    const agenda = await getAgenda();
    return agenda.jobs({
      $or: [
        { failedAt: { $ne: null } },
        { failCount: { $gt: 0 } }
      ]
    });
  },

  async getCompleted() {
    const agenda = await getAgenda();
    return agenda.jobs({
      nextRunAt: null,
      $or: [
        { lastFinishedAt: { $ne: null } },
        { lastRunAt: { $ne: null } }
      ]
    });
  }
};
