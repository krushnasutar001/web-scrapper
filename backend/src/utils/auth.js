const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../models');
const logger = require('./logger');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    
    if (!this.encryptionKey || this.encryptionKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 characters long');
    }
  }

  /**
   * Generate JWT token for user
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      isActive: user.isActive
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      issuer: 'linkedin-automation-saas',
      audience: 'linkedin-automation-users'
    });
  }

  /**
   * Verify and decode JWT token
   * @param {string} token - JWT token
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'linkedin-automation-saas',
        audience: 'linkedin-automation-users'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Generate refresh token
   * @returns {string} Refresh token
   */
  generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Hash password using bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password) {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} Password match result
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   * @param {string} text - Text to encrypt
   * @returns {Object} Encrypted data with IV and auth tag
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
      cipher.setAAD(Buffer.from('linkedin-automation-saas'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      logger.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data using AES-256-GCM
   * @param {Object} encryptedData - Encrypted data object
   * @returns {string} Decrypted text
   */
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      
      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAAD(Buffer.from('linkedin-automation-saas'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} Authentication result
   */
  async authenticate(email, password) {
    try {
      const user = await User.findByEmail(email);
      
      if (!user) {
        logger.warn(`Authentication failed: User not found - ${email}`);
        return { success: false, message: 'Invalid credentials' };
      }

      if (!user.isActive) {
        logger.warn(`Authentication failed: User inactive - ${email}`);
        return { success: false, message: 'Account is deactivated' };
      }

      const isPasswordValid = await user.validatePassword(password);
      
      if (!isPasswordValid) {
        logger.warn(`Authentication failed: Invalid password - ${email}`);
        return { success: false, message: 'Invalid credentials' };
      }

      // Update last login
      await user.update({ lastLoginAt: new Date() });

      const token = this.generateToken(user);
      const refreshToken = this.generateRefreshToken();

      logger.info(`User authenticated successfully - ${email}`);

      return {
        success: true,
        user: user.toJSON(),
        token,
        refreshToken,
        expiresIn: this.jwtExpiresIn
      };
    } catch (error) {
      logger.error('Authentication error:', error);
      return { success: false, message: 'Authentication failed' };
    }
  }

  /**
   * Register new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registration result
   */
  async register(userData) {
    try {
      const { email, password, firstName, lastName } = userData;

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return { success: false, message: 'User with this email already exists' };
      }

      // Validate password strength
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.isValid) {
        return { success: false, message: passwordValidation.message };
      }

      // Create new user
      const user = await User.create({
        email: email.toLowerCase(),
        password, // Will be hashed by model hook
        firstName,
        lastName
      });

      const token = this.generateToken(user);
      const refreshToken = this.generateRefreshToken();

      logger.info(`User registered successfully - ${email}`);

      return {
        success: true,
        user: user.toJSON(),
        token,
        refreshToken,
        expiresIn: this.jwtExpiresIn
      };
    } catch (error) {
      logger.error('Registration error:', error);
      return { success: false, message: 'Registration failed' };
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result
   */
  validatePassword(password) {
    if (!password || password.length < 8) {
      return { isValid: false, message: 'Password must be at least 8 characters long' };
    }

    if (!/(?=.*[a-z])/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one lowercase letter' };
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one uppercase letter' };
    }

    if (!/(?=.*\d)/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one number' };
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one special character (@$!%*?&)' };
    }

    return { isValid: true, message: 'Password is valid' };
  }

  /**
   * Generate password reset token
   * @param {string} email - User email
   * @returns {Promise<Object>} Reset token result
   */
  async generatePasswordResetToken(email) {
    try {
      const user = await User.findByEmail(email);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      await user.update({
        resetPasswordToken: resetToken,
        resetPasswordExpiresAt: resetTokenExpiry
      });

      logger.info(`Password reset token generated for user - ${email}`);

      return {
        success: true,
        resetToken,
        expiresAt: resetTokenExpiry
      };
    } catch (error) {
      logger.error('Password reset token generation error:', error);
      return { success: false, message: 'Failed to generate reset token' };
    }
  }

  /**
   * Reset password using token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Reset result
   */
  async resetPassword(token, newPassword) {
    try {
      const user = await User.findOne({
        where: {
          resetPasswordToken: token,
          resetPasswordExpiresAt: {
            [User.sequelize.Sequelize.Op.gt]: new Date()
          }
        }
      });

      if (!user) {
        return { success: false, message: 'Invalid or expired reset token' };
      }

      // Validate new password
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        return { success: false, message: passwordValidation.message };
      }

      // Update password and clear reset token
      await user.update({
        password: newPassword, // Will be hashed by model hook
        resetPasswordToken: null,
        resetPasswordExpiresAt: null
      });

      logger.info(`Password reset successfully for user - ${user.email}`);

      return { success: true, message: 'Password reset successfully' };
    } catch (error) {
      logger.error('Password reset error:', error);
      return { success: false, message: 'Failed to reset password' };
    }
  }
}

// Create singleton instance
const authService = new AuthService();

module.exports = authService;