// utils/logger.js
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure log directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Create the logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          let log = `${timestamp} [${level}] ${message}`;
          if (stack) {
            log += `\n${stack}`;
          }
          return log;
        })
      )
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // File transport for warnings
    new winston.transports.File({
      filename: path.join(logDir, 'warn.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),
  ],
});

// Optional: Create a stream for Morgan (HTTP logging)
logger.stream = {
  write: (message) => logger.http(message.trim())
};

// Custom logging methods for refactoring
logger.crossDomainAccess = (domain, operation, targetModel, filePath) => {
  logger.warn('CROSS_DOMAIN_MODEL_ACCESS', {
    domain,
    operation,
    targetModel,
    file: filePath,
    timestamp: new Date().toISOString(),
    recommendation: `Use ${targetModel}Service instead of direct model import`
  });
};

logger.migration = (from, to, filePath, context = {}) => {
  logger.info('MODEL_ACCESS_MIGRATION', {
    from,
    to,
    file: filePath,
    ...context,
    timestamp: new Date().toISOString()
  });
};