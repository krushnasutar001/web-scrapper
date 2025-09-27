const Job = require('../models/Job');
const LinkedInAccount = require('../models/LinkedInAccount');
const { query, transaction } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const LinkedInScraper = require('./linkedin-scraper');
const ScrapingService = require('./scrapingService');
const accountRotationService = require('./accountRotationService');
const { decryptCookies } = require('./cookieEncryption');
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
 * Process a single job with enhanced account rotation and cookie injection
 */
const processJob = async (jobId) => {
  let currentAccount = null;
  
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
    
    let processedCount = 0;
    let successfulCount = 0;
    let failedCount = 0;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 5;
    
    // Process each URL with intelligent account rotation
    for (const urlData of jobUrls) {
      try {
        // Check if job was paused or cancelled
        if (pausedJobs.has(jobId)) {
          console.log(`⏸️ Job paused: ${jobId}`);
          await job.updateStatus('paused');
          return;
        }
        
        if (cancelledJobs.has(jobId)) {
          console.log(`❌ Job cancelled: ${jobId}`);
          await job.updateStatus('cancelled');
          return;
        }
        
        // Get next available account using rotation service
        try {
          currentAccount = await accountRotationService.getNextAvailableAccount(
            job.user_id, 
            job.job_type, 
            'balanced'
          );
          console.log(`🔄 Using account: ${currentAccount.email} for URL: ${urlData.url}`);
        } catch (accountError) {
          console.error(`❌ No available accounts: ${accountError.message}`);
          
          // If no accounts available, wait and retry
          if (accountError.message.includes('Next available in')) {
            console.log(`⏳ Waiting for accounts to become available...`);
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
            continue; // Retry with same URL
          } else {
            throw accountError;
          }
        }
        
        // Decrypt and prepare cookies for scraping
        let scrapingCookies = [];
        try {
          const encryptedCookies = JSON.parse(currentAccount.cookies_json || '[]');
          scrapingCookies = decryptCookies(encryptedCookies);
          console.log(`🍪 Decrypted ${scrapingCookies.length} cookies for account ${currentAccount.email}`);
        } catch (cookieError) {
          console.error(`❌ Cookie decryption failed for account ${currentAccount.email}:`, cookieError);
          await accountRotationService.markAccountFailed(currentAccount.id, 'authentication');
          continue; // Try next URL with different account
        }
        
        // Perform scraping with retry logic
        let scrapingResult = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries && !scrapingResult) {
          try {
            console.log(`🔍 Scraping attempt ${retryCount + 1}/${maxRetries} for URL: ${urlData.url}`);
            
            // Create scraper instance with cookies
            const scraper = new LinkedInScraper({
              cookies: scrapingCookies,
              userAgent: currentAccount.user_agent,
              accountId: currentAccount.id
            });
            
            // Perform scraping based on job type
            if (job.job_type === 'profile') {
              scrapingResult = await scraper.scrapeProfile(urlData.url);
            } else if (job.job_type === 'company') {
              scrapingResult = await scraper.scrapeCompany(urlData.url);
            } else {
              throw new Error(`Unsupported job type: ${job.job_type}`);
            }
            
            // Mark account as successful
            await accountRotationService.markAccountSuccess(currentAccount.id);
            consecutiveFailures = 0;
            
            console.log(`✅ Successfully scraped: ${urlData.url}`);
            break;
            
          } catch (scrapingError) {
            retryCount++;
            console.error(`❌ Scraping attempt ${retryCount} failed:`, scrapingError.message);
            
            // Determine error type for account management
            let errorType = 'unknown';
            if (scrapingError.message.includes('rate limit') || scrapingError.message.includes('429')) {
              errorType = 'rate_limit';
            } else if (scrapingError.message.includes('authentication') || scrapingError.message.includes('401')) {
              errorType = 'authentication';
            } else if (scrapingError.message.includes('blocked') || scrapingError.message.includes('403')) {
              errorType = 'blocked';
            }
            
            // Mark account as failed if it's an account-related error
            if (['rate_limit', 'authentication', 'blocked'].includes(errorType)) {
              await accountRotationService.markAccountFailed(currentAccount.id, errorType);
              
              // Try to get a different account for retry
              if (retryCount < maxRetries) {
                try {
                  currentAccount = await accountRotationService.getNextAvailableAccount(
                    job.user_id, 
                    job.job_type, 
                    'balanced'
                  );
                  
                  // Update cookies for new account
                  const encryptedCookies = JSON.parse(currentAccount.cookies_json || '[]');
                  scrapingCookies = decryptCookies(encryptedCookies);
                  
                } catch (newAccountError) {
                  console.error(`❌ Could not get new account for retry: ${newAccountError.message}`);
                  break; // Exit retry loop
                }
              }
            }
            
            // Wait before retry
            if (retryCount < maxRetries) {
              const waitTime = Math.min(5000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
        
        // Save results or mark as failed
        if (scrapingResult) {
          try {
            await saveScrapedData(scrapingResult, urlData.url, jobId, job);
            successfulCount++;
            
            // Update URL status
            await query(
              'UPDATE job_urls SET status = "completed", completed_at = NOW() WHERE id = ?',
              [urlData.id]
            );
            
          } catch (saveError) {
            console.error(`❌ Error saving scraped data:`, saveError);
            failedCount++;
            
            await query(
              'UPDATE job_urls SET status = "failed", error_message = ? WHERE id = ?',
              [saveError.message, urlData.id]
            );
          }
        } else {
          failedCount++;
          consecutiveFailures++;
          
          await query(
            'UPDATE job_urls SET status = "failed", error_message = ? WHERE id = ?',
            ['Failed after maximum retries', urlData.id]
          );
          
          // If too many consecutive failures, pause job
          if (consecutiveFailures >= maxConsecutiveFailures) {
            console.error(`❌ Too many consecutive failures (${consecutiveFailures}), pausing job: ${jobId}`);
            await job.updateStatus('paused', { 
              error_message: `Paused due to ${consecutiveFailures} consecutive failures` 
            });
            return;
          }
        }
        
        processedCount++;
        
        // Update job progress
        await job.updateProgress(processedCount, successfulCount, failedCount);
        
        // Add delay between URLs to avoid overwhelming LinkedIn
        const delayTime = calculateDelay(successfulCount, failedCount);
        if (delayTime > 0) {
          console.log(`⏳ Waiting ${delayTime}ms before next URL...`);
          await new Promise(resolve => setTimeout(resolve, delayTime));
        }
        
      } catch (urlError) {
        console.error(`❌ Error processing URL ${urlData.url}:`, urlError);
        failedCount++;
        processedCount++;
        
        await query(
          'UPDATE job_urls SET status = "failed", error_message = ? WHERE id = ?',
          [urlError.message, urlData.id]
        );
      }
    }
    
    // Complete job
    const finalStatus = failedCount === 0 ? 'completed' : 
                       successfulCount > 0 ? 'completed_with_errors' : 'failed';
    
    await job.updateStatus(finalStatus, { 
      completed_at: new Date()
    });
    
    console.log(`✅ Job completed: ${jobId} - ${successfulCount}/${processedCount} successful`);
    
  } catch (error) {
    console.error(`❌ Job processing failed: ${jobId}`, error);
    
    // Mark current account as failed if error is account-related
    if (currentAccount && error.message.includes('account')) {
      await accountRotationService.markAccountFailed(currentAccount.id, 'unknown');
    }
    
    // Update job status to failed
    const job = await Job.findById(jobId);
    if (job) {
      await job.updateStatus('failed', { 
        error_message: error.message,
        failed_at: new Date()
      });
    }
    
    throw error;
  }
};
/**
 * Calculate dynamic delay between requests based on success/failure rate
 */
const calculateDelay = (successfulCount, failedCount) => {
  const totalRequests = successfulCount + failedCount;
  if (totalRequests === 0) return URL_PROCESSING_DELAY;
  
  const failureRate = failedCount / totalRequests;
  
  // Increase delay if failure rate is high
  if (failureRate > 0.5) {
    return URL_PROCESSING_DELAY * 3; // 6 seconds
  } else if (failureRate > 0.3) {
    return URL_PROCESSING_DELAY * 2; // 4 seconds
  } else if (failureRate > 0.1) {
    return URL_PROCESSING_DELAY * 1.5; // 3 seconds
  }
  
  return URL_PROCESSING_DELAY; // 2 seconds
};

/**
 * Save scraped data to database
 */
const saveScrapedData = async (scrapingResult, sourceUrl, jobId, job) => {
  try {
    // Use database validation service for safe insert
    const DatabaseValidationService = require('./database-validation');
    
    try {
      // Prepare job data for potential creation
      const jobData = {
        user_id: job.user_id || 'system',
        job_name: job.job_name || `Auto-created job for ${jobId}`,
        job_type: job.job_type || 'profile_scraping'
      };
      
      // Use safe insert method that handles validation
      const resultId = await DatabaseValidationService.safeInsertProfileResult(
        {
          url: scrapingResult.linkedin_url || sourceUrl,
          full_name: scrapingResult.full_name || scrapingResult.name,
          first_name: scrapingResult.first_name,
          last_name: scrapingResult.last_name,
          headline: scrapingResult.headline || scrapingResult.title || scrapingResult.current_job_title,
          about: scrapingResult.about || scrapingResult.description,
          country: scrapingResult.country,
          city: scrapingResult.city || scrapingResult.location,
          industry: scrapingResult.industry,
          email: scrapingResult.email,
          phone: scrapingResult.phone,
          website: scrapingResult.website,
          current_job_title: scrapingResult.current_job_title || scrapingResult.title,
          current_company_url: scrapingResult.current_company_url,
          current_company: scrapingResult.current_company || scrapingResult.company,
          skills: scrapingResult.skills || [],
          education: scrapingResult.education || [],
          experience: scrapingResult.experience || [],
          content_validation: scrapingResult.validation_status || 'unknown'
        },
        jobId,
        jobData
      );
      
      console.log(`✅ Successfully saved scraped data for job ${jobId}, result ID: ${resultId}`);
      return resultId;
    } catch (validationError) {
      console.error('Database validation failed, falling back to original method:', validationError);
      
      // Fallback to original method if validation service fails
      const jobCheckSql = 'SELECT id FROM scraping_jobs WHERE id = ?';
      const jobExists = await query(jobCheckSql, [jobId]);
      
      if (!jobExists || jobExists.length === 0) {
        console.error(`❌ Job ID ${jobId} does not exist in scraping_jobs table`);
        throw new Error(`Foreign key constraint: job_id ${jobId} does not exist in scraping_jobs table`);
      }
      
      const resultId = uuidv4();
      
      const sql = `
        INSERT INTO profile_results (
          id, job_id, profile_url, full_name, first_name, last_name,
          headline, about, country, city, industry, email, phone, website,
          current_job_title, current_company_url, company_name,
          skills, education, experience, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW(), NOW())
      `;
      
      // Map scraped data fields to database fields and handle undefined values
      const fullName = scrapingResult.full_name || scrapingResult.name || null;
      const firstName = scrapingResult.first_name || null;
      const lastName = scrapingResult.last_name || null;
      const headline = scrapingResult.headline || scrapingResult.title || scrapingResult.current_job_title || null;
      const about = scrapingResult.about || scrapingResult.description || null;
      const country = scrapingResult.country || null;
      const city = scrapingResult.city || scrapingResult.location || null;
      const industry = scrapingResult.industry || null;
      const email = scrapingResult.email || null;
      const phone = scrapingResult.phone || null;
      const website = scrapingResult.website || null;
      const currentJobTitle = scrapingResult.current_job_title || scrapingResult.title || null;
      const companyUrl = scrapingResult.current_company_url || null;
      const companyName = scrapingResult.current_company || scrapingResult.company || null;
      const skills = JSON.stringify(scrapingResult.skills || []);
      const education = JSON.stringify(scrapingResult.education || []);
      const experience = JSON.stringify(scrapingResult.experience || []);
      const profileUrl = scrapingResult.linkedin_url || sourceUrl || null;
      
      await query(sql, [
        resultId,
        jobId,
        profileUrl,
        fullName,
        firstName,
        lastName,
        headline,
        about,
        country,
        city,
        industry,
        email,
        phone,
        website,
        currentJobTitle,
        companyUrl,
        companyName,
        skills,
        education,
        experience
      ]);
      
      console.log(`✅ Successfully saved scraped data for job ${jobId}, result ID: ${resultId}`);
      return resultId;
    }
  } catch (error) {
    console.error('❌ Error saving scraped data:', error);
    
    // Handle specific MySQL errors
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      console.error(`❌ Foreign key constraint failed: job_id ${jobId} does not exist in scraping_jobs table`);
    } else if (error.code === 'ER_DUP_ENTRY') {
      console.error(`❌ Duplicate entry error: ${error.message}`);
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
    
    // Load account cookies from database
    try {
      const cookies = account.getCookies();
      if (cookies && Array.isArray(cookies) && cookies.length > 0) {
        await scraper.loadCookies(cookies);
        console.log(`🍪 Loaded ${cookies.length} cookies for account: ${account.account_name || account.email || account.id}`);
      } else {
        console.log(`⚠️ No valid cookies found for account: ${account.account_name || account.email || account.id}`);
        console.log(`⚠️ Account will proceed without cookies - this may result in limited access or login prompts`);
        
        // You can choose to either:
        // 1. Continue without cookies (current behavior)
        // 2. Skip this account and try another one
        // 3. Throw an error to stop processing
        
        // For now, we'll continue but log a warning
        console.log(`⚠️ Continuing scraping without cookies for account: ${account.account_name || account.email || account.id}`);
      }
    } catch (error) {
      console.log(`⚠️ Error loading cookies for account: ${account.account_name || account.email || account.id}`, error.message);
      console.log(`⚠️ Continuing scraping without cookies due to error`);
    }
    
    // Perform scraping based on job type
    let scrapedData;
    
    if (jobType === 'profile_scraping') {
      scrapedData = await scraper.scrapeProfile(url, account);
    } else if (jobType === 'company_scraping') {
      scrapedData = await scraper.scrapeCompany(url, account);
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
          scraped_by_account: account.account_name || account.email || account.id
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