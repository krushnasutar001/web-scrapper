const express = require('express');
const router = express.Router();
const { authenticateToken, rateLimit } = require('../middleware/auth');
const extensionController = require('../controllers/extensionController');

// Rate limiting for extension endpoints
const extensionRateLimit = rateLimit(100, 15 * 60 * 1000); // 100 requests per 15 minutes
const syncRateLimit = rateLimit(30, 5 * 60 * 1000); // 30 sync requests per 5 minutes



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
 * @route   GET /api/extension/identities
 * @desc    Get all identities for the authenticated user
 * @access  Private (Extension JWT)
 */
router.get('/identities', authenticateToken, extensionRateLimit, extensionController.getIdentities);

/**
 * @route   POST /api/extension/identities
 * @desc    Create a new identity
 * @access  Private (Extension JWT)
 */
router.post('/identities', authenticateToken, extensionRateLimit, extensionController.createIdentity);

/**
 * @route   DELETE /api/extension/account/disconnect
 * @desc    Disconnect LinkedIn account from extension
 * @access  Private (Extension JWT)
 */
router.delete('/account/disconnect', authenticateToken, extensionRateLimit, extensionController.disconnectAccount);

/**
 * @route   GET /api/extension/jobs/assigned
 * @desc    Get jobs assigned to the current user for extension execution
 * @access  Private (Extension JWT)
 */
router.get('/jobs/assigned', authenticateToken, extensionRateLimit, extensionController.getAssignedJobs);

/**
 * @route   POST /api/extension/jobs/:jobId/complete
 * @desc    Mark a job as completed with results
 * @access  Private (Extension JWT)
 */
router.post('/jobs/:jobId/complete', authenticateToken, extensionRateLimit, extensionController.completeJob);

/**
 * @route   POST /api/extension/jobs/:jobId/fail
 * @desc    Mark a job as failed with error details
 * @access  Private (Extension JWT)
 */
router.post('/jobs/:jobId/fail', authenticateToken, extensionRateLimit, extensionController.failJob);

/**
 * @route   POST /api/extension/linkedin/cookies
 * @desc    Store LinkedIn cookies for automation
 * @access  Private (Extension JWT)
 */
router.post('/linkedin/cookies', authenticateToken, syncRateLimit, extensionController.storeLinkedInCookies);

/**
 * @route   GET /api/extension/accounts
 * @desc    Get all LinkedIn accounts managed by extension
 * @access  Private (Extension JWT)
 */
router.get('/accounts', authenticateToken, extensionRateLimit, extensionController.getAccounts);

/**
 * @route   POST /api/extension/accounts
 * @desc    Add a new LinkedIn account via extension
 * @access  Private (Extension JWT)
 */
router.post('/accounts', authenticateToken, syncRateLimit, extensionController.addAccount);

/**
 * @route   PUT /api/extension/accounts/:accountId
 * @desc    Update LinkedIn account via extension
 * @access  Private (Extension JWT)
 */
router.put('/accounts/:accountId', authenticateToken, syncRateLimit, extensionController.updateAccount);

/**
 * @route   DELETE /api/extension/accounts/:accountId
 * @desc    Delete LinkedIn account via extension
 * @access  Private (Extension JWT)
 */
router.delete('/accounts/:accountId', authenticateToken, extensionRateLimit, extensionController.deleteAccount);

/**
 * @route   POST /api/extension/accounts/:accountId/validate
 * @desc    Validate specific LinkedIn account via extension
 * @access  Private (Extension JWT)
 */
router.post('/accounts/:accountId/validate', authenticateToken, syncRateLimit, extensionController.validateSpecificAccount);

/**
 * @route   POST /api/extension/accounts/sync
 * @desc    Sync all managed accounts with backend
 * @access  Private (Extension JWT)
 */
router.post('/accounts/sync', authenticateToken, syncRateLimit, extensionController.syncAccounts);

/**
 * @route   POST /api/extension/validate-account
 * @desc    Validate LinkedIn account cookies from extension
 * @access  Private (Extension JWT)
 */
router.post('/validate-account', authenticateToken, syncRateLimit, extensionController.validateAccountCookies);

/**
 * @route   POST /api/extension/scraping/start
 * @desc    Start scraping task for LinkedIn account
 * @access  Private (Extension JWT)
 */
router.post('/scraping/start', authenticateToken, syncRateLimit, extensionController.startScrapingTask);

/**
 * @route   GET /api/extension/auth/me
 * @desc    Get current user information for extension
 * @access  Private (Extension JWT)
 */
router.get('/auth/me', authenticateToken, extensionRateLimit, extensionController.getCurrentUser);

module.exports = router;