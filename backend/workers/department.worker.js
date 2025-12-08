import { processDepartmentJob } from "../controllers/computation.controller.js";
import { Queue } from "bull";

const departmentQueue = new Queue("department-computation", {
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Process up to 3 departments concurrently
departmentQueue.process(3, async (job) => {
  console.log(`Starting department job: ${job.id}`);
  return await processDepartmentJob(job);
});

// Event listeners for monitoring
departmentQueue.on("completed", (job, result) => {
  console.log(`Department job ${job.id} completed:`, result);
});

departmentQueue.on("failed", (job, error) => {
  console.error(`Department job ${job.id} failed:`, error.message);
});

departmentQueue.on("stalled", (job) => {
  console.warn(`Department job ${job.id} stalled`);
});

departmentQueue.on("waiting", (jobId) => {
  console.log(`Department job ${jobId} waiting`);
});

console.log("Department computation worker started");