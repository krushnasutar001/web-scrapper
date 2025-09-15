const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken, rateLimit } = require('../middleware/auth');

// Rate limiting for dashboard operations
const dashboardRateLimit = rateLimit(100, 15 * 60 * 1000); // 100 requests per 15 minutes

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get dashboard statistics for the authenticated user
 * @access  Private
 */
router.get('/stats', authenticateToken, dashboardRateLimit, dashboardController.getDashboardStats);

/**
 * @route   GET /api/dashboard/analytics/jobs
 * @desc    Get job performance analytics
 * @access  Private
 */
router.get('/analytics/jobs', authenticateToken, dashboardRateLimit, dashboardController.getJobAnalytics);

/**
 * @route   GET /api/dashboard/analytics/accounts
 * @desc    Get account performance analytics
 * @access  Private
 */
router.get('/analytics/accounts', authenticateToken, dashboardRateLimit, dashboardController.getAccountAnalytics);

/**
 * @route   GET /api/dashboard/status
 * @desc    Get real-time system status
 * @access  Private
 */
router.get('/status', authenticateToken, dashboardRateLimit, dashboardController.getSystemStatus);

/**
 * @route   GET /api/dashboard/export
 * @desc    Export dashboard data
 * @access  Private
 */
router.get('/export', authenticateToken, dashboardRateLimit, dashboardController.exportDashboardData);

module.exports = router;