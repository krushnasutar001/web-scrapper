const Job = require('../models/Job');
const LinkedInAccount = require('../models/LinkedInAccount');
const { query } = require('../utils/database');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * URL validation function
 */
const validateLinkedInURL = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('linkedin.com');
  } catch {
    return false;
  }
};

/**
 * Parse URLs from file (CSV or Excel)
 */
const parseUrlsFromFile = async (file) => {
  return new Promise((resolve, reject) => {
    const urls = [];
    const filePath = file.path;
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    try {
      if (fileExtension === '.csv') {
        // Parse CSV file
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            // Look for URL in common column names
            const url = row.url || row.URL || row.link || row.Link || row.linkedin_url || Object.values(row)[0];
            if (url && typeof url === 'string') {
              urls.push(url.trim());
            }
          })
          .on('end', () => {
            resolve(urls);
          })
          .on('error', reject);
      } else if (['.xlsx', '.xls'].includes(fileExtension)) {
        // Parse Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);
        
        data.forEach(row => {
          const url = row.url || row.URL || row.link || row.Link || row.linkedin_url || Object.values(row)[0];
          if (url && typeof url === 'string') {
            urls.push(url.trim());
          }
        });
        
        resolve(urls);
      } else {
        reject(new Error('Unsupported file format. Please use CSV or Excel files.'));
      }
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Get all jobs for the authenticated user
 */
const getJobs = async (req, res) => {
  try {
    const user = req.user;
    const { status, limit = 50, offset = 0 } = req.query;
    
    console.log('📋 Fetching jobs for user:', user.id);
    
    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    if (status) {
      options.status = status;
    }
    
    const jobs = await Job.findByUserId(user.id, options);
    
    console.log(`✅ Found ${jobs.length} jobs`);
    
    res.json({
      success: true,
      jobs: jobs.map(job => job.toJSON()),
      total: jobs.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching jobs:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs',
      code: 'FETCH_JOBS_ERROR'
    });
  }
};

/**
 * Get a specific job by ID
 */
const getJobById = async (req, res) => {
  try {
    const { jobId } = req.params;
    const user = req.user;
    
    console.log('📋 Fetching job:', { jobId, userId: user.id });
    
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND'
      });
    }
    
    // Check if job belongs to the user
    if (job.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this job',
        code: 'ACCESS_DENIED'
      });
    }
    
    res.json({
      success: true,
      job: job.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error fetching job:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job',
      code: 'FETCH_JOB_ERROR'
    });
  }
};

/**
 * Create a new job
 */
const createJob = async (req, res) => {
  try {
    const user = req.user;
    const file = req.file;
    
    console.log('📋 Creating job for user:', user.id);
    console.log('📋 Request body:', req.body);
    console.log('📋 Uploaded file:', file ? file.originalname : 'None');
    
    // Extract and map fields
    const {
      type, jobType,
      query, jobName,
      maxResults, maxPages,
      configuration,
      urls, searchQuery,
      accountSelectionMode,
      selectedAccountIds
    } = req.body;
    
    // Map frontend fields to backend fields
    const mappedType = type || jobType;
    const mappedQuery = query || jobName || searchQuery;
    const mappedMaxResults = maxResults || maxPages || 100;
    
    console.log('📋 Mapped fields:', {
      type: mappedType,
      query: mappedQuery,
      maxResults: mappedMaxResults,
      accountSelectionMode,
      selectedAccountIds
    });
    
    // Validate required fields
    if (!mappedType || !mappedQuery) {
      return res.status(400).json({
        success: false,
        error: 'Job type and job name are required',
        code: 'MISSING_FIELDS',
        received: { type: mappedType, query: mappedQuery }
      });
    }
    
    // Validate job type
    const validJobTypes = ['profile_scraping', 'company_scraping', 'search_result_scraping'];
    if (!validJobTypes.includes(mappedType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type',
        code: 'INVALID_JOB_TYPE',
        validTypes: validJobTypes
      });
    }
    
    // Extract URLs from various sources
    let urlList = [];
    
    // From file upload
    if (file) {
      try {
        console.log('📋 Parsing URLs from file:', file.originalname);
        const fileUrls = await parseUrlsFromFile(file);
        urlList = urlList.concat(fileUrls);
        
        // Clean up uploaded file
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error('❌ Error parsing file:', error);
        return res.status(400).json({
          success: false,
          error: 'Failed to parse uploaded file: ' + error.message,
          code: 'FILE_PARSE_ERROR'
        });
      }
    }
    
    // From manual input
    if (urls) {
      if (Array.isArray(urls)) {
        urlList = urlList.concat(urls);
      } else if (typeof urls === 'string') {
        const manualUrls = urls.split('\n')
          .map(url => url.trim())
          .filter(Boolean);
        urlList = urlList.concat(manualUrls);
      }
    }
    
    // From configuration
    if (configuration && configuration.urls) {
      const configUrls = Array.isArray(configuration.urls) ? configuration.urls : [];
      urlList = urlList.concat(configUrls);
    }
    
    // Remove duplicates and validate URLs
    urlList = [...new Set(urlList)];
    const validUrls = [];
    const invalidUrls = [];
    
    urlList.forEach(url => {
      if (validateLinkedInURL(url)) {
        validUrls.push(url);
      } else {
        invalidUrls.push(url);
      }
    });
    
    console.log(`📋 URL Validation: ${validUrls.length} valid, ${invalidUrls.length} invalid`);
    if (invalidUrls.length > 0) {
      console.log('❌ Invalid URLs:', invalidUrls.slice(0, 5)); // Log first 5 invalid URLs
    }
    
    if (validUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid LinkedIn URLs provided',
        code: 'NO_VALID_URLS',
        invalidUrls: invalidUrls.slice(0, 10) // Return first 10 invalid URLs
      });
    }
    
    // Validate selected accounts if specified
    let accountIds = [];
    if (selectedAccountIds && selectedAccountIds.length > 0) {
      // Ensure all selected accounts belong to the user and are available
      const availableAccounts = await LinkedInAccount.findAvailableByUserId(user.id);
      const availableAccountIds = availableAccounts.map(acc => acc.id);
      
      accountIds = selectedAccountIds.filter(id => availableAccountIds.includes(id));
      
      if (accountIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid LinkedIn accounts selected',
          code: 'NO_VALID_ACCOUNTS'
        });
      }
    }
    
    // Create enhanced configuration
    const jobConfig = {
      ...configuration,
      accountSelectionMode: accountSelectionMode || 'rotation',
      selectedAccountIds: accountIds,
      urls: validUrls,
      invalidUrls: invalidUrls,
      originalJobName: jobName,
      originalJobType: jobType,
      file: file ? file.originalname : null
    };
    
    // Create the job
    const newJob = await Job.create({
      user_id: user.id,
      job_name: mappedQuery,
      job_type: mappedType,
      max_results: mappedMaxResults,
      configuration: jobConfig,
      urls: validUrls
    });
    
    console.log(`✅ Job created: ${mappedQuery} (${mappedType}) with ${validUrls.length} URLs`);
    
    // Start job processing immediately
    const jobWorker = require('../services/jobWorker');
    jobWorker.addJobToQueue(newJob.id);
    
    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      job: newJob.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error creating job:', error);
    
    // Clean up uploaded file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create job',
      code: 'CREATE_JOB_ERROR'
    });
  }
};

