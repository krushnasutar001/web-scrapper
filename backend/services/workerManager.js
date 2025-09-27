const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const JobQueueService = require('./jobQueueService');
const ErrorHandlingService = require('./errorHandlingService');
const { logActivity, logError, logScrapingEvent } = require('./loggingService');

class WorkerManager {
  constructor() {
    this.workers = new Map(); // workerId -> worker instance
    this.chromeProfiles = new Map(); // accountId -> profile path
    this.activeJobs = new Map(); // jobId -> worker info
    this.maxConcurrentWorkers = 5;
    this.isProcessing = false;
    this.processingInterval = null;
    
    // Chrome extension paths
    this.extensionPath = path.join(__dirname, '../../extension');
    this.profilesBasePath = path.join(__dirname, '../../chrome-profiles');
    
    this.errorHandler = new ErrorHandlingService();
  }
  
  /**
   * Initialize worker manager and set up Chrome profiles
   */
  async initialize() {
    console.log('🚀 Initializing Worker Manager...');
    
    try {
      // Ensure profiles directory exists
      await this.ensureProfilesDirectory();
      
      // Set up Chrome profiles for each LinkedIn account
      await this.setupChromeProfiles();
      
      console.log('✅ Worker Manager initialized successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize Worker Manager:', error);
      throw error;
    }
  }
  
  /**
   * Ensure Chrome profiles directory exists
   */
  async ensureProfilesDirectory() {
    try {
      await fs.access(this.profilesBasePath);
    } catch {
      await fs.mkdir(this.profilesBasePath, { recursive: true });
      console.log(`📁 Created profiles directory: ${this.profilesBasePath}`);
    }
  }
  
