const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { authenticateToken, rateLimit } = require('../middleware/auth');

// Rate limiting for account operations
const accountRateLimit = rateLimit(50, 15 * 60 * 1000); // 50 requests per 15 minutes

/**
 * @route   GET /api/linkedin-accounts
 * @desc    Get all LinkedIn accounts for the authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, accountRateLimit, accountController.getAccounts);

/**
 * @route   GET /api/linkedin-accounts/available
 * @desc    Get available LinkedIn accounts for job creation
 * @access  Private
 */
router.get('/available', authenticateToken, accountRateLimit, accountController.getAvailableAccounts);

/**
 * @route   GET /api/linkedin-accounts/refresh
 * @desc    Refresh accounts list (for frontend refresh button)
 * @access  Private
 */
router.get('/refresh', authenticateToken, accountRateLimit, accountController.refreshAccounts);

/**
 * @route   GET /api/linkedin-accounts/:accountId
 * @desc    Get a specific LinkedIn account by ID
 * @access  Private
 */
router.get('/:accountId', authenticateToken, accountRateLimit, accountController.getAccountById);

/**
 * @route   POST /api/linkedin-accounts
 * @desc    Create a new LinkedIn account
 * @access  Private
 */
router.post('/', authenticateToken, accountRateLimit, accountController.createAccount);

/**
 * @route   PUT /api/linkedin-accounts/:accountId
 * @desc    Update a LinkedIn account
 * @access  Private
 */
router.put('/:accountId', authenticateToken, accountRateLimit, accountController.updateAccount);

/**
 * @route   DELETE /api/linkedin-accounts/:accountId
 * @desc    Delete a LinkedIn account
 * @access  Private
 */
router.delete('/:accountId', authenticateToken, accountRateLimit, accountController.deleteAccount);

/**
 * @route   POST /api/linkedin-accounts/:accountId/block
 * @desc    Block a LinkedIn account temporarily
 * @access  Private
 */
router.post('/:accountId/block', authenticateToken, accountRateLimit, accountController.blockAccount);

/**
 * @route   POST /api/linkedin-accounts/:accountId/unblock
 * @desc    Unblock a LinkedIn account
 * @access  Private
 */
router.post('/:accountId/unblock', authenticateToken, accountRateLimit, accountController.unblockAccount);

module.exports = router;