/**
 * Pause a job
 */
const pauseJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const user = req.user;
    
    console.log('⏸️ Pausing job:', { jobId, userId: user.id });
    
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND'
      });
    }
    
    if (job.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this job',
        code: 'ACCESS_DENIED'
      });
    }
    
    await job.pause();
    
    // Notify job worker to pause
    const jobWorker = require('../services/jobWorker');
    jobWorker.pauseJob(jobId);
    
    console.log(`⏸️ Job paused: ${jobId}`);
    
    res.json({
      success: true,
      message: 'Job paused successfully',
      job: job.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error pausing job:', error);
    
    if (error.message.includes('not running')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_JOB_STATE'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to pause job',
      code: 'PAUSE_JOB_ERROR'
    });
  }
};

/**
 * Resume a job
 */
const resumeJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const user = req.user;
    
    console.log('▶️ Resuming job:', { jobId, userId: user.id });
    
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND'
      });
    }
    
    if (job.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this job',
        code: 'ACCESS_DENIED'
      });
    }
    
    await job.resume();
    
    // Notify job worker to resume
    const jobWorker = require('../services/jobWorker');
    jobWorker.resumeJob(jobId);
    
    console.log(`▶️ Job resumed: ${jobId}`);
    
    res.json({
      success: true,
      message: 'Job resumed successfully',
      job: job.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error resuming job:', error);
    
    if (error.message.includes('not paused')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_JOB_STATE'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to resume job',
      code: 'RESUME_JOB_ERROR'
    });
  }
};

/**
 * Cancel a job
 */
const cancelJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const user = req.user;
    
    console.log('❌ Cancelling job:', { jobId, userId: user.id });
    
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND'
      });
    }
    
    if (job.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this job',
        code: 'ACCESS_DENIED'
      });
    }
    
    await job.cancel();
    
    // Notify job worker to cancel
    const jobWorker = require('../services/jobWorker');
    jobWorker.cancelJob(jobId);
    
    console.log(`❌ Job cancelled: ${jobId}`);
    
    res.json({
      success: true,
      message: 'Job cancelled successfully',
      job: job.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error cancelling job:', error);
    
    if (error.message.includes('already finished')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_JOB_STATE'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job',
      code: 'CANCEL_JOB_ERROR'
    });
  }
};

/**
 * Get job status and progress
 */
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const user = req.user;
    
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND'
      });
    }
    
    if (job.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this job',
        code: 'ACCESS_DENIED'
      });
    }
    
    res.json({
      success: true,
      job: job.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error getting job status:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      code: 'GET_JOB_STATUS_ERROR'
    });
  }
};

/**
 * Delete a job
 */
const deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const user = req.user;
    
    console.log('🗑️ Deleting job:', { jobId, userId: user.id });
    
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND'
      });
    }
    
    if (job.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this job',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Cancel job if it's running
    if (['pending', 'running', 'paused'].includes(job.status)) {
      const jobWorker = require('../services/jobWorker');
      jobWorker.cancelJob(jobId);
    }
    
    await job.delete();
    
    console.log(`🗑️ Job deleted: ${jobId}`);
    
    res.json({
      success: true,
      message: 'Job deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting job:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete job',
      code: 'DELETE_JOB_ERROR'
    });
  }
};

module.exports = {
  getJobs,
  getJobById,
  createJob,
  pauseJob,
  resumeJob,
  cancelJob,
  getJobStatus,
  deleteJob
};