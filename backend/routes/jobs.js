const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const { getConnection } = require('../utils/database');
const config = require('../config');
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
 * Generate job token (JWT with short expiry)
 */
const generateJobToken = (jobId, userId) => {
  return jwt.sign(
    { 
      job_id: jobId, 
      user_id: userId,
      type: 'job_token'
    },
    config.JOB_SIGN_SECRET,
    { 
      expiresIn: config.JOB_TOKEN_EXPIRY,
      issuer: 'linkedin-automation-saas',
      audience: 'job-worker'
    }
  );
};

/**
 * Validate job token
 */
const validateJobToken = (token) => {
  try {
    return jwt.verify(token, config.JOB_SIGN_SECRET, {
      issuer: 'linkedin-automation-saas',
      audience: 'job-worker'
    });
  } catch (error) {
    throw new Error('Invalid job token');
  }
};

/**
 * Transactional job creation with credit deduction
 */
const createJobTransactional = async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    await connection.beginTransaction();
    
    const user = req.user;
    
    // Add detailed logging for debugging
    console.log('🔍 DEBUG: Full request body:', JSON.stringify(req.body, null, 2));
    console.log('🔍 DEBUG: Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('🔍 DEBUG: File upload info:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file uploaded');
    
    const { 
      job_name, 
      job_type, 
      max_results = 100, 
      configuration = {},
      urls = []
    } = req.body;
    
    console.log(`🔄 Creating job transactionally for user ${user.id}`);
    console.log('🔍 DEBUG: Extracted values:');
    console.log('  - job_name:', job_name);
    console.log('  - job_type:', job_type);
    console.log('  - max_results:', max_results);
    console.log('  - configuration:', configuration);
    console.log('  - urls:', urls);
    console.log('  - urls type:', typeof urls);
    console.log('  - urls length:', Array.isArray(urls) ? urls.length : 'Not an array');
    
    // Validate required fields
    if (!job_name || !job_type) {
      console.log('❌ DEBUG: Missing required fields - job_name:', !!job_name, 'job_type:', !!job_type);
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Job name and type are required',
        code: 'MISSING_REQUIRED_FIELDS',
        debug: {
          job_name_provided: !!job_name,
          job_type_provided: !!job_type,
          received_body: req.body
        }
      });
    }
    
    // Validate job type
    const validJobTypes = ['profile_scraping', 'company_scraping', 'search_result_scraping'];
    if (!validJobTypes.includes(job_type)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Invalid job type',
        code: 'INVALID_JOB_TYPE',
        validTypes: validJobTypes
      });
    }
    
    // Calculate credits needed based on URLs and job type (1 credit per URL, minimum 1)
    const creditsNeeded = Math.max(urls.length, 1);
    
    // Check user credits
    const creditQuery = 'SELECT credits FROM users WHERE id = ?';
    const [creditResult] = await connection.execute(creditQuery, [user.id]);
    
    if (!creditResult.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const userCredits = creditResult[0].credits;
    if (userCredits < creditsNeeded) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. Required: ${creditsNeeded}, Available: ${userCredits}`,
        code: 'INSUFFICIENT_CREDITS',
        required: creditsNeeded,
        available: userCredits
      });
    }
    
    // Deduct credits from user
    const updateCreditsQuery = 'UPDATE users SET credits = credits - ? WHERE id = ?';
    await connection.execute(updateCreditsQuery, [creditsNeeded, user.id]);
    
    // Generate a UUID for the job
    const jobId = require('crypto').randomUUID();
    
    // Create job
    const createJobQuery = `
      INSERT INTO jobs (
        id, user_id, job_name, job_type, status, max_results, 
        configuration, created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())
    `;
    
    const [jobResult] = await connection.execute(createJobQuery, [
      jobId,
      user.id,
      job_name,
      job_type,
      max_results,
      JSON.stringify(configuration)
    ]);
    
    // Insert URLs if provided
    if (urls && urls.length > 0) {
      const insertUrlsQuery = `
        INSERT INTO job_urls (job_id, url, status, created_at) 
        VALUES ${urls.map(() => '(?, ?, "pending", NOW())').join(', ')}
      `;
      const urlParams = urls.flatMap(url => [jobId, url]);
      await connection.execute(insertUrlsQuery, urlParams);
    }
    
    await connection.commit();
    
    console.log(`✅ Job ${jobId} created successfully for user ${user.id}`);
    console.log(`💰 Credits deducted: ${creditsNeeded}, Remaining: ${userCredits - creditsNeeded}`);
    
    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: {
        job_id: jobId,
        job_name,
        job_type,
        status: 'pending',
        max_results,
        configuration,
        urls_count: urls.length,
        credits_deducted: creditsNeeded,
        remaining_credits: userCredits - creditsNeeded,
        created_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error creating job:', error);
    
    try {
      if (connection) await connection.rollback();
    } catch (rollbackError) {
      console.error('❌ Error rolling back transaction:', rollbackError);
    }
    
    const statusCode = connection ? 500 : 503;
    res.status(statusCode).json({
      success: false,
      error: connection ? 'Failed to create job' : 'Database connection unavailable',
      code: connection ? 'JOB_CREATION_FAILED' : 'DB_CONNECTION_ERROR',
      details: error.message
    });
  } finally {
    try {
      if (connection) connection.release();
    } catch (releaseError) {
      console.error('❌ Error releasing DB connection:', releaseError);
    }
  }
};

/**
 * @route   GET /api/jobs
 * @desc    Get all jobs for the authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, jobController.getJobs);
// Specific route for pending jobs must come before parameterized routes
router.get('/pending', authenticateToken, jobRateLimit, jobController.getPendingJobs);

/**
 * @route   GET /api/jobs/:jobId
 * @desc    Get a specific job by ID
 * @access  Private
 */
router.get('/:jobId', authenticateToken, jobRateLimit, jobController.getJobById);

/**
 * @route   POST /api/jobs
 * @desc    Create a new job with transactional credit deduction
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
  createJobTransactional
);

/**
 * @route   GET /api/jobs/:jobId/status
 * @desc    Get job status and progress
 * @access  Private
 */
router.get('/:jobId/status', authenticateToken, jobRateLimit, jobController.getJobStatus);

/**
 * @route   GET /api/jobs/stats
 * @desc    Get aggregated job stats for user
 * @access  Private
 */
router.get('/stats', authenticateToken, jobRateLimit, jobController.getJobStats);

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