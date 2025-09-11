const puppeteer = require('puppeteer');
const { Job, Result } = require('../models');
const logger = require('../utils/logger');
const authService = require('../utils/auth');
const { handleScrapingError } = require('../utils/errorHandler');

class ScrapingService {
  constructor() {
    this.runningJobs = new Map();
    this.browser = null;
    this.maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_JOBS) || 3;
    this.scrapingQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Initialize browser instance
   */
  async initBrowser() {
    if (this.browser) {
      return this.browser;
    }

    try {
      const browserOptions = {
        headless: process.env.NODE_ENV === 'production' ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--window-size=1920,1080'
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      };

      // Use system Chromium in Docker
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        browserOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      this.browser = await puppeteer.launch(browserOptions);
      
      logger.info('Browser initialized successfully');
      return this.browser;
    } catch (error) {
      logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }

  /**
   * Process a scraping job
   */
  async processJob(jobId) {
    try {
      const job = await Job.findByPk(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Check if job is already running
      if (this.runningJobs.has(jobId)) {
        logger.warn(`Job ${jobId} is already running`);
        return;
      }

      // Check concurrent job limit
      if (this.runningJobs.size >= this.maxConcurrentJobs) {
        this.scrapingQueue.push(jobId);
        logger.info(`Job ${jobId} queued (${this.runningJobs.size}/${this.maxConcurrentJobs} slots used)`);
        return;
      }

      // Mark job as running
      this.runningJobs.set(jobId, { startTime: Date.now(), cancelled: false });
      await job.markAsRunning();

      logger.logScraping.start(jobId, job.type, job.query);

      // Initialize browser if needed
      await this.initBrowser();

      // Execute scraping based on job type
      let results = [];
      switch (job.type) {
        case 'profile':
          results = await this.scrapeProfiles(job);
          break;
        case 'company':
          results = await this.scrapeCompanies(job);
          break;
        case 'search':
          results = await this.scrapeSearch(job);
          break;
        case 'jobPosting':
          results = await this.scrapeJobPostings(job);
          break;
        default:
          throw new Error(`Unsupported job type: ${job.type}`);
      }

      // Save results to database
      if (results.length > 0) {
        const { results: savedResults, errors } = await Result.bulkCreateWithDeduplication(jobId, results);
        
        if (errors.length > 0) {
          logger.warn(`Job ${jobId} had ${errors.length} result errors:`, errors.slice(0, 5));
        }

        await job.update({
          totalResults: savedResults.length,
          processedResults: savedResults.length
        });
      }

      // Mark job as completed
      await job.markAsCompleted();
      
      const duration = Date.now() - this.runningJobs.get(jobId).startTime;
      logger.logScraping.complete(jobId, results.length, duration);

    } catch (error) {
      logger.logScraping.error(jobId, error);
      
      const job = await Job.findByPk(jobId);
      if (job) {
        await job.markAsFailed(error.message);
      }
      
      throw handleScrapingError(error, { jobId });
    } finally {
      // Remove from running jobs
      this.runningJobs.delete(jobId);
      
      // Process next job in queue
      this.processQueue();
    }
  }

  /**
   * Process queued jobs
   */
  async processQueue() {
    if (this.isProcessingQueue || this.scrapingQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.scrapingQueue.length > 0 && this.runningJobs.size < this.maxConcurrentJobs) {
      const jobId = this.scrapingQueue.shift();
      
      // Process job asynchronously
      setImmediate(() => {
        this.processJob(jobId).catch(error => {
          logger.error(`Error processing queued job ${jobId}:`, error);
        });
      });
    }

    this.isProcessingQueue = false;
  }

  /**
   * Cancel a running job
   */
  cancelJob(jobId) {
    const runningJob = this.runningJobs.get(jobId);
    if (runningJob) {
      runningJob.cancelled = true;
      logger.info(`Job ${jobId} marked for cancellation`);
    }

    // Remove from queue if present
    const queueIndex = this.scrapingQueue.indexOf(jobId);
    if (queueIndex > -1) {
      this.scrapingQueue.splice(queueIndex, 1);
      logger.info(`Job ${jobId} removed from queue`);
    }
  }

  /**
   * Check if job is cancelled
   */
  isJobCancelled(jobId) {
    const runningJob = this.runningJobs.get(jobId);
    return runningJob ? runningJob.cancelled : false;
  }

  /**
   * Create a new page with common settings
   */
  async createPage() {
    const page = await this.browser.newPage();
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    return page;
  }

  /**
   * Add random delays to mimic human behavior
   */
  async randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Scrape LinkedIn profiles
   */
  async scrapeProfiles(job) {
    const page = await this.createPage();
    const results = [];
    
    try {
      // Navigate to LinkedIn search
      await page.goto('https://www.linkedin.com/search/results/people/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Check if we need to login (simplified - in production you'd handle LinkedIn auth)
      const needsLogin = await page.$('.sign-in-form') !== null;
      if (needsLogin) {
        logger.warn(`Job ${job.id}: LinkedIn login required`);
        // In a real implementation, you'd handle LinkedIn authentication here
        throw new Error('LinkedIn authentication required');
      }

      // Perform search
      await page.type('input[placeholder*="Search"]', job.query);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.search-results-container', { timeout: 10000 });

      let processedCount = 0;
      const maxResults = job.maxResults || 100;

      // Scrape profiles from search results
      while (processedCount < maxResults && !this.isJobCancelled(job.id)) {
        // Get profile cards on current page
        const profileCards = await page.$$('.search-result__wrapper');
        
        for (const card of profileCards) {
          if (processedCount >= maxResults || this.isJobCancelled(job.id)) break;

          try {
            const profileData = await this.extractProfileData(card);
            if (profileData) {
              results.push({
                type: 'profile',
                ...profileData
              });
              processedCount++;
              
              // Update job progress
              await job.updateProgress(processedCount, maxResults);
              logger.logScraping.progress(job.id, processedCount, maxResults);
            }
          } catch (error) {
            logger.warn(`Error extracting profile data: ${error.message}`);
          }

          await this.randomDelay(500, 1500);
        }

        // Try to go to next page
        const nextButton = await page.$('button[aria-label="Next"]');
        if (nextButton && processedCount < maxResults) {
          await nextButton.click();
          await page.waitForTimeout(2000);
          await page.waitForSelector('.search-results-container', { timeout: 10000 });
        } else {
          break;
        }
      }

    } finally {
      await page.close();
    }

    return results;
  }

  /**
   * Extract profile data from a profile card element
   */
  async extractProfileData(cardElement) {
    try {
      const name = await cardElement.$eval('.actor-name', el => el.textContent.trim()).catch(() => null);
      const headline = await cardElement.$eval('.subline-level-1', el => el.textContent.trim()).catch(() => null);
      const company = await cardElement.$eval('.subline-level-2', el => el.textContent.trim()).catch(() => null);
      const location = await cardElement.$eval('.search-result__snippets .t-12', el => el.textContent.trim()).catch(() => null);
      const profileUrl = await cardElement.$eval('a[data-control-name="search_srp_result"]', el => el.href).catch(() => null);

      if (!name && !headline) {
        return null; // Skip if no meaningful data
      }

      return {
        name,
        headline,
        company,
        location,
        url: profileUrl,
        profileUrl
      };
    } catch (error) {
      logger.warn('Error extracting profile data:', error.message);
      return null;
    }
  }

  /**
   * Scrape LinkedIn companies
   */
  async scrapeCompanies(job) {
    const page = await this.createPage();
    const results = [];
    
    try {
      // Navigate to LinkedIn company search
      await page.goto('https://www.linkedin.com/search/results/companies/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Perform search
      await page.type('input[placeholder*="Search"]', job.query);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.search-results-container', { timeout: 10000 });

      let processedCount = 0;
      const maxResults = job.maxResults || 100;

      // Scrape companies from search results
      while (processedCount < maxResults && !this.isJobCancelled(job.id)) {
        const companyCards = await page.$$('.search-result__wrapper');
        
        for (const card of companyCards) {
          if (processedCount >= maxResults || this.isJobCancelled(job.id)) break;

          try {
            const companyData = await this.extractCompanyData(card);
            if (companyData) {
              results.push({
                type: 'company',
                ...companyData
              });
              processedCount++;
              
              await job.updateProgress(processedCount, maxResults);
              logger.logScraping.progress(job.id, processedCount, maxResults);
            }
          } catch (error) {
            logger.warn(`Error extracting company data: ${error.message}`);
          }

          await this.randomDelay(500, 1500);
        }

        // Try to go to next page
        const nextButton = await page.$('button[aria-label="Next"]');
        if (nextButton && processedCount < maxResults) {
          await nextButton.click();
          await page.waitForTimeout(2000);
        } else {
          break;
        }
      }

    } finally {
      await page.close();
    }

    return results;
  }

  /**
   * Extract company data from a company card element
   */
  async extractCompanyData(cardElement) {
    try {
      const name = await cardElement.$eval('.search-result__title', el => el.textContent.trim()).catch(() => null);
      const industry = await cardElement.$eval('.search-result__snippets .t-12', el => el.textContent.trim()).catch(() => null);
      const size = await cardElement.$eval('.search-result__snippets .t-12:nth-child(2)', el => el.textContent.trim()).catch(() => null);
      const location = await cardElement.$eval('.search-result__snippets .t-12:nth-child(3)', el => el.textContent.trim()).catch(() => null);
      const companyUrl = await cardElement.$eval('a[data-control-name="search_srp_result"]', el => el.href).catch(() => null);

      if (!name) {
        return null;
      }

      return {
        name,
        industry,
        size,
        location,
        url: companyUrl
      };
    } catch (error) {
      logger.warn('Error extracting company data:', error.message);
      return null;
    }
  }

  /**
   * Scrape general LinkedIn search results
   */
  async scrapeSearch(job) {
    // This would combine profile and company scraping
    const profileResults = await this.scrapeProfiles(job);
    const companyResults = await this.scrapeCompanies(job);
    
    return [...profileResults, ...companyResults];
  }

  /**
   * Scrape LinkedIn job postings
   */
  async scrapeJobPostings(job) {
    const page = await this.createPage();
    const results = [];
    
    try {
      // Navigate to LinkedIn jobs search
      await page.goto('https://www.linkedin.com/jobs/search/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Perform search
      await page.type('input[placeholder*="Search jobs"]', job.query);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.jobs-search-results-list', { timeout: 10000 });

      let processedCount = 0;
      const maxResults = job.maxResults || 100;

      // Scrape job postings
      while (processedCount < maxResults && !this.isJobCancelled(job.id)) {
        const jobCards = await page.$$('.job-search-card');
        
        for (const card of jobCards) {
          if (processedCount >= maxResults || this.isJobCancelled(job.id)) break;

          try {
            const jobData = await this.extractJobData(card);
            if (jobData) {
              results.push({
                type: 'jobPosting',
                ...jobData
              });
              processedCount++;
              
              await job.updateProgress(processedCount, maxResults);
              logger.logScraping.progress(job.id, processedCount, maxResults);
            }
          } catch (error) {
            logger.warn(`Error extracting job data: ${error.message}`);
          }

          await this.randomDelay(500, 1500);
        }

        // Try to load more jobs
        const loadMoreButton = await page.$('button[aria-label="Load more jobs"]');
        if (loadMoreButton && processedCount < maxResults) {
          await loadMoreButton.click();
          await page.waitForTimeout(2000);
        } else {
          break;
        }
      }

    } finally {
      await page.close();
    }

    return results;
  }

  /**
   * Extract job posting data from a job card element
   */
  async extractJobData(cardElement) {
    try {
      const title = await cardElement.$eval('.job-search-card__title', el => el.textContent.trim()).catch(() => null);
      const company = await cardElement.$eval('.job-search-card__subtitle', el => el.textContent.trim()).catch(() => null);
      const location = await cardElement.$eval('.job-search-card__location', el => el.textContent.trim()).catch(() => null);
      const postedDate = await cardElement.$eval('.job-search-card__listdate', el => el.textContent.trim()).catch(() => null);
      const jobUrl = await cardElement.$eval('a', el => el.href).catch(() => null);

      if (!title || !company) {
        return null;
      }

      return {
        title,
        company,
        location,
        postedDate,
        url: jobUrl
      };
    } catch (error) {
      logger.warn('Error extracting job data:', error.message);
      return null;
    }
  }

  /**
   * Get scraping service status
   */
  getStatus() {
    return {
      runningJobs: this.runningJobs.size,
      queuedJobs: this.scrapingQueue.length,
      maxConcurrentJobs: this.maxConcurrentJobs,
      browserActive: !!this.browser,
      activeJobs: Array.from(this.runningJobs.keys())
    };
  }
}

// Create singleton instance
const scrapingService = new ScrapingService();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down scraping service...');
  await scrapingService.closeBrowser();
});

process.on('SIGINT', async () => {
  logger.info('Shutting down scraping service...');
  await scrapingService.closeBrowser();
});

module.exports = scrapingService;