const User = require('../models/User');
const { generateTokens } = require('../middleware/auth');
const bcrypt = require('bcrypt');

/**
 * Register a new user
 */
const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    console.log('📋 Registration attempt:', { email, name });
    
    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required',
        code: 'MISSING_FIELDS'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }
    
    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long',
        code: 'WEAK_PASSWORD'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
        code: 'USER_EXISTS'
      });
    }
    
    // Create new user
    const user = await User.create({ email, password, name });
    
    // Generate tokens
    const tokens = generateTokens(user);
    
    console.log(`✅ User registered successfully: ${email}`);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        ...tokens,
        user: user.toJSON()
      }
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Handle database errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
        code: 'USER_EXISTS'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
};

/**
 * Login user
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', { email });
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }
    
    // Authenticate user
    const user = await User.authenticate(email, password);
    if (!user) {
      console.log('❌ Invalid credentials for:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Generate tokens
    const tokens = generateTokens(user);
    
    console.log(`✅ User logged in successfully: ${email}`);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        ...tokens,
        user: user.toJSON()
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
};

/**
 * Get current user profile
 */
const getProfile = async (req, res) => {
  try {
    const user = req.user; // Set by authenticateToken middleware
    
    // Get user statistics
    const stats = await user.getStats();
    
    res.json({
      success: true,
      data: {
        user: user.toJSON(),
        stats
      }
    });
    
  } catch (error) {
    console.error('❌ Get profile error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
      code: 'PROFILE_ERROR'
    });
  }
};

/**
 * Update user profile
 */
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = req.user;
    
    console.log('📋 Profile update attempt:', { userId: user.id, name, email });
    
    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        });
      }
      
      // Check if email is already taken by another user
      if (email !== user.email) {
        const existingUser = await User.findByEmail(email);
        if (existingUser && existingUser.id !== user.id) {
          return res.status(409).json({
            success: false,
            error: 'Email is already taken',
            code: 'EMAIL_TAKEN'
          });
        }
      }
    }
    
    // Update user
    await user.update({ name, email });
    
    console.log(`✅ Profile updated successfully: ${user.id}`);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toJSON()
      }
    });
    
  } catch (error) {
    console.error('❌ Profile update error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'Email is already taken',
        code: 'EMAIL_TAKEN'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      code: 'UPDATE_ERROR'
    });
  }
};

/**
 * Change user password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;
    
    console.log('🔐 Password change attempt:', { userId: user.id });
    
    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS'
      });
    }
    
    // Validate new password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long',
        code: 'WEAK_PASSWORD'
      });
    }
    
    // Verify current password
    const authenticatedUser = await User.authenticate(user.email, currentPassword);
    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }
    
    // Change password
    await user.changePassword(newPassword);
    
    console.log(`✅ Password changed successfully: ${user.id}`);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('❌ Password change error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
};

/**
 * Logout user (client-side token removal)
 */
const logout = async (req, res) => {
  try {
    const user = req.user;
    
    console.log(`🔓 User logged out: ${user.id}`);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    console.error('❌ Logout error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
};

/**
 * Deactivate user account
 */
const deactivateAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const user = req.user;
    
    console.log('⚠️ Account deactivation attempt:', { userId: user.id });
    
    // Verify password
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required to deactivate account',
        code: 'PASSWORD_REQUIRED'
      });
    }
    
    const authenticatedUser = await User.authenticate(user.email, password);
    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        error: 'Password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }
    
    // Deactivate account
    await user.deactivate();
    
    console.log(`✅ Account deactivated: ${user.id}`);
    
    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
    
  } catch (error) {
    console.error('❌ Account deactivation error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate account',
      code: 'DEACTIVATION_ERROR'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  logout,
  deactivateAccount
};
