import mongoose from "mongoose";
import Agenda from "agenda";
import dotenv from "dotenv";
import { processDepartmentJob } from "../domain/result/computation.controller.js";
import { sendNotificationCore } from "../domain/notification/notification.controller.js";
import departmentModel from "../domain/department/department.model.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI2 || "mongodb://localhost:27017/afued_db";
console.log(MONGO_URI);

async function connectMongo() {
  console.log("[MongoDB] Connecting...");
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log("[MongoDB] Connected.");
}

// Create a global agenda instance
let agenda;

async function startWorker() {
  agenda = new Agenda({
    mongo: mongoose.connection,
    db: { collection: "agendaJobs" },
    defaultLockLifetime: 60000,
    maxConcurrency: 5,
    processEvery: "3 seconds",
  });

  agenda.define("heartbeat", async () => {
    console.log("[Heartbeat] Worker alive at", new Date());
  });
  await agenda.every("1000 seconds", "heartbeat");

  console.log(23);
  
  // Define department computation job
  agenda.define(
    "department-computation",
    { priority: "high", concurrency: 3 },
    async job => {
      console.log("[Worker] >>> START job:", job.attrs._id);
      const { departmentId, masterComputationId, computedBy, jobId } = job.attrs.data;
      try {
        console.log(job.attrs.data);
        const result = await processDepartmentJob(job.attrs);
        console.log("[Worker] <<< FINISHED job:", job.attrs._id, "Result:", result);
        return result;
      } catch (err) {
        console.error("[Worker] Job failed:", job.attrs._id, err.message);
        let depName = departmentId;
        try {
          const dep = await departmentModel.findById(departmentId).lean();
          if (dep?.name) depName = dep.name;
        } catch {}
        await sendNotificationCore({
          target: "specific",
          recipientId: computedBy,
          message: `Job (${jobId}) for department (${depName}) failed: ${err.message}`,
        });
        throw err;
      }
    }
  );

  // Define notification job
  agenda.define(
    "send-notification",
    { priority: "normal", concurrency: 10 },
    async job => {
      console.log("[Worker] Processing notification job:", job.attrs._id);
      const { target, recipientId, templateId, message, metadata } = job.attrs.data;
      
      try {
        // Call your existing notification controller
        const result = await sendNotificationCore({
          target,
          recipientId,
          templateId: null,
          message,
          metadata
        });
        console.log("[Worker] Notification sent successfully:", job.attrs._id);
        return result;
      } catch (err) {
        console.error("[Worker] Notification job failed:", job.attrs._id, err.message);
        // You can add retry logic here if needed
        throw err;
      }
    }
  );

  agenda.on("start", job => console.log(`[Agenda] Job started: ${job.attrs.name}`));
  agenda.on("complete", job => console.log(`[Agenda] Job completed: ${job.attrs.name}`));
  agenda.on("fail", (err, job) => console.error(`[Agenda] Job failed: ${job.attrs.name} ->`, err.message));

  await agenda.start();
  console.log("[Worker] Agenda started. Polling every 3s.");

  // Monitor
  setInterval(async () => {
    const pending = await agenda.jobs({ nextRunAt: { $ne: null }, lockedAt: null });
    console.log(`[Monitor] Pending jobs: ${pending.length}`);
  }, 10000);
}

(async () => {
  await connectMongo();
  await startWorker();
  console.log("[Worker] Department worker running standalone!");
  
})();
