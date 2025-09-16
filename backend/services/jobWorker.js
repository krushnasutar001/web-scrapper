const Job = require('../models/Job');
const LinkedInAccount = require('../models/LinkedInAccount');
const { query, transaction } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const LinkedInScraper = require('./linkedin-scraper');
const ScrapingService = require('./scrapingService');
const fs = require('fs').promises;
const path = require('path');

// Job queue and processing state
const jobQueue = [];
const processingJobs = new Map();
const pausedJobs = new Set();
const cancelledJobs = new Set();

// Configuration
const MAX_CONCURRENT_JOBS = 3;
const URL_PROCESSING_DELAY = 2000; // 2 seconds between URLs
const SUCCESS_RATE = 0.85; // 85% success rate simulation

/**
 * Add job to processing queue
 */
const addJobToQueue = async (jobId) => {
  try {
    console.log(`📋 Adding job to queue: ${jobId}`);
    
    const job = await Job.findById(jobId);
    if (!job) {
      console.error(`❌ Job not found: ${jobId}`);
      return false;
    }
    
    // Add to queue if not already there
    if (!jobQueue.find(queuedJob => queuedJob.id === jobId)) {
      jobQueue.push({ id: jobId, addedAt: new Date() });
      console.log(`✅ Job added to queue: ${jobId}`);
    }
    
    // Start processing if we have capacity
    processNextJob();
    
    return true;
  } catch (error) {
    console.error(`❌ Error adding job to queue:`, error);
    return false;
  }
};

/**
 * Process next job in queue
 */
const processNextJob = async () => {
  try {
    // Check if we have capacity
    if (processingJobs.size >= MAX_CONCURRENT_JOBS) {
      console.log(`⏳ Max concurrent jobs reached (${MAX_CONCURRENT_JOBS}), waiting...`);
      return;
    }
    
    // Get next job from queue
    const queuedJob = jobQueue.shift();
    if (!queuedJob) {
      return; // No jobs in queue
    }
    
    const jobId = queuedJob.id;
    
    // Check if job was cancelled
    if (cancelledJobs.has(jobId)) {
      cancelledJobs.delete(jobId);
      console.log(`❌ Skipping cancelled job: ${jobId}`);
      return processNextJob(); // Process next job
    }
    
    // Start processing
    processingJobs.set(jobId, { startedAt: new Date() });
    console.log(`🚀 Starting job processing: ${jobId}`);
    
    // Process job asynchronously
    processJob(jobId)
      .then(() => {
        processingJobs.delete(jobId);
        pausedJobs.delete(jobId);
        cancelledJobs.delete(jobId);
        
        // Process next job in queue
        setTimeout(processNextJob, 1000);
      })
      .catch((error) => {
        console.error(`❌ Job processing failed: ${jobId}`, error);
        processingJobs.delete(jobId);
        pausedJobs.delete(jobId);
        cancelledJobs.delete(jobId);
        
        // Process next job in queue
        setTimeout(processNextJob, 1000);
      });
    
  } catch (error) {
    console.error(`❌ Error processing next job:`, error);
  }
};

/**
 * Process a single job
 */
