const express = require('express');
const jobController = require('../controllers/jobController');
const { authenticate, userRateLimit } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all job routes
router.use(authenticate);

// Apply rate limiting for job creation
const jobCreationRateLimit = userRateLimit(10, 60 * 1000); // 10 jobs per minute

/**
 * @swagger
 * components:
 *   schemas:
 *     Job:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Job unique identifier
 *         userId:
 *           type: string
 *           format: uuid
 *           description: User who created the job
 *         type:
 *           type: string
 *           enum: [profile, company, search, jobPosting]
 *           description: Type of scraping job
 *         query:
 *           type: string
 *           description: Search query or target URL
 *         status:
 *           type: string
 *           enum: [queued, running, completed, failed, cancelled]
 *           description: Current job status
 *         progress:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *           description: Job completion percentage
 *         totalResults:
 *           type: integer
 *           description: Total number of results found
 *         processedResults:
 *           type: integer
 *           description: Number of results processed
 *         maxResults:
 *           type: integer
 *           description: Maximum results to scrape
 *         retryCount:
 *           type: integer
 *           description: Number of retry attempts
 *         errorMessage:
 *           type: string
 *           description: Error message if job failed
 *         startedAt:
 *           type: string
 *           format: date-time
 *           description: Job start timestamp
 *         completedAt:
 *           type: string
 *           format: date-time
 *           description: Job completion timestamp
 *         scheduledFor:
 *           type: string
 *           format: date-time
 *           description: Scheduled execution time
 *         cronExpression:
 *           type: string
 *           description: Cron expression for recurring jobs
 *         isRecurring:
 *           type: boolean
 *           description: Whether job is recurring
 *         configuration:
 *           type: object
 *           description: Additional job configuration
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Job creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 */

/**
 * @swagger
 * /api/jobs:
 *   post:
 *     summary: Create a new scraping job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - query
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [profile, company, search, jobPosting]
 *                 example: profile
 *               query:
 *                 type: string
 *                 example: software engineer
 *               maxResults:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10000
 *                 default: 100
 *                 example: 50
 *               scheduledFor:
 *                 type: string
 *                 format: date-time
 *                 example: 2024-01-15T10:00:00Z
 *               cronExpression:
 *                 type: string
 *                 example: 0 9 * * 1
 *               isRecurring:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *               configuration:
 *                 type: object
 *                 example: { "location": "San Francisco", "industry": "Technology" }
 *     responses:
 *       201:
 *         description: Job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Job created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       example: queued
 *                     type:
 *                       type: string
 *                       example: profile
 *                     query:
 *                       type: string
 *                       example: software engineer
 *                     maxResults:
 *                       type: integer
 *                       example: 50
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', jobCreationRateLimit, jobController.createJob);

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: Get all jobs for the authenticated user
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of jobs per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [queued, running, completed, failed, cancelled]
 *         description: Filter by job status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [profile, company, search, jobPosting]
 *         description: Filter by job type
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Jobs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Job'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalJobs:
 *                           type: integer
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPrevPage:
 *                           type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/', jobController.getJobs);

/**
 * @swagger
 * /api/jobs/stats:
 *   get:
 *     summary: Get job statistics for the user
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         queued:
 *                           type: integer
 *                         running:
 *                           type: integer
 *                         completed:
 *                           type: integer
 *                         failed:
 *                           type: integer
 *                         cancelled:
 *                           type: integer
 *                     recentActivity:
 *                       type: object
 *                       description: Activity by date for last 30 days
 *                     totalRecentJobs:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', jobController.getJobStats);

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Get a specific job by ID
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     job:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Job'
 *                         - type: object
 *                           properties:
 *                             resultsCount:
 *                               type: integer
 *                             duration:
 *                               type: integer
 *                               description: Job duration in seconds
 *                             qualityStats:
 *                               type: object
 *                               properties:
 *                                 high:
 *                                   type: integer
 *                                 medium:
 *                                   type: integer
 *                                 low:
 *                                   type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.get('/:id', jobController.getJobById);

/**
 * @swagger
 * /api/jobs/{id}:
 *   put:
 *     summary: Update a job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 example: senior software engineer
 *               maxResults:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10000
 *                 example: 100
 *               scheduledFor:
 *                 type: string
 *                 format: date-time
 *                 example: 2024-01-15T10:00:00Z
 *               configuration:
 *                 type: object
 *                 example: { "location": "New York", "industry": "Finance" }
 *     responses:
 *       200:
 *         description: Job updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Job updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     job:
 *                       $ref: '#/components/schemas/Job'
 *       400:
 *         description: Cannot update job with current status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.put('/:id', jobController.updateJob);

/**
 * @swagger
 * /api/jobs/{id}:
 *   delete:
 *     summary: Delete a job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Job deleted successfully
 *       400:
 *         description: Cannot delete running job
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.delete('/:id', jobController.deleteJob);

/**
 * @swagger
 * /api/jobs/{id}/cancel:
 *   post:
 *     summary: Cancel a running job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Job cancelled successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     job:
 *                       $ref: '#/components/schemas/Job'
 *       400:
 *         description: Cannot cancel job with current status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.post('/:id/cancel', jobController.cancelJob);

/**
 * @swagger
 * /api/jobs/{id}/retry:
 *   post:
 *     summary: Retry a failed job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job retry initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Job retry initiated
 *                 data:
 *                   type: object
 *                   properties:
 *                     job:
 *                       $ref: '#/components/schemas/Job'
 *       400:
 *         description: Cannot retry job or maximum retries reached
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.post('/:id/retry', jobController.retryJob);

module.exports = router;