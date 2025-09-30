const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { authenticateToken, rateLimit } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp/');
  },
  filename: (req, file, cb) => {
    cb(null, `cookies-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept JSON files and text files
    if (file.mimetype === 'application/json' || file.mimetype === 'text/plain' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

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
 * @route   GET /api/linkedin-accounts/stats
 * @desc    Get LinkedIn accounts statistics
 * @access  Private
 */
router.get('/stats', authenticateToken, accountRateLimit, accountController.getStats);

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
 * @route   POST /api/linkedin-accounts/detect-from-extension
 * @desc    Detect and save LinkedIn accounts from browser extension
 * @access  Private
 */
router.post('/detect-from-extension', authenticateToken, accountRateLimit, accountController.detectFromExtension);

/**
 * @route   POST /api/linkedin-accounts
 * @desc    Create a new LinkedIn account (supports file upload for cookies)
 * @access  Private
 */
router.post('/', authenticateToken, accountRateLimit, upload.single('cookiesFile'), accountController.createAccount);

/**
 * @route   POST /api/linkedin-accounts/add-with-cookies
 * @desc    Add LinkedIn account with cookies file
 * @access  Private
 */
router.post('/add-with-cookies', authenticateToken, accountRateLimit, upload.single('cookieFile'), accountController.addWithCookies);

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

/**
 * @route   POST /api/linkedin-accounts/:accountId/validate
 * @desc    Validate a LinkedIn account
 * @access  Private
 */
router.post('/:accountId/validate', authenticateToken, accountRateLimit, accountController.validateAccount);

module.exports = router;