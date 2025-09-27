const express = require('express');
const router = express.Router();
const { authenticateToken, rateLimit } = require('../middleware/auth');
const extensionController = require('../controllers/extensionController');

// Rate limiting for extension endpoints
const extensionRateLimit = rateLimit(100, 15 * 60 * 1000); // 100 requests per 15 minutes
const syncRateLimit = rateLimit(30, 5 * 60 * 1000); // 30 sync requests per 5 minutes

/**
 * @route   POST /api/extension/auth/login
 * @desc    Authenticate extension user and return JWT token
 * @access  Public
 */
router.post('/auth/login', extensionRateLimit, extensionController.extensionLogin);

/**
 * @route   POST /api/extension/cookies/sync
 * @desc    Sync LinkedIn cookies from extension
 * @access  Private (Extension JWT)
 */
router.post('/cookies/sync', authenticateToken, syncRateLimit, extensionController.syncCookies);

/**
 * @route   GET /api/extension/account/status
 * @desc    Get account sync status and statistics
 * @access  Private (Extension JWT)
 */
router.get('/account/status', authenticateToken, extensionRateLimit, extensionController.getAccountStatus);

/**
 * @route   POST /api/extension/account/validate
 * @desc    Validate LinkedIn account cookies
 * @access  Private (Extension JWT)
 */
router.post('/account/validate', authenticateToken, syncRateLimit, extensionController.validateAccount);

/**
 * @route   GET /api/extension/jobs/active
 * @desc    Get active scraping jobs for the user's accounts
 * @access  Private (Extension JWT)
 */
router.get('/jobs/active', authenticateToken, extensionRateLimit, extensionController.getActiveJobs);

/**
 * @route   POST /api/extension/heartbeat
 * @desc    Extension heartbeat to track activity
 * @access  Private (Extension JWT)
 */
router.post('/heartbeat', authenticateToken, extensionRateLimit, extensionController.heartbeat);

/**
 * @route   DELETE /api/extension/account/disconnect
 * @desc    Disconnect LinkedIn account from extension
 * @access  Private (Extension JWT)
 */
router.delete('/account/disconnect', authenticateToken, extensionRateLimit, extensionController.disconnectAccount);

module.exports = router;