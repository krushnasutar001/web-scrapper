const { body, validationResult } = require('express-validator');
const authService = require('../utils/auth');
const { User } = require('../models');
const { asyncHandler, createValidationError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Validation rules for user registration
 */
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters')
];

/**
 * Validation rules for user login
 */
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * Validation rules for password reset request
 */
const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
];

/**
 * Validation rules for password reset
 */
const resetPasswordValidation = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array());
  }

  const { email, password, firstName, lastName } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  // Register user
  const result = await authService.register({
    email,
    password,
    firstName,
    lastName
  });

  // Log registration attempt
  logger.logAuth.register(email, result.success, ip);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.message
    });
  }

  // Return success response
  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn
    }
  });
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array());
  }

  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  // Authenticate user
  const result = await authService.authenticate(email, password);

  // Log login attempt
  logger.logAuth.login(email, result.success, ip);

  if (!result.success) {
    return res.status(401).json({
      success: false,
      message: result.message
    });
  }

  // Return success response
  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn
    }
  });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['passwordHash'] }
  });

  res.json({
    success: true,
    data: {
      user: user.toJSON()
    }
  });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/auth/me
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName } = req.body;
  
  const user = await User.findByPk(req.user.id);
  
  // Update allowed fields
  const updates = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  
  await user.update(updates);
  
  logger.info('User profile updated', {
    userId: user.id,
    updates: Object.keys(updates)
  });
  
  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: user.toJSON()
    }
  });
});

/**
 * @desc    Change user password
 * @route   PUT /api/auth/password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password and new password are required'
    });
  }
  
  const user = await User.findByPk(req.user.id);
  
  // Verify current password
  const isCurrentPasswordValid = await user.validatePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }
  
  // Validate new password
  const passwordValidation = authService.validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: passwordValidation.message
    });
  }
  
  // Update password
  await user.update({ password: newPassword });
  
  logger.info('User password changed', {
    userId: user.id,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array());
  }

  const { email } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  const result = await authService.generatePasswordResetToken(email);

  // Always return success to prevent email enumeration
  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent'
  });

  // Log the actual result internally
  logger.logAuth.passwordReset(email, result.success, ip);
});

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array());
  }

  const { token, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  const result = await authService.resetPassword(token, password);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.message
    });
  }

  logger.info('Password reset successful', {
    ip,
    token: token.substring(0, 8) + '...' // Log partial token for tracking
  });

  res.json({
    success: true,
    message: result.message
  });
});

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token is required'
    });
  }
  
  // In a real implementation, you'd validate the refresh token against stored tokens
  // For now, we'll just generate a new token if the user exists
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access token required for refresh'
    });
  }
  
  try {
    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    const user = await User.findByPk(decoded.id);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user for token refresh'
      });
    }
    
    const newToken = authService.generateToken(user);
    const newRefreshToken = authService.generateRefreshToken();
    
    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
        expiresIn: authService.jwtExpiresIn
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token for refresh'
    });
  }
});

/**
 * @desc    Logout user (invalidate token)
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  // In a real implementation, you'd add the token to a blacklist
  // For now, we'll just log the logout event
  
  logger.info('User logged out', {
    userId: req.user.id,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = {
  register: [registerValidation, register],
  login: [loginValidation, login],
  getMe,
  updateProfile,
  changePassword,
  forgotPassword: [forgotPasswordValidation, forgotPassword],
  resetPassword: [resetPasswordValidation, resetPassword],
  refreshToken,
  logout
};