const processJob = async (jobId) => {
  try {
    const job = await Job.findById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    console.log(`🔄 Processing job: ${job.job_name} (${job.job_type})`);
    
    // Update job status to running
    await job.updateStatus('running', { started_at: new Date() });
    
    // Get job URLs
    const jobUrls = await job.getUrls('pending');
    
    if (jobUrls.length === 0) {
      console.log(`⚠️ No URLs to process for job: ${jobId}`);
      await job.updateStatus('completed', { completed_at: new Date() });
      return;
    }
    
    console.log(`📊 Processing ${jobUrls.length} URLs for job: ${jobId}`);
    
    // Get assigned accounts or use available accounts
    const assignedAccounts = await job.getAssignedAccounts();
    let availableAccounts = assignedAccounts.length > 0 
      ? assignedAccounts 
      : await LinkedInAccount.findAvailableByUserId(job.user_id);
    
    if (availableAccounts.length === 0) {
      throw new Error('No available LinkedIn accounts for scraping');
    }
    
    console.log(`🔗 Using ${availableAccounts.length} LinkedIn accounts`);
    
    let accountIndex = 0;
    let processedCount = 0;
    let successfulCount = 0;
    let failedCount = 0;
    
    // Process each URL
    for (const jobUrl of jobUrls) {
      // Check if job is paused
      while (pausedJobs.has(jobId)) {
        console.log(`⏸️ Job ${jobId} is paused, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if job was cancelled while paused
        if (cancelledJobs.has(jobId)) {
          throw new Error('Job was cancelled');
        }
      }
      
      // Check if job was cancelled
      if (cancelledJobs.has(jobId)) {
        throw new Error('Job was cancelled');
      }
      
      console.log(`🔍 Processing URL ${processedCount + 1}/${jobUrls.length}: ${jobUrl.url}`);
      
      // Select account for this URL (round-robin)
      const selectedAccount = availableAccounts[accountIndex % availableAccounts.length];
      accountIndex++;
      
      // Update URL status to processing
      await query(
        'UPDATE job_urls SET status = "processing", processed_at = NOW() WHERE id = ?',
        [jobUrl.id]
      );
      
      try {
        // Perform actual scraping
        const scrapingResult = await performRealScraping(jobUrl.url, selectedAccount, job.job_type);
        
        if (scrapingResult.success) {
          // Update URL status to completed
          await query(
            'UPDATE job_urls SET status = "completed" WHERE id = ?',
            [jobUrl.id]
          );
          
          // Save scraped data
          await saveScrapedData(job.id, jobUrl.id, jobUrl.url, scrapingResult.data);
          
          successfulCount++;
          console.log(`✅ Successfully scraped: ${jobUrl.url}`);
        } else {
          throw new Error(scrapingResult.error || 'Scraping failed');
        }
        
      } catch (error) {
        console.log(`❌ Failed to scrape: ${jobUrl.url} - ${error.message}`);
        
        // Update URL status to failed
        await query(
          'UPDATE job_urls SET status = "failed", error_message = ? WHERE id = ?',
          [error.message, jobUrl.id]
        );
        
        failedCount++;
      }
      
      processedCount++;
      
      // Update job progress
      await job.updateProgress({
        processed_urls: processedCount,
        successful_urls: successfulCount,
        failed_urls: failedCount,
        result_count: successfulCount
      });
      
      console.log(`📊 Progress: ${processedCount}/${jobUrls.length} (${successfulCount} success, ${failedCount} failed)`);
      
      // Increment account request count
      await selectedAccount.incrementRequestCount();
      
      // Add delay between URLs to avoid rate limiting
      if (processedCount < jobUrls.length) {
        await new Promise(resolve => setTimeout(resolve, URL_PROCESSING_DELAY));
      }
    }
    
    // Job completed
    await job.updateStatus('completed', { 
      completed_at: new Date(),
      result_count: successfulCount
    });
    
    console.log(`✅ Job completed: ${jobId} - ${successfulCount}/${jobUrls.length} URLs scraped successfully`);
    
  } catch (error) {
    console.error(`❌ Job processing failed: ${jobId}`, error);
    
    // Update job status to failed
    const job = await Job.findById(jobId);
    if (job) {
      await job.updateStatus('failed', {
        completed_at: new Date(),
        error_message: error.message
      });
    }
    
    throw error;
  }
};

/**
 * Perform real LinkedIn scraping using Puppeteer
 */
const performRealScraping = async (url, account, jobType) => {
  let scraper = null;
  
  try {
    console.log(`🔍 Starting real scraping for: ${url}`);
    console.log(`🔗 Using account: ${account.email}`);
    
    // Initialize LinkedIn scraper
    scraper = new LinkedInScraper({
      headless: true,
      timeout: 30000
    });
    
    await scraper.initialize();
    
    // Load account cookies if available
    const cookiesPath = path.join(__dirname, '../cookies', `${account.id}.json`);
    try {
      const cookiesData = await fs.readFile(cookiesPath, 'utf8');
      const cookies = JSON.parse(cookiesData);
      await scraper.loadCookies(cookies);
      console.log(`🍪 Loaded cookies for account: ${account.email}`);
    } catch (error) {
      console.log(`⚠️ No cookies found for account: ${account.email}`);
    }
    
    // Perform scraping based on job type
    let scrapedData;
    
    if (jobType === 'profile_scraping') {
      scrapedData = await scraper.scrapeProfile(url);
    } else if (jobType === 'company_scraping') {
      scrapedData = await scraper.scrapeCompany(url);
    } else {
      throw new Error(`Unsupported job type: ${jobType}`);
    }
    
    if (scrapedData) {
      console.log(`✅ Successfully scraped: ${url}`);
      return {
        success: true,
        data: {
          ...scrapedData,
          linkedin_url: url,
          scraped_at: new Date().toISOString(),
          scraped_by_account: account.email
        }
      };
    } else {
      throw new Error('No data extracted from profile');
    }
    
  } catch (error) {
    console.error(`❌ Scraping failed for ${url}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (scraper) {
      await scraper.close();
    }
  }
};

/**
 * Fallback simulation for testing (kept for backward compatibility)
 */
const simulateScraping = async (url, account) => {
  // Simulate network delay
  const delay = Math.random() * 3000 + 1000; // 1-4 seconds
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Simulate success/failure based on SUCCESS_RATE
  const isSuccess = Math.random() < SUCCESS_RATE;
  
  if (isSuccess) {
    // Generate mock scraped data
    const mockData = {
      name: `Person ${Math.floor(Math.random() * 1000)}`,
      title: 'Software Engineer',
      company: `Company ${Math.floor(Math.random() * 100)}`,
      location: 'San Francisco, CA',
      email: `person${Math.floor(Math.random() * 1000)}@company.com`,
      linkedin_url: url,
      scraped_at: new Date().toISOString(),
      scraped_by_account: account.email
    };
    
    return {
      success: true,
      data: mockData
    };
  } else {
    // Simulate various failure reasons
    const errors = [
      'Profile not accessible',
      'Rate limit exceeded',
      'Network timeout',
      'Invalid URL format',
      'Account blocked'
    ];
    
    return {
      success: false,
      error: errors[Math.floor(Math.random() * errors.length)]
    };
  }
};

/**
 * Save scraped data to database
 */
const saveScrapedData = async (jobId, jobUrlId, sourceUrl, scrapedData) => {
  try {
    const resultId = uuidv4();
    
    const sql = `
      INSERT INTO job_results (
        id, job_id, job_url_id, source_url, scraped_data,
        name, title, company, location, email, linkedin_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    
    await query(sql, [
      resultId,
      jobId,
      jobUrlId,
      sourceUrl,
      JSON.stringify(scrapedData),
      scrapedData.name,
      scrapedData.title,
      scrapedData.company,
      scrapedData.location,
      scrapedData.email,
      scrapedData.linkedin_url
    ]);
    
    return resultId;
  } catch (error) {
    console.error('❌ Error saving scraped data:', error);
    throw error;
  }
};

/**
 * Pause a job
 */
const pauseJob = (jobId) => {
  pausedJobs.add(jobId);
  console.log(`⏸️ Job paused: ${jobId}`);
};

/**
 * Resume a job
 */
const resumeJob = (jobId) => {
  pausedJobs.delete(jobId);
  console.log(`▶️ Job resumed: ${jobId}`);
};

/**
 * Cancel a job
 */
const cancelJob = (jobId) => {
  cancelledJobs.add(jobId);
  pausedJobs.delete(jobId);
  
  // Remove from queue if not yet started
  const queueIndex = jobQueue.findIndex(job => job.id === jobId);
  if (queueIndex !== -1) {
    jobQueue.splice(queueIndex, 1);
  }
  
  console.log(`❌ Job cancelled: ${jobId}`);
};

/**
 * Get queue status
 */
const getQueueStatus = () => {
  return {
    queue_length: jobQueue.length,
    processing_jobs: processingJobs.size,
    paused_jobs: pausedJobs.size,
    max_concurrent: MAX_CONCURRENT_JOBS,
    queue: jobQueue.map(job => ({
      id: job.id,
      added_at: job.addedAt,
      waiting_time: Date.now() - job.addedAt.getTime()
    })),
    processing: Array.from(processingJobs.entries()).map(([jobId, info]) => ({
      id: jobId,
      started_at: info.startedAt,
      processing_time: Date.now() - info.startedAt.getTime()
    }))
  };
};

/**
 * Load pending jobs from database into queue
 */
const loadPendingJobs = async () => {
  try {
    console.log('🔍 Checking for pending jobs in database...');
    
    const pendingJobsSql = `
      SELECT id FROM jobs 
      WHERE status = 'pending' 
      ORDER BY created_at ASC 
      LIMIT 10
    `;
    
    const pendingJobs = await query(pendingJobsSql);
    
    if (pendingJobs.length > 0) {
      console.log(`📋 Found ${pendingJobs.length} pending jobs`);
      
      for (const job of pendingJobs) {
        // Check if job is not already in queue
        if (!jobQueue.find(queuedJob => queuedJob.id === job.id)) {
          console.log(`➕ Adding pending job to queue: ${job.id}`);
          await addJobToQueue(job.id);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error loading pending jobs:', error);
  }
};

/**
 * Initialize job worker
 */
const initializeJobWorker = () => {
  console.log('🚀 Job worker initialized');
  console.log(`📊 Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);
  console.log(`⏱️ URL processing delay: ${URL_PROCESSING_DELAY}ms`);
  
  // Load pending jobs immediately on startup
  loadPendingJobs();
  
  // Check for pending jobs every 10 seconds
  setInterval(() => {
    loadPendingJobs();
  }, 10000);
  
  // Start processing jobs every 5 seconds
  setInterval(() => {
    if (jobQueue.length > 0 && processingJobs.size < MAX_CONCURRENT_JOBS) {
      processNextJob();
    }
  }, 5000);
  
  // Log queue status every 30 seconds
  setInterval(() => {
    const status = getQueueStatus();
    if (status.queue_length > 0 || status.processing_jobs > 0) {
      console.log('📊 Queue Status:', {
        queue: status.queue_length,
        processing: status.processing_jobs,
        paused: status.paused_jobs
      });
    }
  }, 30000);
};

/**
 * Restart failed jobs (can be called periodically)
 */
const restartFailedJobs = async () => {
  try {
    console.log('🔄 Checking for failed jobs to restart...');
    
    const failedJobsSql = `
      SELECT id FROM jobs 
      WHERE status = 'failed' 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        AND (error_message IS NULL OR error_message NOT LIKE '%cancelled%')
      LIMIT 5
    `;
    
    const failedJobs = await query(failedJobsSql);
    
    for (const job of failedJobs) {
      console.log(`🔄 Restarting failed job: ${job.id}`);
      
      // Reset job status
      await query(
        'UPDATE jobs SET status = "pending", error_message = NULL WHERE id = ?',
        [job.id]
      );
      
      // Add back to queue
      addJobToQueue(job.id);
    }
    
    if (failedJobs.length > 0) {
      console.log(`✅ Restarted ${failedJobs.length} failed jobs`);
    }
    
  } catch (error) {
    console.error('❌ Error restarting failed jobs:', error);
  }
};

module.exports = {
  addJobToQueue,
  pauseJob,
  resumeJob,
  cancelJob,
  getQueueStatus,
  initializeJobWorker,
  restartFailedJobs,
  loadPendingJobs
};