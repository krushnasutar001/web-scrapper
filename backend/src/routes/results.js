const express = require('express');
const resultController = require('../controllers/resultController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all result routes
router.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     Result:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Result unique identifier
 *         jobId:
 *           type: string
 *           format: uuid
 *           description: Associated job ID
 *         data:
 *           type: object
 *           description: Scraped data (structure varies by job type)
 *           example:
 *             name: "John Doe"
 *             title: "Software Engineer"
 *             company: "Tech Corp"
 *             location: "San Francisco, CA"
 *             url: "https://linkedin.com/in/johndoe"
 *         uniqueKey:
 *           type: string
 *           description: Unique identifier for deduplication
 *         quality:
 *           type: string
 *           enum: [high, medium, low]
 *           description: Data quality assessment
 *         isProcessed:
 *           type: boolean
 *           description: Whether result has been processed
 *         processingNotes:
 *           type: string
 *           description: Notes about processing or validation
 *         scrapedAt:
 *           type: string
 *           format: date-time
 *           description: When data was scraped
 *         lastValidatedAt:
 *           type: string
 *           format: date-time
 *           description: Last validation timestamp
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Result creation timestamp
 */

/**
 * @swagger
 * /api/results/{jobId}:
 *   get:
 *     summary: Get results for a specific job
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
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
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: quality
 *         schema:
 *           type: string
 *           enum: [high, medium, low]
 *         description: Filter by data quality
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search within result data
 *     responses:
 *       200:
 *         description: Results retrieved successfully
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
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Result'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalResults:
 *                           type: integer
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPrevPage:
 *                           type: boolean
 *                     stats:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         high:
 *                           type: integer
 *                         medium:
 *                           type: integer
 *                         low:
 *                           type: integer
 *                         processed:
 *                           type: integer
 *                         unprocessed:
 *                           type: integer
 *                     job:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         type:
 *                           type: string
 *                         query:
 *                           type: string
 *                         status:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.get('/:jobId', resultController.getResults);

/**
 * @swagger
 * /api/results/{jobId}/export:
 *   get:
 *     summary: Export results in various formats
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, excel, json]
 *           default: csv
 *         description: Export format
 *       - in: query
 *         name: quality
 *         schema:
 *           type: string
 *           enum: [high, medium, low]
 *         description: Filter by data quality
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 job:
 *                   type: object
 *                 results:
 *                   type: array
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 totalResults:
 *                   type: integer
 *       400:
 *         description: Invalid export format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found or no results to export
 */
router.get('/:jobId/export', resultController.exportResults);

/**
 * @swagger
 * /api/results/{jobId}/{resultId}:
 *   get:
 *     summary: Get a single result by ID
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     responses:
 *       200:
 *         description: Result retrieved successfully
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
 *                     result:
 *                       $ref: '#/components/schemas/Result'
 *                     job:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         type:
 *                           type: string
 *                         query:
 *                           type: string
 *                         status:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job or result not found
 */
router.get('/:jobId/:resultId', resultController.getResult);

/**
 * @swagger
 * /api/results/{jobId}/{resultId}:
 *   put:
 *     summary: Update result data
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 description: Updated result data (will be merged with existing)
 *                 example:
 *                   email: "john.doe@example.com"
 *                   phone: "+1-555-0123"
 *               processingNotes:
 *                 type: string
 *                 description: Notes about the update or validation
 *                 example: "Added contact information from manual research"
 *     responses:
 *       200:
 *         description: Result updated successfully
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
 *                   example: Result updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     result:
 *                       $ref: '#/components/schemas/Result'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job or result not found
 */
router.put('/:jobId/:resultId', resultController.updateResult);

/**
 * @swagger
 * /api/results/{jobId}/{resultId}:
 *   delete:
 *     summary: Delete a result
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     responses:
 *       200:
 *         description: Result deleted successfully
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
 *                   example: Result deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job or result not found
 */
router.delete('/:jobId/:resultId', resultController.deleteResult);

/**
 * @swagger
 * /api/results/{jobId}/bulk:
 *   delete:
 *     summary: Bulk delete results
 *     tags: [Results]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
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
 *             oneOf:
 *               - properties:
 *                   resultIds:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: uuid
 *                     description: Array of result IDs to delete
 *                     example: ["uuid1", "uuid2", "uuid3"]
 *               - properties:
 *                   quality:
 *                     type: string
 *                     enum: [high, medium, low]
 *                     description: Delete all results with this quality
 *                     example: low
 *     responses:
 *       200:
 *         description: Results deleted successfully
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
 *                   example: 5 results deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: integer
 *                       example: 5
 *                     remainingResults:
 *                       type: integer
 *                       example: 45
 *       400:
 *         description: Invalid request - either resultIds or quality required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.delete('/:jobId/bulk', resultController.bulkDeleteResults);

module.exports = router;