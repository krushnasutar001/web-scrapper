const express = require('express');
const router = express.Router();

// Use src auth middleware
const { authenticate } = require('../middleware/auth');

// Reuse existing dashboard controller implemented in backend/controllers
const dashboardController = require('../../controllers/dashboardController');

// GET /api/dashboard/stats - Dashboard statistics
router.get('/stats', authenticate, dashboardController.getDashboardStats);

// GET /api/dashboard/analytics/jobs - Job performance analytics
router.get('/analytics/jobs', authenticate, dashboardController.getJobAnalytics);

// GET /api/dashboard/analytics/accounts - Account performance analytics
router.get('/analytics/accounts', authenticate, dashboardController.getAccountAnalytics);

// GET /api/dashboard/status - Real-time system status
router.get('/status', authenticate, dashboardController.getSystemStatus);

// GET /api/dashboard/export - Export dashboard data
router.get('/export', authenticate, dashboardController.exportDashboardData);

module.exports = router;
