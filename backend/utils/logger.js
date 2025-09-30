// Enhanced Logging Service with Winston
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message
    };

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logEntry = { ...logEntry, ...meta };
    }

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: {
    service: 'linkedin-automation',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true
    }),

    // Application-specific logs
    new winston.transports.File({
      filename: path.join(logsDir, 'jobs.log'),
      level: 'info',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf((info) => {
          // Only log job-related entries
          if (info.jobId || info.queue || info.userId || info.credits) {
            return JSON.stringify(info);
          }
          return false;
        })
      )
    }),

    // Security log file
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf((info) => {
          // Only log security-related entries
          if (info.security || info.auth || info.login || info.unauthorized) {
            return JSON.stringify(info);
          }
          return false;
        })
      )
    })
  ],

  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3
    })
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Enhanced logging methods
class EnhancedLogger {
  constructor(winstonLogger) {
    this.winston = winstonLogger;
  }

  // Standard logging methods
  error(message, meta = {}) {
    this.winston.error(message, meta);
  }

  warn(message, meta = {}) {
    this.winston.warn(message, meta);
  }

  info(message, meta = {}) {
    this.winston.info(message, meta);
  }

  debug(message, meta = {}) {
    this.winston.debug(message, meta);
  }

  // Specialized logging methods
  logJobStart(jobId, jobType, userId, meta = {}) {
    this.info('Job started', {
      jobId,
      jobType,
      userId,
      event: 'job_start',
      ...meta
    });
  }

  logJobComplete(jobId, jobType, userId, duration, result = {}) {
    this.info('Job completed', {
      jobId,
      jobType,
      userId,
      duration,
      event: 'job_complete',
      result
    });
  }

  logJobFailed(jobId, jobType, userId, error, attempt = 1) {
    this.error('Job failed', {
      jobId,
      jobType,
      userId,
      error: error.message,
      stack: error.stack,
      attempt,
      event: 'job_failed'
    });
  }

  logCreditTransaction(userId, amount, type, balance, jobId = null) {
    this.info('Credit transaction', {
      userId,
      amount,
      type,
      balance,
      jobId,
      event: 'credit_transaction'
    });
  }

  logUserAction(userId, action, details = {}) {
    this.info('User action', {
      userId,
      action,
      event: 'user_action',
      ...details
    });
  }

  logSecurityEvent(event, details = {}) {
    this.warn('Security event', {
      event,
      security: true,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  logAuthAttempt(email, success, ip, userAgent = null) {
    this.info('Authentication attempt', {
      email,
      success,
      ip,
      userAgent,
      auth: true,
      event: 'auth_attempt'
    });
  }

  logDatabaseQuery(query, duration, error = null) {
    if (error) {
      this.error('Database query failed', {
        query: query.substring(0, 200), // Truncate long queries
        duration,
        error: error.message,
        event: 'db_query_failed'
      });
    } else {
      this.debug('Database query executed', {
        query: query.substring(0, 200),
        duration,
        event: 'db_query'
      });
    }
  }

  logAPIRequest(method, url, statusCode, duration, userId = null, ip = null) {
    this.info('API request', {
      method,
      url,
      statusCode,
      duration,
      userId,
      ip,
      event: 'api_request'
    });
  }

  logSystemMetrics(metrics) {
    this.info('System metrics', {
      ...metrics,
      event: 'system_metrics'
    });
  }

  // Performance monitoring
  startTimer(label) {
    const start = process.hrtime.bigint();
    return {
      end: () => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to milliseconds
        this.debug(`Timer: ${label}`, { duration: `${duration.toFixed(2)}ms` });
        return duration;
      }
    };
  }

  // Request correlation
  child(meta) {
    return new EnhancedLogger(this.winston.child(meta));
  }

  // Log aggregation helpers
  logBatch(entries) {
    entries.forEach(entry => {
      const { level, message, ...meta } = entry;
      this.winston.log(level, message, meta);
    });
  }

  // Health check logging
  logHealthCheck(service, status, details = {}) {
    this.info('Health check', {
      service,
      status,
      event: 'health_check',
      ...details
    });
  }

  // Rate limiting logs
  logRateLimit(identifier, limit, windowMs, current) {
    this.warn('Rate limit triggered', {
      identifier,
      limit,
      windowMs,
      current,
      event: 'rate_limit'
    });
  }
}

// Create enhanced logger instance
const enhancedLogger = new EnhancedLogger(logger);

// Graceful shutdown handler
process.on('SIGINT', () => {
  enhancedLogger.info('Received SIGINT, shutting down gracefully');
  logger.end();
});

process.on('SIGTERM', () => {
  enhancedLogger.info('Received SIGTERM, shutting down gracefully');
  logger.end();
});

// Export both the enhanced logger and winston instance
module.exports = enhancedLogger;
module.exports.winston = logger;