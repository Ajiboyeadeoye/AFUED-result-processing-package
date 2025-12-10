// queues/department.queue.js
import Queue from "bull";

const queueName = "department-computation";

let departmentQueue;

// Ensure only one instance per Node process
if (!global.departmentQueueInstance) {
  departmentQueue = new Queue(queueName, {
    redis: {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  global.departmentQueueInstance = departmentQueue;
} else {
  departmentQueue = global.departmentQueueInstance;
}

export { departmentQueue };
