const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jobController = require('../controllers/jobController');
const exportService = require('../services/exportService');
const { authenticateToken, rateLimit } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept CSV and Excel files
  const allowedTypes = [
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedTypes.includes(file.mimetype) || 
      file.originalname.toLowerCase().endsWith('.csv') ||
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.originalname.toLowerCase().endsWith('.xls')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Please upload CSV or Excel files only.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Rate limiting for job operations
const jobRateLimit = rateLimit(30, 15 * 60 * 1000); // 30 requests per 15 minutes
const createJobRateLimit = rateLimit(10, 15 * 60 * 1000); // 10 job creations per 15 minutes

/**
 * @route   GET /api/jobs
 * @desc    Get all jobs for the authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, jobRateLimit, jobController.getJobs);

/**
 * @route   GET /api/jobs/:jobId
 * @desc    Get a specific job by ID
 * @access  Private
 */
router.get('/:jobId', authenticateToken, jobRateLimit, jobController.getJobById);

/**
 * @route   POST /api/jobs
 * @desc    Create a new job
 * @access  Private
 */
router.post('/', 
  authenticateToken, 
  createJobRateLimit, 
  upload.single('file'), 
  (req, res, next) => {
    // Handle multer errors
    if (req.fileValidationError) {
      return res.status(400).json({
        success: false,
        error: req.fileValidationError,
        code: 'INVALID_FILE_TYPE'
      });
    }
    next();
  },
  jobController.createJob
);

/**
 * @route   GET /api/jobs/:jobId/status
 * @desc    Get job status and progress
 * @access  Private
 */
router.get('/:jobId/status', authenticateToken, jobRateLimit, jobController.getJobStatus);

/**
 * @route   POST /api/jobs/:jobId/pause
 * @desc    Pause a job
 * @access  Private
 */
router.post('/:jobId/pause', authenticateToken, jobRateLimit, jobController.pauseJob);

/**
 * @route   POST /api/jobs/:jobId/resume
 * @desc    Resume a job
 * @access  Private
 */
router.post('/:jobId/resume', authenticateToken, jobRateLimit, jobController.resumeJob);

/**
 * @route   POST /api/jobs/:jobId/cancel
 * @desc    Cancel a job
 * @access  Private
 */
router.post('/:jobId/cancel', authenticateToken, jobRateLimit, jobController.cancelJob);

/**
 * @route   DELETE /api/jobs/:jobId
 * @desc    Delete a job
 * @access  Private
 */
router.delete('/:jobId', authenticateToken, jobRateLimit, jobController.deleteJob);

/**
 * @route   GET /api/jobs/:jobId/download/:format
 * @desc    Download job results in specified format
 * @access  Private
 */
router.get('/:jobId/download/:format', authenticateToken, jobRateLimit, async (req, res) => {
  try {
    const { jobId, format } = req.params;
    const user = req.user;
    
    console.log(`📥 Download request: Job ${jobId} in ${format} format by user ${user.id}`);
    
    // Validate format
    const validFormats = ['csv', 'excel', 'xlsx', 'json'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Supported formats: csv, excel, json',
        code: 'INVALID_FORMAT'
      });
    }
    
    // Export job results
    const exportResult = await exportService.exportJobResults(jobId, format, user.id);
    
    // Set response headers
    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.setHeader('Content-Length', exportResult.size);
    
    // Send file
    res.send(exportResult.data);
    
    console.log(`✅ Download completed: ${exportResult.filename} (${exportResult.size} bytes)`);
    
  } catch (error) {
    console.error('❌ Download error:', error);
    
    let statusCode = 500;
    let errorCode = 'DOWNLOAD_ERROR';
    
    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'JOB_NOT_FOUND';
    } else if (error.message.includes('Access denied')) {
      statusCode = 403;
      errorCode = 'ACCESS_DENIED';
    } else if (error.message.includes('not completed')) {
      statusCode = 400;
      errorCode = 'JOB_NOT_COMPLETED';
    } else if (error.message.includes('No results')) {
      statusCode = 404;
      errorCode = 'NO_RESULTS';
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: errorCode
    });
  }
});

/**
 * @route   POST /api/jobs/export/multiple
 * @desc    Export results from multiple jobs
 * @access  Private
 */
router.post('/export/multiple', authenticateToken, jobRateLimit, async (req, res) => {
  try {
    const { jobIds, format = 'excel' } = req.body;
    const user = req.user;
    
    console.log(`📥 Multiple jobs export request: ${jobIds?.length} jobs in ${format} format`);
    
    // Validate input
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Job IDs array is required',
        code: 'MISSING_JOB_IDS'
      });
    }
    
    if (jobIds.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 20 jobs can be exported at once',
        code: 'TOO_MANY_JOBS'
      });
    }
    
    // Validate format
    const validFormats = ['csv', 'excel', 'xlsx', 'json'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Supported formats: csv, excel, json',
        code: 'INVALID_FORMAT'
      });
    }
    
    // Export multiple jobs
    const exportResult = await exportService.exportMultipleJobs(jobIds, format, user.id);
    
    // Set response headers
    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.setHeader('Content-Length', exportResult.size);
    
    // Send file
    res.send(exportResult.data);
    
    console.log(`✅ Multiple jobs export completed: ${exportResult.filename} (${exportResult.size} bytes)`);
    
  } catch (error) {
    console.error('❌ Multiple jobs export error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'EXPORT_ERROR'
    });
  }
});

/**
 * @route   GET /api/jobs/export/stats
 * @desc    Get export statistics for the user
 * @access  Private
 */
router.get('/export/stats', authenticateToken, jobRateLimit, async (req, res) => {
  try {
    const user = req.user;
    
    const stats = await exportService.getExportStats(user.id);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Export stats error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get export statistics',
      code: 'EXPORT_STATS_ERROR'
    });
  }
});

/**
 * @route   POST /api/jobs/process-queue
 * @desc    Manual job processing trigger
 * @access  Private
 */
router.post('/process-queue', authenticateToken, async (req, res) => {
  try {
    const jobWorker = require('../services/jobWorker');
    
    // Get queue status
    const status = jobWorker.getQueueStatus();
    
    console.log('🔄 Manual job processing triggered by user:', req.user.email);
    console.log('📊 Current queue status:', status);
    
    // Force load pending jobs
    await jobWorker.loadPendingJobs();
    
    // Get updated status
    const updatedStatus = jobWorker.getQueueStatus();
    
    res.json({
      success: true,
      message: 'Job processing triggered successfully',
      queue_status: {
        before: status,
        after: updatedStatus
      }
    });
    
  } catch (error) {
    console.error('❌ Manual job processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger job processing',
      code: 'PROCESS_ERROR'
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.',
        code: 'FILE_TOO_LARGE'
      });
    }
    
    return res.status(400).json({
      success: false,
      error: 'File upload error: ' + error.message,
      code: 'UPLOAD_ERROR'
    });
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      error: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }
  
  next(error);
});

module.exports = router;