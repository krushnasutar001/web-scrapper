const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { getConnection } = require('../utils/database');
const { validateJobToken } = require('./jobs');
const config = require('../config');



// Configure multer for result file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const resultsDir = path.join(__dirname, '../results');
    try {
      await fs.mkdir(resultsDir, { recursive: true });
      cb(null, resultsDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const jobId = req.jobToken?.job_id || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `job-${jobId}-${timestamp}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept JSON, CSV, and Excel files for results
  const allowedTypes = [
    'application/json',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  const allowedExtensions = ['.json', '.csv', '.xlsx', '.xls'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Please upload JSON, CSV, or Excel files only.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for result files
    files: 5 // Maximum 5 files per request
  }
});

/**
 * Middleware to validate job token
 */
const authenticateJobToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
        code: 'MISSING_AUTH_HEADER'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Missing job token',
        code: 'MISSING_TOKEN'
      });
    }
    
    // Validate job token
    const decoded = validateJobToken(token);
    
    // Verify job exists and is in valid state
    const connection = await getConnection();
    
    try {
      const jobQuery = `
        SELECT id, user_id, status, job_type, created_at 
        FROM jobs 
        WHERE id = ?
      `;
      
      const [jobResult] = await connection.execute(jobQuery, [decoded.job_id]);
      
      if (jobResult.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND'
        });
      }
      
      const job = jobResult[0];
      
      // Verify user matches
      if (job.user_id !== decoded.user_id) {
        return res.status(403).json({
          success: false,
          error: 'Job token user mismatch',
          code: 'USER_MISMATCH'
        });
      }
      
      // Check if job is in a state that can accept results
      const validStatuses = ['running', 'completed'];
      if (!validStatuses.includes(job.status)) {
        return res.status(400).json({
          success: false,
          error: `Job is in ${job.status} state and cannot accept results`,
          code: 'INVALID_JOB_STATUS',
          currentStatus: job.status
        });
      }
      
      // Add job info to request
      req.jobToken = decoded;
      req.job = job;
      
      next();
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Job token validation error:', error);
    
    let statusCode = 401;
    let errorCode = 'TOKEN_VALIDATION_ERROR';
    
    if (error.message.includes('expired')) {
      errorCode = 'TOKEN_EXPIRED';
    } else if (error.message.includes('Invalid job token')) {
      errorCode = 'INVALID_TOKEN';
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'JOB_NOT_FOUND';
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: errorCode
    });
  }
};

/**
 * @route   POST /api/results/submit
 * @desc    Submit job results (JSON data)
 * @access  Private (Job Token)
 */
router.post('/submit', authenticateJobToken, async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { results, metadata = {} } = req.body;
    const { job_id, user_id } = req.jobToken;
    const job = req.job;
    
    console.log(`📤 Submitting results for job ${job_id} (${results?.length || 0} items)`);
    
    // Validate results data
    if (!results || !Array.isArray(results)) {
      return res.status(400).json({
        success: false,
        error: 'Results must be an array',
        code: 'INVALID_RESULTS_FORMAT'
      });
    }
    
    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Results array cannot be empty',
        code: 'EMPTY_RESULTS'
      });
    }
    
    await connection.beginTransaction();
    
    // Insert results
    let insertedCount = 0;
    
    for (const result of results) {
      try {
        const resultId = require('crypto').randomUUID();
        
        const insertQuery = `
          INSERT INTO job_results (
            id, job_id, profile_data, scraped_at, created_at
          ) VALUES (
            ?, ?, ?, NOW(), NOW()
          )
        `;
        
        await connection.execute(insertQuery, [
          resultId,
          job_id,
          JSON.stringify(result)
        ]);
        
        insertedCount++;
        
      } catch (insertError) {
        console.error(`❌ Failed to insert result for job ${job_id}:`, insertError);
        // Continue with other results
      }
    }
    
    // Update job status and results count
    const updateJobQuery = `
      UPDATE jobs 
      SET results_count = COALESCE(results_count, 0) + ?,
          updated_at = NOW(),
          completed_at = CASE 
            WHEN status = 'running' AND ? = true THEN NOW() 
            ELSE completed_at 
          END,
          status = CASE 
            WHEN status = 'running' AND ? = true THEN 'completed' 
            ELSE status 
          END
      WHERE id = ?
    `;
    
    const isComplete = metadata.isComplete === true;
    await connection.execute(updateJobQuery, [
      insertedCount,
      isComplete,
      isComplete,
      job_id
    ]);
    
    // Get updated job info
    const [updatedJobResult] = await connection.execute(
      'SELECT results_count, status FROM jobs WHERE id = ?',
      [job_id]
    );
    
    await connection.commit();
    
    const updatedJob = updatedJobResult[0];
    
    console.log(`✅ Results submitted for job ${job_id}: ${insertedCount} items (total: ${updatedJob.results_count})`);
    
    res.status(200).json({
      success: true,
      message: 'Results submitted successfully',
      data: {
        job_id,
        submitted_count: insertedCount,
        total_results: updatedJob.results_count,
        job_status: updatedJob.status,
        is_complete: isComplete
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Failed to submit results for job ${req.jobToken?.job_id}:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to submit results',
      code: 'SUBMIT_ERROR',
      details: config.IS_DEVELOPMENT ? error.message : undefined
    });
  } finally {
    connection.release();
  }
});

/**
 * @route   POST /api/results/upload
 * @desc    Upload job result files
 * @access  Private (Job Token)
 */
router.post('/upload', 
  authenticateJobToken, 
  upload.array('files', 5), 
  async (req, res) => {
    const connection = await getConnection();
    
    try {
      const { job_id } = req.jobToken;
      const files = req.files || [];
      const { metadata = {} } = req.body;
      
      console.log(`📁 Uploading ${files.length} result files for job ${job_id}`);
      
      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded',
          code: 'NO_FILES'
        });
      }
      
      await connection.beginTransaction();
      
      const uploadedFiles = [];
      
      for (const file of files) {
        try {
          // Save file metadata to database
          const fileId = require('crypto').randomUUID();
          
          const insertFileQuery = `
            INSERT INTO job_result_files (
              id, job_id, filename, original_name, file_path, 
              file_size, mime_type, uploaded_at, created_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
            )
          `;
          
          await connection.execute(insertFileQuery, [
            fileId,
            job_id,
            file.filename,
            file.originalname,
            file.path,
            file.size,
            file.mimetype
          ]);
          
          uploadedFiles.push({
            id: fileId,
            filename: file.filename,
            originalName: file.originalname,
            size: file.size,
            mimeType: file.mimetype
          });
          
        } catch (fileError) {
          console.error(`❌ Failed to save file metadata for ${file.originalname}:`, fileError);
          // Clean up uploaded file
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error(`❌ Failed to clean up file ${file.path}:`, unlinkError);
          }
        }
      }
      
      // Update job if this is the final upload
      if (metadata.isComplete === true) {
        const updateJobQuery = `
          UPDATE jobs 
          SET status = 'completed',
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = ? AND status = 'running'
        `;
        
        await connection.execute(updateJobQuery, [job_id]);
      }
      
      await connection.commit();
      
      console.log(`✅ Files uploaded for job ${job_id}: ${uploadedFiles.length} files`);
      
      res.status(200).json({
        success: true,
        message: 'Files uploaded successfully',
        data: {
          job_id,
          uploaded_files: uploadedFiles,
          total_files: uploadedFiles.length,
          is_complete: metadata.isComplete === true
        }
      });
      
    } catch (error) {
      await connection.rollback();
      console.error(`❌ Failed to upload files for job ${req.jobToken?.job_id}:`, error);
      
      // Clean up uploaded files on error
      if (req.files) {
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error(`❌ Failed to clean up file ${file.path}:`, unlinkError);
          }
        }
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to upload files',
        code: 'UPLOAD_ERROR',
        details: config.IS_DEVELOPMENT ? error.message : undefined
      });
    } finally {
      connection.release();
    }
  }
);

/**
 * @route   POST /api/results/progress
 * @desc    Update job progress
 * @access  Private (Job Token)
 */
router.post('/progress', authenticateJobToken, async (req, res) => {
  try {
    const { progress, message, current_url } = req.body;
    const { job_id } = req.jobToken;
    
    // Validate progress
    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return res.status(400).json({
        success: false,
        error: 'Progress must be a number between 0 and 100',
        code: 'INVALID_PROGRESS'
      });
    }
    
    console.log(`📊 Updating progress for job ${job_id}: ${progress}%`);
    
    const connection = await getConnection();
    
    try {
      const updateQuery = `
        UPDATE jobs 
        SET progress = ?,
            status_message = ?,
            current_url = ?,
            updated_at = NOW()
        WHERE id = ?
      `;
      
      await connection.execute(updateQuery, [
        progress,
        message || null,
        current_url || null,
        job_id
      ]);
      
      // Get updated job info
      const [jobResult] = await connection.execute(
        'SELECT progress, status_message FROM jobs WHERE id = ?',
        [job_id]
      );
      
      if (jobResult.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Progress updated successfully',
        data: {
          job_id,
          progress: jobResult[0].progress,
          status_message: jobResult[0].status_message
        }
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error(`❌ Failed to update progress for job ${req.jobToken?.job_id}:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to update progress',
      code: 'PROGRESS_UPDATE_ERROR',
      details: config.IS_DEVELOPMENT ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/results/error
 * @desc    Report job error
 * @access  Private (Job Token)
 */
router.post('/error', authenticateJobToken, async (req, res) => {
  try {
    const { error_message, error_code, is_fatal = false } = req.body;
    const { job_id } = req.jobToken;
    
    if (!error_message) {
      return res.status(400).json({
        success: false,
        error: 'Error message is required',
        code: 'MISSING_ERROR_MESSAGE'
      });
    }
    
    console.log(`❌ Error reported for job ${job_id}: ${error_message}`);
    
    const connection = await getConnection();
    
    try {
      const updateQuery = `
        UPDATE jobs 
        SET error_message = ?,
            error_code = ?,
            status = CASE WHEN ? = true THEN 'failed' ELSE status END,
            completed_at = CASE WHEN ? = true THEN NOW() ELSE completed_at END,
            updated_at = NOW()
        WHERE id = ?
      `;
      
      await connection.execute(updateQuery, [
        error_message,
        error_code || null,
        is_fatal,
        is_fatal,
        job_id
      ]);
      
      // Get updated job info
      const [jobResult] = await connection.execute(
        'SELECT status, error_message FROM jobs WHERE id = ?',
        [job_id]
      );
      
      if (jobResult.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Error reported successfully',
        data: {
          job_id,
          status: jobResult[0].status,
          error_message: jobResult[0].error_message,
          is_fatal
        }
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error(`❌ Failed to report error for job ${req.jobToken?.job_id}:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to report error',
      code: 'ERROR_REPORT_ERROR',
      details: config.IS_DEVELOPMENT ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/results/job/:jobId
 * @desc    Get job results (for job owner)
 * @access  Private (Job Token)
 */
router.get('/job/:jobId', authenticateJobToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { job_id } = req.jobToken;
    
    // Verify job ID matches token
    if (jobId !== job_id) {
      return res.status(403).json({
        success: false,
        error: 'Job ID mismatch',
        code: 'JOB_ID_MISMATCH'
      });
    }
    
    const connection = await getConnection();
    
    try {
      // Get job results
      const resultsQuery = `
        SELECT id, profile_data, scraped_at, created_at
        FROM job_results 
        WHERE job_id = ?
        ORDER BY created_at DESC
      `;
      
      const [resultsResult] = await connection.execute(resultsQuery, [job_id]);
      
      // Get job files
      const filesQuery = `
        SELECT id, filename, original_name, file_size, mime_type, uploaded_at
        FROM job_result_files 
        WHERE job_id = ?
        ORDER BY uploaded_at DESC
      `;
      
      const [filesResult] = await connection.execute(filesQuery, [job_id]);
      
      res.status(200).json({
        success: true,
        data: {
          job_id,
          results: resultsResult.map(row => ({
            id: row.id,
            data: row.profile_data,
            scraped_at: row.scraped_at,
            created_at: row.created_at
          })),
          files: filesResult,
          total_results: resultsResult.length,
          total_files: filesResult.length
        }
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error(`❌ Failed to get results for job ${req.params.jobId}:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get job results',
      code: 'GET_RESULTS_ERROR',
      details: config.IS_DEVELOPMENT ? error.message : undefined
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB per file.',
        code: 'FILE_TOO_LARGE'
      });
    }
    
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum 5 files per request.',
        code: 'TOO_MANY_FILES'
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