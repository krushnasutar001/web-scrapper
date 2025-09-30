// Request Validation Middleware
const Joi = require('joi');

// Validation schemas
const schemas = {
  // Job creation validation
  jobCreation: Joi.object({
    type: Joi.string().valid('profile', 'company', 'search').required()
      .messages({
        'any.only': 'Job type must be one of: profile, company, search',
        'any.required': 'Job type is required'
      }),
    
    configuration: Joi.object({
      filePath: Joi.string().when('$type', {
        is: Joi.string().valid('profile', 'company'),
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      
      proxyUrl: Joi.string().uri().optional()
        .messages({
          'string.uri': 'Proxy URL must be a valid URI'
        }),
      
      linkedinCookie: Joi.string().min(10).required()
        .messages({
          'string.min': 'LinkedIn cookie must be at least 10 characters',
          'any.required': 'LinkedIn cookie is required'
        }),
      
      searchQuery: Joi.string().when('$type', {
        is: 'search',
        then: Joi.string().required().min(3).max(200),
        otherwise: Joi.string().optional()
      }).messages({
        'string.min': 'Search query must be at least 3 characters',
        'string.max': 'Search query cannot exceed 200 characters'
      }),
      
      maxResults: Joi.number().integer().min(1).max(1000).default(100)
        .messages({
          'number.min': 'Max results must be at least 1',
          'number.max': 'Max results cannot exceed 1000'
        })
    }).required(),
    
    priority: Joi.number().integer().min(1).max(10).default(5)
      .messages({
        'number.min': 'Priority must be between 1 and 10',
        'number.max': 'Priority must be between 1 and 10'
      }),
    
    scheduledFor: Joi.date().greater('now').optional()
      .messages({
        'date.greater': 'Scheduled time must be in the future'
      })
  }),

  // User registration validation
  userRegistration: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
        'any.required': 'Password is required'
      }),
    
    firstName: Joi.string().min(2).max(50).required()
      .messages({
        'string.min': 'First name must be at least 2 characters',
        'string.max': 'First name cannot exceed 50 characters'
      }),
    
    lastName: Joi.string().min(2).max(50).required()
      .messages({
        'string.min': 'Last name must be at least 2 characters',
        'string.max': 'Last name cannot exceed 50 characters'
      })
  }),

  // User login validation
  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  // LinkedIn account validation
  linkedinAccount: Joi.object({
    accountName: Joi.string().min(3).max(100).required(),
    sessionCookie: Joi.string().min(10).required(),
    proxyUrl: Joi.string().uri().optional(),
    minDelaySeconds: Joi.number().integer().min(1).max(60).default(2),
    maxDelaySeconds: Joi.number().integer().min(1).max(120).default(5),
    dailyLimit: Joi.number().integer().min(1).max(1000).default(100)
  }),

  // File upload validation
  fileUpload: Joi.object({
    file: Joi.object({
      mimetype: Joi.string().valid(
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ).required(),
      size: Joi.number().max(10 * 1024 * 1024) // 10MB max
    }).required()
  }),

  // Credit purchase validation
  creditPurchase: Joi.object({
    amount: Joi.number().integer().min(100).max(10000).required(),
    paymentMethod: Joi.string().valid('stripe', 'paypal').required()
  })
};

// Generic validation middleware factory
function createValidationMiddleware(schemaName, options = {}) {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      return res.status(500).json({
        error: 'Internal validation error',
        message: 'Validation schema not found'
      });
    }

    // Determine what to validate (body, query, params)
    const dataToValidate = options.validateQuery ? req.query : 
                          options.validateParams ? req.params : req.body;

    // Add context for conditional validation
    const validationOptions = {
      context: {
        type: req.body?.type,
        ...options.context
      },
      abortEarly: false, // Return all validation errors
      allowUnknown: options.allowUnknown || false,
      stripUnknown: options.stripUnknown || true
    };

    const { error, value } = schema.validate(dataToValidate, validationOptions);

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input data',
        details: validationErrors
      });
    }

    // Replace the original data with validated/sanitized data
    if (options.validateQuery) {
      req.query = value;
    } else if (options.validateParams) {
      req.params = value;
    } else {
      req.body = value;
    }

    next();
  };
}

// Specific validation middlewares
const validateJobCreation = createValidationMiddleware('jobCreation');
const validateUserRegistration = createValidationMiddleware('userRegistration');
const validateUserLogin = createValidationMiddleware('userLogin');
const validateLinkedInAccount = createValidationMiddleware('linkedinAccount');
const validateFileUpload = createValidationMiddleware('fileUpload');
const validateCreditPurchase = createValidationMiddleware('creditPurchase');

// File validation middleware
const validateFile = (allowedTypes = [], maxSize = 10 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return res.status(400).json({
        error: 'File required',
        message: 'Please upload a file'
      });
    }

    const file = req.file || (req.files && req.files[0]);
    
    if (!file) {
      return res.status(400).json({
        error: 'File required',
        message: 'Please upload a file'
      });
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: `Allowed file types: ${allowedTypes.join(', ')}`,
        received: file.mimetype
      });
    }

    // Check file size
    if (file.size > maxSize) {
      return res.status(400).json({
        error: 'File too large',
        message: `Maximum file size: ${Math.round(maxSize / (1024 * 1024))}MB`,
        received: `${Math.round(file.size / (1024 * 1024))}MB`
      });
    }

    next();
  };
};

// Rate limiting validation
const validateRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const identifier = req.ip + (req.user?.id || '');
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    for (const [key, timestamps] of requests.entries()) {
      requests.set(key, timestamps.filter(time => time > windowStart));
      if (requests.get(key).length === 0) {
        requests.delete(key);
      }
    }

    // Check current user's requests
    const userRequests = requests.get(identifier) || [];
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${maxRequests} requests per ${Math.round(windowMs / 60000)} minutes`,
        retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000)
      });
    }

    // Add current request
    userRequests.push(now);
    requests.set(identifier, userRequests);

    next();
  };
};

module.exports = {
  schemas,
  createValidationMiddleware,
  validateJobCreation,
  validateUserRegistration,
  validateUserLogin,
  validateLinkedInAccount,
  validateFileUpload,
  validateCreditPurchase,
  validateFile,
  validateRateLimit
};
