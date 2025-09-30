const { Worker } = require('bullmq');
const { chromium } = require('playwright');
const Redis = require('ioredis');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');

/**
 * Database connection pool
 */
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

/**
 * Redis connection for BullMQ
 */
const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  family: 4,
});

/**
 * Worker configuration
 */
const WORKER_CONFIG = {
  concurrency: parseInt(config.WORKER_CONCURRENCY) || 2,
  stalledInterval: 30 * 1000,    // 30 seconds
  maxStalledCount: 1,            // Max times a job can be stalled
  retryProcessDelay: 5000,       // 5 seconds delay between retries
};

/**
 * Browser launch options
 */
const getBrowserOptions = (userId, linkedinAccountId) => {
  const userDataDir = path.join(config.PROFILES_BASE, userId.toString(), linkedinAccountId.toString());
  
  return {
    headless: config.CHROME_HEADLESS !== 'false',
    args: [
      `--user-data-dir=${userDataDir}`,
      `--load-extension=${config.SCRAPER_EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    timeout: 30000
  };
};

/**
 * Update job status in database
 */
const updateJobStatus = async (jobId, status, data = {}) => {
  const client = await pool.connect();
  
  try {
    const updateQuery = `
      UPDATE jobs 
      SET status = $1, 
          updated_at = CURRENT_TIMESTAMP,
          started_at = CASE WHEN $1 = 'running' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
          completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END,
          error_message = $3,
          results_count = COALESCE($4, results_count),
          progress = COALESCE($5, progress)
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await client.query(updateQuery, [
      status,
      jobId,
      data.error_message || null,
      data.results_count || null,
      data.progress || null
    ]);
    
    if (result.rows.length === 0) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    console.log(`📊 Job ${jobId} status updated to: ${status}`);
    
    return result.rows[0];
    
  } catch (error) {
    console.error(`❌ Failed to update job ${jobId} status:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get LinkedIn account for job
 */
const getLinkedInAccount = async (userId) => {
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT * FROM linkedin_accounts 
      WHERE user_id = $1 AND status = 'active' 
      ORDER BY last_used_at ASC NULLS FIRST
      LIMIT 1
    `;
    
    const result = await client.query(query, [userId]);
    
    if (result.rows.length === 0) {
      throw new Error(`No active LinkedIn account found for user ${userId}`);
    }
    
    // Update last_used_at
    const updateQuery = `
      UPDATE linkedin_accounts 
      SET last_used_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    
    await client.query(updateQuery, [result.rows[0].id]);
    
    return result.rows[0];
    
  } catch (error) {
    console.error(`❌ Failed to get LinkedIn account for user ${userId}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get job URLs to process
 */
const getJobUrls = async (jobId) => {
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT * FROM job_urls 
      WHERE job_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
    `;
    
    const result = await client.query(query, [jobId]);
    return result.rows;
    
  } catch (error) {
    console.error(`❌ Failed to get job URLs for ${jobId}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Update URL status
 */
const updateUrlStatus = async (urlId, status, data = {}) => {
  const client = await pool.connect();
  
  try {
    const updateQuery = `
      UPDATE job_urls 
      SET status = $1, 
          updated_at = CURRENT_TIMESTAMP,
          error_message = $3,
          scraped_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE scraped_at END
      WHERE id = $2
    `;
    
    await client.query(updateQuery, [
      status,
      urlId,
      data.error_message || null
    ]);
    
  } catch (error) {
    console.error(`❌ Failed to update URL ${urlId} status:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Save job result
 */
const saveJobResult = async (jobId, urlId, resultData) => {
  const client = await pool.connect();
  
  try {
    const insertQuery = `
      INSERT INTO job_results (
        id, job_id, url_id, profile_data, scraped_at, created_at
      ) VALUES (
        $1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;
    
    const resultId = require('crypto').randomUUID();
    
    await client.query(insertQuery, [
      resultId,
      jobId,
      urlId,
      JSON.stringify(resultData)
    ]);
    
    console.log(`💾 Result saved for job ${jobId}, URL ${urlId}`);
    
    return resultId;
    
  } catch (error) {
    console.error(`❌ Failed to save result for job ${jobId}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Scrape LinkedIn profile
 */
const scrapeProfile = async (page, url, jobType) => {
  try {
    console.log(`🔍 Scraping ${jobType}: ${url}`);
    
    // Navigate to URL
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Check if we're logged in
    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('.authwall') && 
             !document.querySelector('[data-test-id="sign-in-form"]') &&
             !document.querySelector('.join-form');
    });
    
    if (!isLoggedIn) {
      throw new Error('Not logged in to LinkedIn');
    }
    
    let scrapedData = {};
    
    if (jobType === 'profile_scraping') {
      scrapedData = await scrapeProfileData(page);
    } else if (jobType === 'company_scraping') {
      scrapedData = await scrapeCompanyData(page);
    } else if (jobType === 'search_result_scraping') {
      scrapedData = await scrapeSearchResults(page);
    }
    
    return {
      success: true,
      url,
      data: scrapedData,
      scrapedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ Scraping failed for ${url}:`, error);
    
    return {
      success: false,
      url,
      error: error.message,
      scrapedAt: new Date().toISOString()
    };
  }
};

/**
 * Scrape profile data
 */
const scrapeProfileData = async (page) => {
  return await page.evaluate(() => {
    const data = {};
    
    // Basic profile info
    data.name = document.querySelector('.text-heading-xlarge')?.textContent?.trim() || '';
    data.headline = document.querySelector('.text-body-medium.break-words')?.textContent?.trim() || '';
    data.location = document.querySelector('.text-body-small.inline.t-black--light.break-words')?.textContent?.trim() || '';
    
    // Profile image
    const profileImg = document.querySelector('.pv-top-card-profile-picture__image');
    data.profileImage = profileImg?.src || '';
    
    // About section
    const aboutSection = document.querySelector('#about');
    if (aboutSection) {
      const aboutText = aboutSection.closest('.pv-profile-section')?.querySelector('.pv-shared-text-with-see-more .inline-show-more-text')?.textContent?.trim();
      data.about = aboutText || '';
    }
    
    // Experience
    data.experience = [];
    const experienceItems = document.querySelectorAll('.pv-profile-section.experience-section .pv-entity__summary-info');
    experienceItems.forEach(item => {
      const title = item.querySelector('.pv-entity__summary-info-v2 h3')?.textContent?.trim() || '';
      const company = item.querySelector('.pv-entity__secondary-title')?.textContent?.trim() || '';
      const duration = item.querySelector('.pv-entity__bullet-item-v2')?.textContent?.trim() || '';
      
      if (title || company) {
        data.experience.push({ title, company, duration });
      }
    });
    
    // Education
    data.education = [];
    const educationItems = document.querySelectorAll('.pv-profile-section.education-section .pv-entity__summary-info');
    educationItems.forEach(item => {
      const school = item.querySelector('h3 .pv-entity__school-name')?.textContent?.trim() || '';
      const degree = item.querySelector('.pv-entity__degree-name .pv-entity__comma-item')?.textContent?.trim() || '';
      const field = item.querySelector('.pv-entity__fos .pv-entity__comma-item')?.textContent?.trim() || '';
      
      if (school || degree) {
        data.education.push({ school, degree, field });
      }
    });
    
    // Skills
    data.skills = [];
    const skillItems = document.querySelectorAll('.pv-skill-category-entity__name-text');
    skillItems.forEach(skill => {
      const skillName = skill.textContent?.trim();
      if (skillName) {
        data.skills.push(skillName);
      }
    });
    
    return data;
  });
};

/**
 * Scrape company data
 */
const scrapeCompanyData = async (page) => {
  return await page.evaluate(() => {
    const data = {};
    
    // Company basic info
    data.name = document.querySelector('.org-top-card-summary__title')?.textContent?.trim() || '';
    data.industry = document.querySelector('.org-top-card-summary__industry')?.textContent?.trim() || '';
    data.size = document.querySelector('.org-top-card-summary__employee-count')?.textContent?.trim() || '';
    data.location = document.querySelector('.org-top-card-summary__headquarter')?.textContent?.trim() || '';
    
    // Company logo
    const logo = document.querySelector('.org-top-card-primary-content__logo');
    data.logo = logo?.src || '';
    
    // About section
    const aboutText = document.querySelector('.org-about-us-organization-description__text')?.textContent?.trim();
    data.about = aboutText || '';
    
    // Website
    const websiteLink = document.querySelector('.org-about-company-module__company-details a[href*="http"]');
    data.website = websiteLink?.href || '';
    
    return data;
  });
};

/**
 * Scrape search results
 */
const scrapeSearchResults = async (page) => {
  return await page.evaluate(() => {
    const results = [];
    
    const searchItems = document.querySelectorAll('.search-result__wrapper');
    
    searchItems.forEach(item => {
      const nameElement = item.querySelector('.search-result__result-link');
      const name = nameElement?.textContent?.trim() || '';
      const profileUrl = nameElement?.href || '';
      
      const headline = item.querySelector('.subline-level-1')?.textContent?.trim() || '';
      const location = item.querySelector('.subline-level-2')?.textContent?.trim() || '';
      
      if (name && profileUrl) {
        results.push({
          name,
          profileUrl,
          headline,
          location
        });
      }
    });
    
    return { results, totalFound: results.length };
  });
};

/**
 * Process a single job
 */
const processJob = async (job) => {
  const { jobId, userId, jobType } = job.data;
  let browser = null;
  let linkedinAccount = null;
  
  try {
    console.log(`🚀 Processing job ${jobId} (type: ${jobType}) for user ${userId}`);
    
    // Update job status to running
    await updateJobStatus(jobId, 'running');
    
    // Get LinkedIn account
    linkedinAccount = await getLinkedInAccount(userId);
    console.log(`👤 Using LinkedIn account: ${linkedinAccount.email}`);
    
    // Get job URLs
    const urls = await getJobUrls(jobId);
    console.log(`📋 Found ${urls.length} URLs to process`);
    
    if (urls.length === 0) {
      await updateJobStatus(jobId, 'completed', { 
        results_count: 0,
        progress: 100 
      });
      return { success: true, message: 'No URLs to process' };
    }
    
    // Launch browser
    const browserOptions = getBrowserOptions(userId, linkedinAccount.id);
    browser = await chromium.launch(browserOptions);
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    console.log(`🌐 Browser launched for user ${userId}`);
    
    // Process URLs
    let processedCount = 0;
    let successCount = 0;
    
    for (const urlRecord of urls) {
      try {
        // Update URL status to processing
        await updateUrlStatus(urlRecord.id, 'processing');
        
        // Scrape the URL
        const result = await scrapeProfile(page, urlRecord.url, jobType);
        
        if (result.success) {
          // Save result
          await saveJobResult(jobId, urlRecord.id, result.data);
          await updateUrlStatus(urlRecord.id, 'completed');
          successCount++;
        } else {
          await updateUrlStatus(urlRecord.id, 'failed', { 
            error_message: result.error 
          });
        }
        
        processedCount++;
        
        // Update job progress
        const progress = Math.round((processedCount / urls.length) * 100);
        await updateJobStatus(jobId, 'running', { 
          progress,
          results_count: successCount 
        });
        
        // Update job progress in BullMQ
        job.updateProgress(progress);
        
        // Small delay between requests
        await page.waitForTimeout(2000);
        
      } catch (urlError) {
        console.error(`❌ Error processing URL ${urlRecord.url}:`, urlError);
        
        await updateUrlStatus(urlRecord.id, 'failed', { 
          error_message: urlError.message 
        });
        
        processedCount++;
      }
    }
    
    // Update final job status
    await updateJobStatus(jobId, 'completed', { 
      results_count: successCount,
      progress: 100 
    });
    
    console.log(`✅ Job ${jobId} completed: ${successCount}/${urls.length} URLs processed successfully`);
    
    return {
      success: true,
      message: `Job completed successfully`,
      stats: {
        totalUrls: urls.length,
        processedUrls: processedCount,
        successfulUrls: successCount,
        failedUrls: processedCount - successCount
      }
    };
    
  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error);
    
    // Update job status to failed
    await updateJobStatus(jobId, 'failed', { 
      error_message: error.message 
    });
    
    throw error;
    
  } finally {
    // Always close browser
    if (browser) {
      try {
        await browser.close();
        console.log(`🔒 Browser closed for job ${jobId}`);
      } catch (closeError) {
        console.error(`❌ Error closing browser for job ${jobId}:`, closeError);
      }
    }
  }
};

/**
 * Create and start the worker
 */
const createWorker = () => {
  const worker = new Worker(
    'scraping-jobs',
    processJob,
    {
      connection: redisConnection,
      concurrency: WORKER_CONFIG.concurrency,
      stalledInterval: WORKER_CONFIG.stalledInterval,
      maxStalledCount: WORKER_CONFIG.maxStalledCount,
      retryProcessDelay: WORKER_CONFIG.retryProcessDelay,
    }
  );
  
  // Event listeners
  worker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed:`, result);
  });
  
  worker.on('failed', (job, error) => {
    console.error(`❌ Job ${job.id} failed:`, error);
  });
  
  worker.on('error', (error) => {
    console.error('❌ Worker error:', error);
  });
  
  worker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
  });
  
  return worker;
};

/**
 * Initialize worker
 */
const initializeWorker = async () => {
  try {
    console.log('🚀 Initializing scraping worker...');
    
    // Test database connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connection established');
    
    // Test Redis connection
    await redisConnection.ping();
    console.log('✅ Redis connection established');
    
    // Ensure profiles directory exists
    await fs.mkdir(config.PROFILES_BASE, { recursive: true });
    console.log('✅ Profiles directory ready');
    
    // Create worker
    const worker = createWorker();
    
    console.log(`✅ Scraping worker initialized with concurrency: ${WORKER_CONFIG.concurrency}`);
    
    return worker;
    
  } catch (error) {
    console.error('❌ Failed to initialize worker:', error);
    throw error;
  }
};

/**
 * Gracefully shutdown worker
 */
const shutdownWorker = async (worker) => {
  try {
    console.log('🔄 Shutting down worker...');
    
    if (worker) {
      await worker.close();
    }
    
    await pool.end();
    await redisConnection.quit();
    
    console.log('✅ Worker shutdown complete');
    
  } catch (error) {
    console.error('❌ Error during worker shutdown:', error);
    throw error;
  }
};

// Start worker if this file is run directly
if (require.main === module) {
  let worker;
  
  const startWorker = async () => {
    try {
      worker = await initializeWorker();
      console.log('🎯 Scraping worker is running and waiting for jobs...');
    } catch (error) {
      console.error('❌ Failed to start worker:', error);
      process.exit(1);
    }
  };
  
  // Handle graceful shutdown
  const handleShutdown = async (signal) => {
    console.log(`📡 ${signal} received, shutting down worker...`);
    
    try {
      await shutdownWorker(worker);
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  
  // Start the worker
  startWorker();
}

module.exports = {
  processJob,
  createWorker,
  initializeWorker,
  shutdownWorker,
  updateJobStatus,
  getLinkedInAccount,
  WORKER_CONFIG
};