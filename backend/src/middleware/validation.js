const { validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errorHandler');

/**
 * Middleware to handle express-validator validation results
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  next();
};

/**
 * Middleware to validate file upload
 */
const validateFileUpload = (options = {}) => {
  const {
    required = true,
    allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
    maxSize = 10 * 1024 * 1024 // 10MB
  } = options;
  
  return (req, res, next) => {
    if (required && !req.file) {
      return res.status(400).json({
        success: false,
        message: 'File upload is required'
      });
    }
    
    if (req.file) {
      // Check file type
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
      
      // Check file size
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`
        });
      }
    }
    
    next();
  };
};

/**
 * Middleware to validate LinkedIn URLs
 */
const validateLinkedInUrl = (urlField = 'url') => {
  return (req, res, next) => {
    const url = req.body[urlField];
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: `${urlField} is required`
      });
    }
    
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes('linkedin.com')) {
        return res.status(400).json({
          success: false,
          message: 'URL must be a LinkedIn URL'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format'
      });
    }
    
    next();
  };
};

/**
 * Middleware to validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  
  if (page < 1) {
    return res.status(400).json({
      success: false,
      message: 'Page must be greater than 0'
    });
  }
  
  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      message: 'Limit must be between 1 and 100'
    });
  }
  
  req.pagination = {
    page,
    limit,
    offset: (page - 1) * limit
  };
  
  next();
};

/**
 * Middleware to sanitize input data
 */
const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS or injection attempts
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  };
  
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };
  
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

module.exports = {
  validateRequest,
  validateFileUpload,
  validateLinkedInUrl,
  validatePagination,
  sanitizeInput
};