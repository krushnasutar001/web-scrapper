const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Add colors to winston
winston.addColors(logColors);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += `\nMetadata: ${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack } = info;
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// Create transports
const transports = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat
    })
  );
}

// File transports
transports.push(
  // Error logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // Combined logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // HTTP logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true
  })
);

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test'
});

// Add request logging middleware
logger.requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.http(`${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous'
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'http';
    
    logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id || 'anonymous'
    });
  });
  
  next();
};

// Add error logging helper
logger.logError = (error, context = {}) => {
  logger.error(error.message || error, {
    stack: error.stack,
    name: error.name,
    code: error.code,
    ...context
  });
};

// Add performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
  const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
  
  logger.log(level, `Performance: ${operation} took ${duration}ms`, {
    operation,
    duration,
    ...metadata
  });
};

// Add scraping specific logging helpers
logger.logScraping = {
  start: (jobId, type, query) => {
    logger.info(`Scraping job started`, {
      jobId,
      type,
      query,
      event: 'scraping_start'
    });
  },
  
  progress: (jobId, processed, total) => {
    logger.info(`Scraping progress`, {
      jobId,
      processed,
      total,
      percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
      event: 'scraping_progress'
    });
  },
  
  complete: (jobId, totalResults, duration) => {
    logger.info(`Scraping job completed`, {
      jobId,
      totalResults,
      duration,
      event: 'scraping_complete'
    });
  },
  
  error: (jobId, error, context = {}) => {
    logger.error(`Scraping job failed`, {
      jobId,
      error: error.message || error,
      stack: error.stack,
      event: 'scraping_error',
      ...context
    });
  },
  
  retry: (jobId, attempt, maxAttempts, error) => {
    logger.warn(`Scraping job retry`, {
      jobId,
      attempt,
      maxAttempts,
      error: error.message || error,
      event: 'scraping_retry'
    });
  }
};

// Add authentication logging helpers
logger.logAuth = {
  login: (email, success, ip) => {
    const level = success ? 'info' : 'warn';
    logger.log(level, `Login attempt`, {
      email,
      success,
      ip,
      event: 'auth_login'
    });
  },
  
  register: (email, success, ip) => {
    const level = success ? 'info' : 'warn';
    logger.log(level, `Registration attempt`, {
      email,
      success,
      ip,
      event: 'auth_register'
    });
  },
  
  passwordReset: (email, success, ip) => {
    const level = success ? 'info' : 'warn';
    logger.log(level, `Password reset attempt`, {
      email,
      success,
      ip,
      event: 'auth_password_reset'
    });
  }
};

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(logsDir, 'exceptions.log'),
    format: logFormat
  })
);

logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(logsDir, 'rejections.log'),
    format: logFormat
  })
);

// Export logger
module.exports = logger;