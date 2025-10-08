const express = require('express');
const router = express.Router();

// Use src auth middleware and user rate limit
const { authenticate, userRateLimit } = require('../middleware/auth');

// Reuse existing dashboard controller implemented in backend/controllers
const dashboardController = require('../../controllers/dashboardController');

// GET /api/dashboard/stats - Dashboard statistics
// Loosened rate limit: 60 requests per 60 seconds per user
router.get('/stats', authenticate, userRateLimit(60, 60 * 1000), dashboardController.getDashboardStats);

// GET /api/dashboard/analytics/jobs - Job performance analytics
router.get('/analytics/jobs', authenticate, dashboardController.getJobAnalytics);

// GET /api/dashboard/analytics/accounts - Account performance analytics
router.get('/analytics/accounts', authenticate, dashboardController.getAccountAnalytics);

// GET /api/dashboard/status - Real-time system status
router.get('/status', authenticate, dashboardController.getSystemStatus);

// GET /api/dashboard/export - Export dashboard data
router.get('/export', authenticate, dashboardController.exportDashboardData);

module.exports = router;