  /**
   * Set up Chrome profiles for each LinkedIn account
   */
  async setupChromeProfiles() {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      // Get all active LinkedIn accounts
      const [accounts] = await connection.execute(`
        SELECT la.*, u.email as user_email, u.name as user_name
        FROM linkedin_accounts la
        JOIN users u ON la.user_id = u.id
        WHERE la.is_active = 1 AND la.validation_status = 'ACTIVE'
      `);
      
      console.log(`📋 Setting up Chrome profiles for ${accounts.length} LinkedIn accounts...`);
      
      for (const account of accounts) {
        const profilePath = path.join(this.profilesBasePath, `profile_${account.id}`);
        
        // Create profile directory if it doesn't exist
        try {
          await fs.access(profilePath);
        } catch {
          await fs.mkdir(profilePath, { recursive: true });
          console.log(`📁 Created profile directory for account ${account.email}: ${profilePath}`);
        }
        
        // Store profile path mapping
        this.chromeProfiles.set(account.id, profilePath);
        
        // Update database with profile path
        await connection.execute(
          'UPDATE linkedin_accounts SET chrome_profile_path = ? WHERE id = ?',
          [profilePath, account.id]
        );
        
        // Set up extension JWT for this account
        await this.setupExtensionJWT(account, profilePath);
      }
      
      console.log('✅ Chrome profiles setup completed');
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Set up extension JWT for a specific account
   */
  async setupExtensionJWT(account, profilePath) {
    try {
      // Generate JWT for this account (simplified - in production use proper JWT library)
      const jwt = Buffer.from(JSON.stringify({
        userId: account.user_id,
        accountId: account.id,
        email: account.email,
        timestamp: Date.now()
      })).toString('base64');
      
      // Create extension config file in profile directory
      const configPath = path.join(profilePath, 'extension-config.json');
      const config = {
        jwt: jwt,
        userId: account.user_id,
        accountId: account.id,
        email: account.email,
        apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3000/api',
        websocketEndpoint: process.env.WS_ENDPOINT || 'ws://localhost:3000'
      };
      
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      // Update database with JWT
      const mysql = require('mysql2/promise');
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'linkedin_automation',
        port: process.env.DB_PORT || 3306
      });
      
      await connection.execute(
        'UPDATE linkedin_accounts SET extension_jwt = ? WHERE id = ?',
        [jwt, account.id]
      );
      
      await connection.end();
      
      console.log(`🔑 JWT configured for account ${account.email}`);
      
    } catch (error) {
      console.error(`❌ Failed to setup JWT for account ${account.email}:`, error);
      throw error;
    }
  }
  
  /**
   * Start processing job queue
   */
  async startProcessing() {
    if (this.isProcessing) {
      console.log('⚠️ Worker Manager is already processing');
      return;
    }
    
    this.isProcessing = true;
    console.log('🔄 Starting job queue processing...');
    
    // Process queue immediately
    await this.processQueue();
    
    // Set up interval for continuous processing
    this.processingInterval = setInterval(async () => {
      await this.processQueue();
    }, 5000); // Check every 5 seconds
    
    console.log('✅ Job queue processing started');
  }
  
  /**
   * Stop processing job queue
   */
  async stopProcessing() {
    if (!this.isProcessing) {
      return;
    }
    
    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    // Stop all active workers
    for (const [workerId, worker] of this.workers) {
      await this.stopWorker(workerId);
    }
    
    console.log('🛑 Job queue processing stopped');
  }
  
  /**
   * Process job queue and assign workers
   */
  async processQueue() {
    try {
      // Check if we have capacity for more workers
      if (this.workers.size >= this.maxConcurrentWorkers) {
        return;
      }
      
      // Get available jobs from queue
      const availableSlots = this.maxConcurrentWorkers - this.workers.size;
      
      for (let i = 0; i < availableSlots; i++) {
        const workerId = `worker_${Date.now()}_${i}`;
        const job = await JobQueueService.getNextJobFromQueue(workerId);
        
        if (!job) {
          break; // No more jobs available
        }
        
        // Start worker for this job
        await this.startWorker(workerId, job);
      }
      
    } catch (error) {
      console.error('❌ Error processing queue:', error);
      await logError({
        jobId: null,
        linkedinAccountId: null,
        errorType: 'QUEUE_PROCESSING_ERROR',
        errorMessage: error.message,
        errorDetails: { stack: error.stack }
      });
    }
  }
  
  /**
   * Start a worker for a specific job
   */
  async startWorker(workerId, job) {
    try {
      console.log(`🚀 Starting worker ${workerId} for job ${job.job_id}`);
      
      const profilePath = this.chromeProfiles.get(job.linkedin_account_id);
      if (!profilePath) {
        throw new Error(`No Chrome profile found for account ${job.linkedin_account_id}`);
      }
      
      // Launch Chrome with extension
      const browser = await this.launchChromeWithExtension(profilePath);
      
      const worker = {
        id: workerId,
        browser: browser,
        job: job,
        startTime: new Date(),
        status: 'running'
      };
      
      this.workers.set(workerId, worker);
      this.activeJobs.set(job.job_id, worker);
      
      // Log worker start
      await logActivity({
        userId: job.user_id,
        jobId: job.job_id,
        action: 'WORKER_STARTED',
        details: { workerId, accountId: job.linkedin_account_id }
      });
      
      // Start job processing
      this.processJob(worker).catch(async (error) => {
        console.error(`❌ Worker ${workerId} failed:`, error);
        await this.handleWorkerError(worker, error);
      });
      
    } catch (error) {
      console.error(`❌ Failed to start worker ${workerId}:`, error);
      
      await logError({
        jobId: job.job_id,
        linkedinAccountId: job.linkedin_account_id,
        errorType: 'WORKER_START_ERROR',
        errorMessage: error.message,
        errorDetails: { workerId, stack: error.stack }
      });
      
      // Mark job as failed
      await JobQueueService.markJobFailed(job.job_id, error.message);
    }
  }
  
  /**
   * Launch Chrome with extension
   */
  async launchChromeWithExtension(profilePath) {
    const args = [
      `--user-data-dir=${profilePath}`,
      `--load-extension=${this.extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ];
    
    const browser = await puppeteer.launch({
      headless: false, // Keep visible for debugging
      args: args,
      defaultViewport: null,
      ignoreDefaultArgs: ['--disable-extensions']
    });
    
    return browser;
  }
  
  /**
   * Process a job with the assigned worker
   */
  async processJob(worker) {
    const { job, browser } = worker;
    
    try {
      console.log(`🔄 Processing job ${job.job_id} with worker ${worker.id}`);
      
      // Get job URLs to process
      const urls = await this.getJobUrls(job.job_id);
      
      if (!urls || urls.length === 0) {
        throw new Error('No URLs found for job');
      }
      
      // Update job status to running
      await this.updateJobStatus(job.job_id, 'running');
      
      // Process URLs
      const results = [];
      let processedCount = 0;
      let successCount = 0;
      let failedCount = 0;
      
      for (const url of urls) {
        try {
          console.log(`📄 Processing URL: ${url.url}`);
          
          // Create new page for this URL
          const page = await browser.newPage();
          
          // Load extension config
          const configPath = path.join(this.chromeProfiles.get(job.linkedin_account_id), 'extension-config.json');
          const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
          
          // Inject extension config into page
          await page.evaluateOnNewDocument((config) => {
            window.scralyticsConfig = config;
          }, config);
          
          // Navigate to URL
          await page.goto(url.url, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // Wait for extension to process the page
          await page.waitForTimeout(5000);
          
          // Check if we're on a login page (error handling)
          const isLoginPage = await page.evaluate(() => {
            return window.location.href.includes('/login') || 
                   document.querySelector('input[name="session_key"]') !== null;
          });
          
          if (isLoginPage) {
            console.log('🔄 Login page detected, handling cookie refresh...');
            await this.handleLoginRedirect(worker, page, url);
          } else {
            // Extract data using extension
            const result = await this.extractDataWithExtension(page, job.job_type);
            
            if (result) {
              results.push({
                url: url.url,
                data: result,
                status: 'success'
              });
              successCount++;
            } else {
              results.push({
                url: url.url,
                error: 'No data extracted',
                status: 'failed'
              });
              failedCount++;
            }
          }
          
          processedCount++;
          
          // Update progress
          await this.updateJobProgress(job.job_id, {
            processedUrls: processedCount,
            successfulUrls: successCount,
            failedUrls: failedCount,
            totalUrls: urls.length
          });
          
          await page.close();
          
          // Small delay between URLs
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`❌ Error processing URL ${url.url}:`, error);
          
          results.push({
            url: url.url,
            error: error.message,
            status: 'failed'
          });
          
          failedCount++;
          processedCount++;
          
          await logError({
            jobId: job.job_id,
            linkedinAccountId: job.linkedin_account_id,
            errorType: 'URL_PROCESSING_ERROR',
            errorMessage: error.message,
            errorDetails: { url: url.url, stack: error.stack }
          });
        }
      }
      
      // Save results
      await this.saveJobResults(job.job_id, results);
      
      // Update job status to completed
      await this.updateJobStatus(job.job_id, 'completed');
      
      // Deduct credits
      await this.deductUserCredits(job.user_id, successCount);
      
      console.log(`✅ Job ${job.job_id} completed: ${successCount}/${urls.length} successful`);
      
      await logActivity({
        userId: job.user_id,
        jobId: job.job_id,
        action: 'JOB_COMPLETED',
        details: { 
          processedUrls: processedCount,
          successfulUrls: successCount,
          failedUrls: failedCount,
          workerId: worker.id
        }
      });
      
    } catch (error) {
      console.error(`❌ Job ${job.job_id} failed:`, error);
      
      await this.updateJobStatus(job.job_id, 'failed');
      
      await logError({
        jobId: job.job_id,
        linkedinAccountId: job.linkedin_account_id,
        errorType: 'JOB_PROCESSING_ERROR',
        errorMessage: error.message,
        errorDetails: { workerId: worker.id, stack: error.stack }
      });
      
      throw error;
      
    } finally {
      // Clean up worker
      await this.stopWorker(worker.id);
    }
  }
  
  /**
   * Handle login redirect by refreshing cookies
   */
  async handleLoginRedirect(worker, page, url) {
    try {
      console.log('🔄 Handling login redirect for job', worker.job.job_id);
      
      // Try to refresh cookies through extension
      const cookieRefreshResult = await page.evaluate(() => {
        if (window.scralyticsExtension && window.scralyticsExtension.refreshCookies) {
          return window.scralyticsExtension.refreshCookies();
        }
        return null;
      });
      
      if (cookieRefreshResult) {
        console.log('✅ Cookies refreshed, retrying URL');
        
        // Wait a moment and try to navigate again
        await page.waitForTimeout(3000);
        await page.goto(url.url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Check if still on login page
        const stillLoginPage = await page.evaluate(() => {
          return window.location.href.includes('/login') || 
                 document.querySelector('input[name="session_key"]') !== null;
        });
        
        if (stillLoginPage) {
          throw new Error('Still redirected to login after cookie refresh');
        }
        
      } else {
        throw new Error('Cookie refresh failed');
      }
      
    } catch (error) {
      console.error('❌ Login redirect handling failed:', error);
      
      // Use error handling service
      await this.errorHandler.handleCookieError(
        worker.id,
        worker.job.job_id,
        worker.job.linkedin_account_id,
        'LOGIN_REDIRECT',
        error.message
      );
      
      throw error;
    }
  }
  
  /**
   * Extract data using extension
   */
  async extractDataWithExtension(page, jobType) {
    try {
      // Wait for extension to be ready
      await page.waitForFunction(() => {
        return window.scralyticsExtension && window.scralyticsExtension.extractData;
      }, { timeout: 10000 });
      
      // Extract data based on job type
      const result = await page.evaluate((jobType) => {
        if (window.scralyticsExtension && window.scralyticsExtension.extractData) {
          return window.scralyticsExtension.extractData(jobType);
        }
        return null;
      }, jobType);
      
      return result;
      
    } catch (error) {
      console.error('❌ Data extraction failed:', error);
      return null;
    }
  }
  
  /**
   * Get job URLs from database
   */
  async getJobUrls(jobId) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      const [urls] = await connection.execute(
        'SELECT * FROM job_urls WHERE job_id = ? ORDER BY id',
        [jobId]
      );
      
      return urls;
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Update job status
   */
  async updateJobStatus(jobId, status) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      await connection.execute(
        'UPDATE jobs SET status = ?, updated_at = NOW() WHERE id = ?',
        [status, jobId]
      );
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Update job progress
   */
  async updateJobProgress(jobId, progress) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      await connection.execute(`
        UPDATE jobs SET 
          processed_urls = ?, 
          successful_urls = ?, 
          failed_urls = ?,
          updated_at = NOW()
        WHERE id = ?
      `, [progress.processedUrls, progress.successfulUrls, progress.failedUrls, jobId]);
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Save job results
   */
  async saveJobResults(jobId, results) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      for (const result of results) {
        await connection.execute(`
          INSERT INTO results (job_id, url, data, status, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `, [jobId, result.url, JSON.stringify(result.data || result.error), result.status]);
      }
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Deduct user credits
   */
  async deductUserCredits(userId, creditsToDeduct) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      await connection.execute(
        'UPDATE users SET credits = credits - ? WHERE id = ?',
        [creditsToDeduct, userId]
      );
      
      console.log(`💳 Deducted ${creditsToDeduct} credits from user ${userId}`);
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Handle worker error
   */
  async handleWorkerError(worker, error) {
    try {
      // Update job status to failed
      await this.updateJobStatus(worker.job.job_id, 'failed');
      
      // Log error
      await logError({
        jobId: worker.job.job_id,
        linkedinAccountId: worker.job.linkedin_account_id,
        errorType: 'WORKER_ERROR',
        errorMessage: error.message,
        errorDetails: { workerId: worker.id, stack: error.stack }
      });
      
      // Try to handle error with error handling service
      await this.errorHandler.handleScrapingError(
        worker.id,
        worker.job.job_id,
        worker.job.linkedin_account_id,
        'WORKER_FAILURE',
        error.message
      );
      
    } catch (handlingError) {
      console.error('❌ Error handling worker error:', handlingError);
    } finally {
      // Clean up worker
      await this.stopWorker(worker.id);
    }
  }
  
  /**
   * Stop a specific worker
   */
  async stopWorker(workerId) {
    const worker = this.workers.get(workerId);
    
    if (!worker) {
      return;
    }
    
    try {
      console.log(`🛑 Stopping worker ${workerId}`);
      
      // Close browser
      if (worker.browser) {
        await worker.browser.close();
      }
      
      // Remove from active jobs
      if (worker.job) {
        this.activeJobs.delete(worker.job.job_id);
      }
      
      // Remove worker
      this.workers.delete(workerId);
      
      console.log(`✅ Worker ${workerId} stopped`);
      
    } catch (error) {
      console.error(`❌ Error stopping worker ${workerId}:`, error);
    }
  }
  
  /**
   * Get worker status
   */
  getWorkerStatus() {
    const status = {
      isProcessing: this.isProcessing,
      activeWorkers: this.workers.size,
      maxWorkers: this.maxConcurrentWorkers,
      activeJobs: Array.from(this.activeJobs.keys()),
      workers: Array.from(this.workers.values()).map(w => ({
        id: w.id,
        jobId: w.job.job_id,
        status: w.status,
        startTime: w.startTime
      }))
    };
    
    return status;
  }
}

module.exports = WorkerManager;