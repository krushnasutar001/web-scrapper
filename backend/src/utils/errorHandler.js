const logger = require('./logger');

/**
 * Custom error classes for different types of application errors
 */

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400);
    this.field = field;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

class ScrapingError extends AppError {
  constructor(message, details = null) {
    super(message, 500);
    this.details = details;
  }
}

/**
 * Error handler middleware for Express
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  logger.logError(err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous',
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID';
    error = new ValidationError(message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = new ConflictError(message);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ValidationError(message);
  }

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const message = err.errors.map(e => e.message).join(', ');
    error = new ValidationError(message);
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    const message = `${field} already exists`;
    error = new ConflictError(message);
  }

  // Sequelize foreign key constraint error
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    const message = 'Invalid reference to related resource';
    error = new ValidationError(message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AuthenticationError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AuthenticationError(message);
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = new ValidationError(message);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = new ValidationError(message);
  }

  // Default to 500 server error
  if (!error.statusCode) {
    error.statusCode = 500;
  }

  // Send error response
  const response = {
    success: false,
    error: {
      message: error.message || 'Internal server error',
      ...(error.field && { field: error.field }),
      ...(error.details && { details: error.details })
    }
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  // Add request ID for tracking
  if (req.id) {
    response.error.requestId = req.id;
  }

  res.status(error.statusCode).json(response);
};

/**
 * Async error wrapper to catch async errors in route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl}`);
  next(error);
};

/**
 * Validation error helper
 */
const createValidationError = (errors) => {
  if (Array.isArray(errors)) {
    const message = errors.map(err => err.msg || err.message).join(', ');
    return new ValidationError(message);
  }
  
  if (typeof errors === 'object' && errors.message) {
    return new ValidationError(errors.message, errors.field);
  }
  
  return new ValidationError(errors.toString());
};

/**
 * Database error helper
 */
const handleDatabaseError = (error) => {
  logger.error('Database error:', error);
  
  if (error.name === 'SequelizeConnectionError') {
    return new AppError('Database connection failed', 503);
  }
  
  if (error.name === 'SequelizeTimeoutError') {
    return new AppError('Database operation timed out', 503);
  }
  
  return new AppError('Database operation failed', 500);
};

/**
 * Scraping error helper
 */
const handleScrapingError = (error, context = {}) => {
  logger.logScraping.error(context.jobId, error, context);
  
  if (error.message.includes('timeout')) {
    return new ScrapingError('Scraping operation timed out', { type: 'timeout', ...context });
  }
  
  if (error.message.includes('blocked') || error.message.includes('captcha')) {
    return new ScrapingError('Scraping blocked by target site', { type: 'blocked', ...context });
  }
  
  if (error.message.includes('rate limit')) {
    return new RateLimitError('Rate limit exceeded for scraping');
  }
  
  return new ScrapingError(error.message || 'Scraping operation failed', context);
};

/**
 * Process exit handler for uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  
  // Give time for logging before exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Give time for logging before exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ScrapingError,
  
  // Middleware and handlers
  errorHandler,
  asyncHandler,
  notFoundHandler,
  
  // Helper functions
  createValidationError,
  handleDatabaseError,
  handleScrapingError
};