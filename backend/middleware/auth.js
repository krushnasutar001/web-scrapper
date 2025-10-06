const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { query } = require('../utils/database');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'linkedin-automation-jwt-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'linkedin-automation-refresh-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate access token
 */
const generateAccessToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    type: 'access' // Explicitly set token type
  };
  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      type: 'refresh'
    },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
};

/**
 * Generate both access and refresh tokens
 */
const generateTokens = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
    expiresIn: JWT_EXPIRES_IN
  };
};

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
  try {
    console.log('🔍 Verifying token with secret:', JWT_SECRET.substring(0, 10) + '...');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('🔍 Token verified successfully:', decoded);
    console.log('Decoded token type:', decoded.type);
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    throw error;
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw error;
  }
};

/**
 * Authentication middleware
 */
const authenticateToken = async (req, res, next) => {
  console.log('🔍 authenticateToken middleware called');
  console.log('🔍 Request path:', req.path);
  console.log('🔍 Request method:', req.method);
  
  try {
    const authHeader = req.headers['authorization'];
    console.log('🔍 Auth header received:', authHeader ? authHeader.substring(0, 50) + '...' : 'None');
    
    if (!authHeader) {
      console.log('❌ No authorization header found');
      return res.status(401).json({
        success: false,
        error: 'Access token is required',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (!token) {
      console.log('❌ No Bearer token found');
      return res.status(401).json({
        success: false,
        error: 'Access token is required',
        code: 'NO_TOKEN'
      });
    }

    console.log('🔍 Token extracted:', token.substring(0, 20) + '...');

    // Verify the token
    const decoded = verifyAccessToken(token);
    console.log('🔍 Token decoded successfully:', decoded);
    
    if (!decoded) {
      console.log('❌ Token verification failed');
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Get user from database
    console.log('🔍 Looking up user with ID:', decoded.id);
    const userResult = await query(
      'SELECT id, email, name, is_active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!userResult || userResult.length === 0) {
      console.log('❌ User not found in database');
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult[0];
    console.log('🔍 User found:', user);
    console.log('🔍 User is_active value:', user.is_active);
    console.log('🔍 User is_active type:', typeof user.is_active);

    // Check if user is active
    if (!user.is_active || user.is_active === 0) {
      console.log('❌ User is inactive');
      console.log('🔍 DEBUG - User ID:', user.id);
      console.log('🔍 DEBUG - is_active value:', user.is_active);
      console.log('🔍 DEBUG - is_active type:', typeof user.is_active);
      
      return res.status(401).json({
        success: false,
        error: 'Account is inactive',
        code: 'USER_INACTIVE'
      });
    }

    console.log('✅ User authenticated successfully');
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    
    req.user = user && user.is_active ? user : null;
    next();
    
  } catch (error) {
    // If token is invalid, just set user to null
    req.user = null;
    next();
  }
};

/**
 * Refresh token endpoint middleware
 */
const refreshTokenHandler = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN'
      });
    }
    
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Get user from database
    const user = await User.findById(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    // Generate new tokens
    const tokens = generateTokens(user);
    
    res.json({
      success: true,
      data: {
        ...tokens,
        user: user.toJSON()
      }
    });
    
  } catch (error) {
    console.error('❌ Token refresh failed:', error);
    
    let errorResponse = {
      success: false,
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    };
    
    if (error.name === 'TokenExpiredError') {
      errorResponse.error = 'Refresh token has expired';
      errorResponse.code = 'REFRESH_TOKEN_EXPIRED';
    }
    
    res.status(401).json(errorResponse);
  }
};

/**
 * Admin authentication middleware
 */
const requireAdmin = async (req, res, next) => {
  // First check if user is authenticated
  await authenticateToken(req, res, () => {
    // Check if user has admin privileges
    // This is a placeholder - implement based on your admin logic
    if (req.user && req.user.email === 'admin@example.com') {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }
  });
};

/**
 * Rate limiting middleware (basic implementation)
 */
const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (requests.has(key)) {
      const userRequests = requests.get(key).filter(time => time > windowStart);
      requests.set(key, userRequests);
    }
    
    // Check rate limit
    const userRequests = requests.get(key) || [];
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    userRequests.push(now);
    requests.set(key, userRequests);
    
    next();
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  authenticateToken,
  optionalAuth,
  refreshTokenHandler,
  requireAdmin,
  rateLimit
};