// Comprehensive Error Handling Middleware
const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error classes
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

class InsufficientCreditsError extends AppError {
  constructor(required, available) {
    super(`Insufficient credits. Required: ${required}, Available: ${available}`, 402);
    this.name = 'InsufficientCreditsError';
    this.required = required;
    this.available = available;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message = 'External service error') {
    super(`${service}: ${message}`, 503);
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  const errorContext = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    body: req.method !== 'GET' ? req.body : undefined,
    query: req.query,
    params: req.params,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode
    }
  };

  // Log based on error severity
  if (err.statusCode >= 500) {
    logger.error('Server error occurred', errorContext);
  } else if (err.statusCode >= 400) {
    logger.warn('Client error occurred', errorContext);
  } else {
    logger.info('Handled error occurred', errorContext);
  }

  // Handle specific error types
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID format';
    error = new ValidationError(message);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = new ConflictError(message);
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => val.message);
    error = new ValidationError('Validation failed', errors);
  }

  if (err.name === 'JsonWebTokenError') {
    error = new AuthenticationError('Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    error = new AuthenticationError('Token expired');
  }

  if (err.code === 'ECONNREFUSED') {
    error = new ExternalServiceError('Database', 'Connection refused');
  }

  if (err.code === 'ETIMEDOUT') {
    error = new ExternalServiceError('External Service', 'Request timeout');
  }

  // PostgreSQL specific errors
  if (err.code === '23505') { // Unique violation
    const field = err.detail?.match(/Key \((.+)\)=/)?.[1] || 'field';
    error = new ConflictError(`${field} already exists`);
  }

  if (err.code === '23503') { // Foreign key violation
    error = new ValidationError('Referenced resource does not exist');
  }

  if (err.code === '23502') { // Not null violation
    const field = err.column || 'field';
    error = new ValidationError(`${field} is required`);
  }

  // Redis specific errors
  if (err.message?.includes('Redis')) {
    error = new ExternalServiceError('Redis', err.message);
  }

  // Puppeteer specific errors
  if (err.message?.includes('Navigation timeout')) {
    error = new ExternalServiceError('Browser', 'Page load timeout');
  }

  if (err.message?.includes('Protocol error')) {
    error = new ExternalServiceError('Browser', 'Browser communication error');
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = new ValidationError('File too large');
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = new ValidationError('Unexpected file field');
  }

  // Default to 500 server error
  if (!error.statusCode) {
    error.statusCode = 500;
    error.message = 'Internal server error';
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      message: error.message,
      status: error.status || 'error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    }
  };

  // Add additional error details for specific error types
  if (error instanceof ValidationError && error.details) {
    errorResponse.error.details = error.details;
  }

  if (error instanceof InsufficientCreditsError) {
    errorResponse.error.required = error.required;
    errorResponse.error.available = error.available;
  }

  if (error instanceof RateLimitError && error.retryAfter) {
    res.set('Retry-After', error.retryAfter);
    errorResponse.error.retryAfter = error.retryAfter;
  }

  // Send error response
  res.status(error.statusCode).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl}`);
  next(error);
};

// Unhandled promise rejection handler
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection', {
    error: err.message,
    stack: err.stack,
    promise
  });
  
  // Close server gracefully
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack
  });
  
  // Close server gracefully
  process.exit(1);
});

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InsufficientCreditsError,
  ExternalServiceError,
  errorHandler,
  asyncHandler,
  notFoundHandler
};
