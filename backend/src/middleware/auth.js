const authService = require('../utils/auth');
const { User } = require('../models');
const { AuthenticationError, AuthorizationError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Access token required');
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token
    const decoded = authService.verifyToken(token);
    
    // Get user from database
    const user = await User.findByPk(decoded.id);
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    
    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }
    
    // Attach user to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return next(error);
    }
    
    logger.warn('Authentication failed:', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    next(new AuthenticationError('Invalid or expired token'));
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }
    
    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    const user = await User.findByPk(decoded.id);
    
    if (user && user.isActive) {
      req.user = user;
      req.token = token;
    }
    
    next();
  } catch (error) {
    // Log but don't fail the request
    logger.debug('Optional authentication failed:', error.message);
    next();
  }
};

/**
 * Middleware to check if user owns the resource
 */
const authorize = (resourceParam = 'userId') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }
      
      const resourceUserId = req.params[resourceParam] || req.body[resourceParam];
      
      if (resourceUserId && resourceUserId !== req.user.id) {
        throw new AuthorizationError('Access denied to this resource');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user is admin (for future admin features)
 */
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }
    
    if (!req.user.isAdmin) {
      throw new AuthorizationError('Admin access required');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to validate API key (for external integrations)
 */
const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      throw new AuthenticationError('API key required');
    }
    
    // In a real implementation, you'd validate against stored API keys
    // For now, we'll use a simple check against environment variable
    const validApiKey = process.env.API_KEY;
    
    if (!validApiKey || apiKey !== validApiKey) {
      throw new AuthenticationError('Invalid API key');
    }
    
    // Log API usage
    logger.info('API key authentication successful', {
      ip: req.ip,
      endpoint: req.originalUrl,
      method: req.method
    });
    
    next();
  } catch (error) {
    logger.warn('API key authentication failed:', {
      error: error.message,
      ip: req.ip,
      endpoint: req.originalUrl
    });
    
    next(error);
  }
};

/**
 * Middleware to check rate limits per user
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    try {
      if (!req.user) {
        return next();
      }
      
      const userId = req.user.id;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Get user's request history
      let requests = userRequests.get(userId) || [];
      
      // Remove old requests outside the window
      requests = requests.filter(timestamp => timestamp > windowStart);
      
      // Check if limit exceeded
      if (requests.length >= maxRequests) {
        logger.warn('User rate limit exceeded', {
          userId,
          requests: requests.length,
          maxRequests,
          windowMs
        });
        
        throw new RateLimitError(`Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000} seconds`);
      }
      
      // Add current request
      requests.push(now);
      userRequests.set(userId, requests);
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': maxRequests - requests.length,
        'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
      });
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to validate request origin (CORS-like)
 */
const validateOrigin = (allowedOrigins = []) => {
  return (req, res, next) => {
    const origin = req.get('Origin') || req.get('Referer');
    
    if (!origin) {
      return next(); // Allow requests without origin (e.g., mobile apps)
    }
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      if (typeof allowed === 'string') return origin.includes(allowed);
      if (allowed instanceof RegExp) return allowed.test(origin);
      return false;
    });
    
    if (!isAllowed) {
      logger.warn('Request from unauthorized origin', {
        origin,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      throw new AuthorizationError('Request from unauthorized origin');
    }
    
    next();
  };
};

/**
 * Middleware to log authentication events
 */
const logAuthEvent = (event) => {
  return (req, res, next) => {
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip || req.connection.remoteAddress;
    
    logger.info(`Auth event: ${event}`, {
      userId,
      ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      method: req.method
    });
    
    next();
  };
};

/**
 * Middleware to refresh token if it's about to expire
 */
const refreshTokenIfNeeded = async (req, res, next) => {
  try {
    if (!req.user || !req.token) {
      return next();
    }
    
    const decoded = authService.verifyToken(req.token);
    const expiresIn = decoded.exp * 1000 - Date.now();
    const refreshThreshold = 30 * 60 * 1000; // 30 minutes
    
    if (expiresIn < refreshThreshold) {
      const newToken = authService.generateToken(req.user);
      
      // Add new token to response headers
      res.set('X-New-Token', newToken);
      
      logger.info('Token refreshed for user', {
        userId: req.user.id,
        expiresIn,
        refreshThreshold
      });
    }
    
    next();
  } catch (error) {
    // Don't fail the request if token refresh fails
    logger.warn('Token refresh failed:', error.message);
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  requireAdmin,
  validateApiKey,
  userRateLimit,
  validateOrigin,
  logAuthEvent,
  refreshTokenIfNeeded
};