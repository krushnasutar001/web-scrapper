const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const { handleLinkedInResponse, logLinkedInError } = require('../utils/linkedinResponseHandler');
const { retryLinkedInRequest } = require('../utils/responseValidator');
const { linkedInRateLimiter, withRateLimit } = require('../utils/rateLimiter');

class ScrapingService {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.LinkedInAccountsService = require('./linkedinAccountsService');
    this.accountsService = new this.LinkedInAccountsService(dbConnection);
  }

  async processJob(jobId) {
    try {
      console.log(`🔄 Processing job: ${jobId}`);
      
      // Get job details
      const [jobs] = await this.db.execute(
        'SELECT * FROM jobs WHERE id = ?',
        [jobId]
      );
      
      if (jobs.length === 0) {
        throw new Error('Job not found');
      }
      
      const job = jobs[0];
      const config = JSON.parse(job.configuration || '{}');
      
      // Update job status to running
      await this.updateJobStatus(jobId, 'running', 0);
      
      // Get accounts for this job based on selection mode
      const accounts = await this.getJobAccounts(job);
      
      if (accounts.length === 0) {
        throw new Error('No available accounts for this job');
      }
      
      console.log(`📊 Using ${accounts.length} accounts for job ${jobId}`);
      
      // Create job account assignments
      await this.createJobAccountAssignments(jobId, accounts);
      
      let allResults = [];
      
      switch (job.type) {
        case 'profile':
          allResults = await this.scrapeProfilesMultiAccount(job, config, accounts);
          break;
        case 'company':
          allResults = await this.scrapeCompaniesMultiAccount(job, config, accounts);
          break;
        case 'search':
          allResults = await this.scrapeSearchMultiAccount(job, config, accounts);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      
      // Save results to database
      await this.saveResults(jobId, allResults);
      
      // Update job as completed
      await this.updateJobStatus(jobId, 'completed', 100, allResults.length);
      
      console.log(`✅ Job ${jobId} completed with ${allResults.length} results from ${accounts.length} accounts`);
      
    } catch (error) {
      console.error(`❌ Job ${jobId} failed:`, error.message);
      await this.updateJobStatus(jobId, 'failed', 0, 0, error.message);
    }
  }

  async scrapeProfiles(job, config) {
    console.log('🔄 Starting profile scraping...');
    
    // Read URLs from uploaded file
    const urls = await this.readUrlsFromFile(config.filePath);
    console.log(`Found ${urls.length} profile URLs to scrape`);
    
    const browser = await this.launchBrowser(config.proxyUrl);
    const page = await browser.newPage();
    
    // Set LinkedIn cookie
    await this.setLinkedInCookie(page, config.linkedinCookie);
    
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
      try {
        const url = urls[i].trim();
        if (!url) continue;
        
        console.log(`Scraping profile ${i + 1}/${urls.length}: ${url}`);
        
        const profileData = await this.scrapeLinkedInProfile(page, url);
        if (profileData) {
          results.push(profileData);
        }
        
        // Update progress
        const progress = Math.round(((i + 1) / urls.length) * 100);
        await this.updateJobStatus(job.id, 'running', progress);
        
        // Random delay to avoid detection
        await this.randomDelay(2000, 5000);
        
      } catch (error) {
        console.error(`Failed to scrape profile ${urls[i]}:`, error.message);
      }
    }
    
    await browser.close();
    return results;
  }

  async scrapeCompanies(job, config) {
    console.log('🔄 Starting company scraping...');
    
    // Read URLs from uploaded file
    const urls = await this.readUrlsFromFile(config.filePath);
    console.log(`Found ${urls.length} company URLs to scrape`);
    
    const browser = await this.launchBrowser(config.proxyUrl);
    const page = await browser.newPage();
    
    // Set LinkedIn cookie
    await this.setLinkedInCookie(page, config.linkedinCookie);
    
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
      try {
        const url = urls[i].trim();
        if (!url) continue;
        
        console.log(`Scraping company ${i + 1}/${urls.length}: ${url}`);
        
        const companyData = await this.scrapeLinkedInCompany(page, url);
        if (companyData) {
          results.push(companyData);
        }
        
        // Update progress
        const progress = Math.round(((i + 1) / urls.length) * 100);
        await this.updateJobStatus(job.id, 'running', progress);
        
        // Random delay to avoid detection
        await this.randomDelay(2000, 5000);
        
      } catch (error) {
        console.error(`Failed to scrape company ${urls[i]}:`, error.message);
      }
    }
    
    await browser.close();
    return results;
  }

  async scrapeSearch(job, config) {
    console.log('🔄 Starting search scraping...');
    
    const browser = await this.launchBrowser(config.proxyUrl);
    const page = await browser.newPage();
    
    // Set LinkedIn cookie
    await this.setLinkedInCookie(page, config.linkedinCookie);
    
    const searchQuery = job.query;
    console.log(`Searching for: ${searchQuery}`);
    
    const results = await this.searchLinkedIn(page, searchQuery, job.max_results || 100);
    
    await browser.close();
    return results;
  }

  async launchBrowser(proxyUrl) {
    const config = require('../config');
    
    const args = [
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
      '--disable-ipc-flooding-protection'
    ];
    
    if (proxyUrl) {
      args.push(`--proxy-server=${proxyUrl}`);
    }
    
    const launchOptions = {
      headless: config.BROWSER_HEADLESS,
      args,
      timeout: config.BROWSER_TIMEOUT_MS,
      defaultViewport: {
        width: 1366,
        height: 768
      },
      ignoreHTTPSErrors: true,
      slowMo: config.IS_DEVELOPMENT ? 50 : 0
    };

    // Set user data directory if profiles base is configured
    if (config.PROFILES_BASE) {
      const userDataDir = path.join(config.PROFILES_BASE, 'chrome-data');
      
      // Ensure directory exists
      try {
        await fs.access(userDataDir);
      } catch {
        await fs.mkdir(userDataDir, { recursive: true });
      }
      
      launchOptions.userDataDir = userDataDir;
    }

    try {
      console.log('🚀 Launching browser with options:', {
        headless: launchOptions.headless,
        proxy: proxyUrl || 'none',
        userDataDir: launchOptions.userDataDir || 'default'
      });
      
      return await puppeteer.launch(launchOptions);
    } catch (error) {
      console.error('❌ Browser launch failed:', error.message);
      
      // Try fallback launch without user data directory
      if (launchOptions.userDataDir) {
        console.log('🔄 Retrying browser launch without user data directory...');
        delete launchOptions.userDataDir;
        
        try {
          return await puppeteer.launch(launchOptions);
        } catch (fallbackError) {
          console.error('❌ Fallback browser launch also failed:', fallbackError.message);
          throw new Error(`Failed to launch browser: ${fallbackError.message}`);
        }
      }
      
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
  }

  async setLinkedInCookie(page, cookieValue, accountId = null) {
    const { handleLinkedInResponse, logLinkedInError } = require('../utils/linkedinResponseHandler');
    
    await page.setCookie({
      name: 'li_at',
      value: cookieValue,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true
    });
    
    // Test authentication by navigating to LinkedIn feed
    try {
      const response = await page.goto('https://www.linkedin.com/feed/', { 
        waitUntil: 'networkidle2', 
        timeout: 15000 
      });
      
      const currentUrl = page.url();
      const pageContent = await page.content();
      
      // Use LinkedIn response handler to detect errors
      const responseResult = handleLinkedInResponse(pageContent, 'text/html', currentUrl);
      
      if (!responseResult.success && responseResult.linkedInError) {
        logLinkedInError(responseResult, 'authentication');
        
        // Mark account as INVALID if accountId is provided
        if (accountId) {
          try {
            await this.db.execute(`
              UPDATE linkedin_accounts 
              SET validation_status = 'INVALID', last_validated_at = NOW(),
                  consecutive_failures = consecutive_failures + 1,
                  last_error_message = ?,
                  last_error_at = NOW()
              WHERE id = ?
            `, [responseResult.linkedInError.message, accountId]);
            
            console.log(`📝 Account ${accountId} marked as INVALID: ${responseResult.linkedInError.errorType}`);
          } catch (dbError) {
            console.error(`❌ Failed to update account ${accountId} status:`, dbError.message);
          }
        }
        
        throw new Error(`LinkedIn authentication failed: ${responseResult.linkedInError.message}`);
      }
      
      // Check if redirected to login (fallback check)
      if (currentUrl.includes('/login') || currentUrl.includes('/uas/login') || 
          currentUrl.includes('/checkpoint/') || response.status() === 401) {
        
        console.error(`❌ LinkedIn authentication failed for account ${accountId} - cookie invalid`);
        
        // Mark account as INVALID if accountId is provided
        if (accountId) {
          try {
            await this.db.execute(`
              UPDATE linkedin_accounts 
              SET validation_status = 'INVALID', last_validated_at = NOW(),
                  consecutive_failures = consecutive_failures + 1,
                  last_error_message = 'Authentication failed during scraping - cookie expired or invalid',
                  last_error_at = NOW()
              WHERE id = ?
            `, [accountId]);
            
            console.log(`📝 Account ${accountId} marked as INVALID due to authentication failure`);
          } catch (dbError) {
            console.error(`❌ Failed to update account ${accountId} status:`, dbError.message);
          }
        }
        
        throw new Error('LinkedIn authentication failed - cookie is invalid or expired');
      }
      
      console.log(`✅ LinkedIn authentication successful for account ${accountId}`);
      
    } catch (error) {
      if (error.message.includes('authentication failed')) {
        throw error; // Re-throw authentication errors
      }
      
      // For other errors (network, timeout), log but don't mark as invalid immediately
      console.warn(`⚠️ LinkedIn authentication test failed for account ${accountId}:`, error.message);
      throw new Error(`LinkedIn access failed: ${error.message}`);
    }
  }

  async scrapeLinkedInProfile(page, profileUrl) {
    // Apply rate limiting to profile scraping
    await linkedInRateLimiter.waitForToken();
    
    const scrapeWithRetry = async () => {
      try {
        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for profile content to load
        await page.waitForSelector('h1', { timeout: 10000 });
        
        const profileData = await page.evaluate(() => {
          const getText = (selector) => {
            const element = document.querySelector(selector);
            return element ? element.textContent.trim() : '';
          };
          
          const getTexts = (selector) => {
            const elements = document.querySelectorAll(selector);
            return Array.from(elements).map(el => el.textContent.trim());
          };
          
          return {
            name: getText('h1'),
            headline: getText('.text-body-medium.break-words'),
            location: getText('.text-body-small.inline.t-black--light.break-words'),
            about: getText('.pv-about-section .pv-about__summary-text .lt-line-clamp__raw-line'),
            experience: getTexts('.pv-entity__summary-info h3').slice(0, 3).join('; '),
            education: getTexts('.pv-education-entity h3').slice(0, 2).join('; '),
            skills: getTexts('.pv-skill-category-entity__name span').slice(0, 10).join('; '),
            connections: getText('.t-black--light.t-normal'),
            profileUrl: window.location.href
          };
        });
        
        return profileData;
        
      } catch (error) {
        // Check if this is a LinkedIn-specific error (login page, captcha, etc.)
        const pageContent = await page.content().catch(() => '');
        const linkedInError = handleLinkedInResponse(null, pageContent);
        
        if (linkedInError.isLinkedInError) {
          logLinkedInError('Profile Scraping', linkedInError, profileUrl);
          throw new Error(`LinkedIn error: ${linkedInError.errorType} - ${linkedInError.message}`);
        }
        
        throw error;
      }
    };

    try {
      return await retryLinkedInRequest(scrapeWithRetry, {
        maxRetries: 3,
        baseDelay: linkedInRateLimiter.getLinkedInDelay()
      });
    } catch (error) {
      console.error('Failed to scrape profile after retries:', error.message);
      return null;
    }
  }

  async scrapeLinkedInCompany(page, companyUrl) {
    // Apply rate limiting to company scraping
    await linkedInRateLimiter.waitForToken();
    
    const scrapeWithRetry = async () => {
      try {
        await page.goto(companyUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for company content to load
        await page.waitForSelector('h1', { timeout: 10000 });
        
        const companyData = await page.evaluate(() => {
          const getText = (selector) => {
            const element = document.querySelector(selector);
            return element ? element.textContent.trim() : '';
          };
          
          return {
            name: getText('h1'),
            industry: getText('.org-top-card-summary__industry'),
            size: getText('.org-top-card-summary__employees'),
            location: getText('.org-top-card-summary__headquarter'),
            website: getText('.org-about-company-module__company-details a'),
            description: getText('.org-about-company-module__description'),
            founded: getText('.org-about-company-module__company-details dd'),
            specialties: getText('.org-about-company-module__specialties'),
            companyUrl: window.location.href
          };
        });
        
        return companyData;
        
      } catch (error) {
        // Check if this is a LinkedIn-specific error
        const pageContent = await page.content().catch(() => '');
        const linkedInError = handleLinkedInResponse(null, pageContent);
        
        if (linkedInError.isLinkedInError) {
          logLinkedInError('Company Scraping', linkedInError, companyUrl);
          throw new Error(`LinkedIn error: ${linkedInError.errorType} - ${linkedInError.message}`);
        }
        
        throw error;
      }
    };

    try {
      return await retryLinkedInRequest(scrapeWithRetry, {
        maxRetries: 3,
        baseDelay: linkedInRateLimiter.getLinkedInDelay()
      });
    } catch (error) {
      console.error('Failed to scrape company after retries:', error.message);
      return null;
    }
  }

  async searchLinkedIn(page, query, maxResults = 100) {
    try {
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      const results = [];
      let currentPage = 1;
      
      while (results.length < maxResults) {
        console.log(`Scraping search results page ${currentPage}...`);
        
        // Wait for search results to load
        await page.waitForSelector('.search-result__wrapper', { timeout: 10000 });
        
        const pageResults = await page.evaluate(() => {
          const searchResults = document.querySelectorAll('.search-result__wrapper');
          return Array.from(searchResults).map(result => {
            const nameElement = result.querySelector('.search-result__result-link');
            const headlineElement = result.querySelector('.subline-level-1');
            const locationElement = result.querySelector('.subline-level-2');
            
            return {
              name: nameElement ? nameElement.textContent.trim() : '',
              headline: headlineElement ? headlineElement.textContent.trim() : '',
              location: locationElement ? locationElement.textContent.trim() : '',
              profileUrl: nameElement ? nameElement.href : '',
              searchQuery: query
            };
          }).filter(result => result.name && result.profileUrl);
        });
        
        results.push(...pageResults);
        
        // Try to go to next page
        const nextButton = await page.$('.artdeco-pagination__button--next:not([disabled])');
        if (!nextButton || results.length >= maxResults) {
          break;
        }
        
        await nextButton.click();
        await page.waitForTimeout(3000);
        currentPage++;
      }
      
      return results.slice(0, maxResults);
      
    } catch (error) {
      console.error('Failed to search LinkedIn:', error.message);
      return [];
    }
  }

  async readUrlsFromFile(filePath) {
    try {
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (fileExtension === '.csv') {
        return await this.readCsvFile(filePath);
      } else if (['.xlsx', '.xls'].includes(fileExtension)) {
        return await this.readExcelFile(filePath);
      } else {
        throw new Error('Unsupported file format');
      }
    } catch (error) {
      console.error('Failed to read file:', error.message);
      return [];
    }
  }

  async readCsvFile(filePath) {
    return new Promise((resolve, reject) => {
      const urls = [];
      const stream = require('fs').createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Look for URL in first column or any column containing 'url'
          const url = Object.values(row)[0] || row.url || row.URL || row.linkedin_url;
          if (url && url.includes('linkedin.com')) {
            urls.push(url);
          }
        })
        .on('end', () => resolve(urls))
        .on('error', reject);
    });
  }

  async readExcelFile(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      const urls = [];
      data.forEach(row => {
        const url = Object.values(row)[0] || row.url || row.URL || row.linkedin_url;
        if (url && url.includes('linkedin.com')) {
          urls.push(url);
        }
      });
      
      return urls;
    } catch (error) {
      console.error('Failed to read Excel file:', error.message);
      return [];
    }
  }

  async updateJobStatus(jobId, status, progress = 0, totalResults = 0, errorMessage = null) {
    try {
      const updateFields = ['status = ?', 'progress = ?', 'updated_at = NOW()'];
      const updateValues = [status, progress];
      
      if (totalResults > 0) {
        updateFields.push('total_results = ?', 'processed_results = ?');
        updateValues.push(totalResults, totalResults);
      }
      
      if (status === 'running' && !errorMessage) {
        updateFields.push('started_at = NOW()');
      }
      
      if (status === 'completed') {
        updateFields.push('completed_at = NOW()');
      }
      
      if (errorMessage) {
        updateFields.push('error_message = ?');
        updateValues.push(errorMessage);
      }
      
      updateValues.push(jobId);
      
      await this.db.execute(
        `UPDATE jobs SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    } catch (error) {
      console.error('Failed to update job status:', error.message);
    }
  }

  async saveResults(jobId, results) {
    const DatabaseValidationService = require('./database-validation');
    
    try {
      for (const result of results) {
        const uniqueKey = result.profileUrl || result.companyUrl || `${result.name}-${Date.now()}`;
        
        // Prepare job data for potential creation
        const jobData = {
          user_id: this.userId || 'system',
          job_name: `Auto-created job for ${jobId}`,
          job_type: result.companyUrl ? 'company_scraping' : 'profile_scraping'
        };
        
        try {
          if (result.companyUrl || result.companyName) {
            // Save company result
            await DatabaseValidationService.safeInsertCompanyResult(
              {
                url: result.companyUrl,
                name: result.companyName || result.name,
                industry: result.industry,
                location: result.location || result.city,
                follower_count: result.followers,
                company_size: result.companySize,
                website: result.website,
                description: result.about || result.description,
                content_validation: result.validation_status || 'unknown'
              },
              jobId,
              jobData
            );
          } else {
            // Save profile result
            await DatabaseValidationService.safeInsertProfileResult(
              {
                url: result.profileUrl,
                full_name: result.name || result.fullName,
                first_name: result.firstName,
                last_name: result.lastName,
                headline: result.title || result.headline,
                about: result.about || result.description,
                country: result.country,
                city: result.city || result.location,
                industry: result.industry,
                email: result.email,
                phone: result.phone,
                website: result.website,
                current_job_title: result.currentJobTitle || result.title,
                current_company_url: result.companyUrl,
                current_company: result.companyName,
                skills: result.skills || [],
                education: result.education || [],
                experience: result.experience || [],
                content_validation: result.validation_status || 'unknown'
              },
              jobId,
              jobData
            );
          }
        } catch (validationError) {
          console.error('Database validation failed, falling back to original method:', validationError);
          
          // Fallback to original method
          const resultId = require('uuid').v4();
          
          await this.db.execute(`
            INSERT INTO profile_results (
              id, job_id, profile_url, full_name, first_name, last_name,
              headline, about, country, city, industry, email, phone, website,
              current_job_title, current_company_url, company_name,
              skills, education, experience, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW(), NOW())
          `, [
            resultId,
            jobId,
            result.profileUrl || result.companyUrl,
            result.name || result.fullName,
            result.firstName,
            result.lastName,
            result.title || result.headline,
            result.about || result.description,
            result.country,
            result.city || result.location,
            result.industry,
            result.email,
            result.phone,
            result.website,
            result.currentJobTitle || result.title,
            result.companyUrl,
            result.companyName,
            JSON.stringify(result.skills || []),
            JSON.stringify(result.education || []),
            JSON.stringify(result.experience || [])
          ]);
        }
      }
    } catch (error) {
      console.error('Failed to save results:', error.message);
    }
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Multi-account job processing methods
  
  async getJobAccounts(job) {
    try {
      const userId = job.user_id;
      
      switch (job.account_selection_mode) {
        case 'manual':
          // Get manually selected accounts
          const selectedIds = JSON.parse(job.selected_account_ids || '[]');
          if (selectedIds.length === 0) {
            return await this.accountsService.getAvailableAccounts(userId);
          }
          
          const [manualAccounts] = await this.db.execute(`
            SELECT * FROM linkedin_accounts 
            WHERE user_id = ? AND id IN (${selectedIds.map(() => '?').join(',')}) AND is_active = 1
          `, [userId, ...selectedIds]);
          
          return manualAccounts.filter(account => this.accountsService.canAccountMakeRequest(account));
          
        case 'auto_rotate':
        case 'load_balance':
        default:
          // Get all available accounts
          return await this.accountsService.getAvailableAccounts(userId);
      }
    } catch (error) {
      console.error('Failed to get job accounts:', error);
      return [];
    }
  }
  
  async createJobAccountAssignments(jobId, accounts) {
    try {
      for (const account of accounts) {
        const assignmentId = require('uuid').v4();
        await this.db.execute(`
          INSERT INTO job_account_assignments (
            id, job_id, account_id, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'assigned', NOW(), NOW())
        `, [assignmentId, jobId, account.id]);
      }
    } catch (error) {
      console.error('Failed to create job account assignments:', error);
    }
  }
  
  async scrapeProfilesMultiAccount(job, config, accounts) {
    console.log('🔄 Starting multi-account profile scraping...');
    
    // Read URLs from uploaded file
    const urls = await this.readUrlsFromFile(config.filePath);
    console.log(`Found ${urls.length} profile URLs to scrape across ${accounts.length} accounts`);
    
    // Distribute URLs across accounts
    const urlDistribution = this.distributeUrlsAcrossAccounts(urls, accounts);
    
    const allResults = [];
    const accountPromises = [];
    
    for (const [accountIndex, account] of accounts.entries()) {
      const accountUrls = urlDistribution[accountIndex] || [];
      if (accountUrls.length === 0) continue;
      
      console.log(`Account ${account.account_name}: ${accountUrls.length} URLs assigned`);
      
      // Process each account concurrently with proper delays
      const accountPromise = this.processAccountUrls(
        job.id, 
        account, 
        accountUrls, 
        'profile',
        (page, url) => this.scrapeLinkedInProfile(page, url)
      );
      
      accountPromises.push(accountPromise);
    }
    
    // Wait for all accounts to complete
    const accountResults = await Promise.allSettled(accountPromises);
    
    // Collect results from all accounts
    accountResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        console.error(`Account ${accounts[index].account_name} failed:`, result.reason);
      }
    });
    
    return allResults;
  }
  
  async scrapeCompaniesMultiAccount(job, config, accounts) {
    console.log('🔄 Starting multi-account company scraping...');
    
    const urls = await this.readUrlsFromFile(config.filePath);
    console.log(`Found ${urls.length} company URLs to scrape across ${accounts.length} accounts`);
    
    const urlDistribution = this.distributeUrlsAcrossAccounts(urls, accounts);
    const allResults = [];
    const accountPromises = [];
    
    for (const [accountIndex, account] of accounts.entries()) {
      const accountUrls = urlDistribution[accountIndex] || [];
      if (accountUrls.length === 0) continue;
      
      console.log(`Account ${account.account_name}: ${accountUrls.length} URLs assigned`);
      
      const accountPromise = this.processAccountUrls(
        job.id,
        account,
        accountUrls,
        'company',
        (page, url) => this.scrapeLinkedInCompany(page, url)
      );
      
      accountPromises.push(accountPromise);
    }
    
    const accountResults = await Promise.allSettled(accountPromises);
    
    accountResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        console.error(`Account ${accounts[index].account_name} failed:`, result.reason);
      }
    });
    
    return allResults;
  }
  
  async scrapeSearchMultiAccount(job, config, accounts) {
    console.log('🔄 Starting multi-account search scraping...');
    
    const searchQuery = job.query;
    const maxResults = job.max_results || 100;
    const resultsPerAccount = Math.ceil(maxResults / accounts.length);
    
    console.log(`Searching for: ${searchQuery} (${resultsPerAccount} results per account)`);
    
    const allResults = [];
    const accountPromises = [];
    
    for (const account of accounts) {
      const accountPromise = this.processAccountSearch(
        job.id,
        account,
        searchQuery,
        resultsPerAccount
      );
      
      accountPromises.push(accountPromise);
    }
    
    const accountResults = await Promise.allSettled(accountPromises);
    
    accountResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        console.error(`Account ${accounts[index].account_name} search failed:`, result.reason);
      }
    });
    
    // Limit to requested max results
    return allResults.slice(0, maxResults);
  }
  
  distributeUrlsAcrossAccounts(urls, accounts) {
    const distribution = {};
    
    // Initialize empty arrays for each account
    accounts.forEach((account, index) => {
      distribution[index] = [];
    });
    
    // Distribute URLs in round-robin fashion
    urls.forEach((url, urlIndex) => {
      const accountIndex = urlIndex % accounts.length;
      distribution[accountIndex].push(url);
    });
    
    return distribution;
  }
  
  async processAccountUrls(jobId, account, urls, actionType, scrapingFunction) {
    const results = [];
    let browser;
    
    try {
      // Update assignment status
      await this.db.execute(`
        UPDATE job_account_assignments 
        SET status = 'processing', assigned_urls_count = ?, started_at = NOW()
        WHERE job_id = ? AND account_id = ?
      `, [urls.length, jobId, account.id]);
      
      // Launch browser with account's proxy
      browser = await this.launchBrowser(account.proxy_url);
      const page = await browser.newPage();
      
      // Set LinkedIn cookie
      await this.setLinkedInCookie(page, this.accountsService.decrypt(account.session_cookie), account.id);
      
      for (let i = 0; i < urls.length; i++) {
        try {
          const url = urls[i].trim();
          if (!url) continue;
          
          console.log(`[${account.account_name}] Scraping ${i + 1}/${urls.length}: ${url}`);
          
          const startTime = Date.now();
          const data = await scrapingFunction(page, url);
          const responseTime = Date.now() - startTime;
          
          if (data) {
            results.push(data);
            
            // Record successful usage
            await this.accountsService.recordUsage(
              account.id, actionType, url, true, responseTime, null, null, jobId
            );
          }
          
          // Random delay based on account settings
          const minDelay = account.min_delay_seconds * 1000;
          const maxDelay = account.max_delay_seconds * 1000;
          await this.randomDelay(minDelay, maxDelay);
          
        } catch (error) {
          console.error(`[${account.account_name}] Failed to scrape ${urls[i]}:`, error.message);
          
          // Record failed usage
          await this.accountsService.recordUsage(
            account.id, actionType, urls[i], false, null, 'SCRAPE_ERROR', error.message, jobId
          );
        }
      }
      
      // Update assignment as completed
      await this.db.execute(`
        UPDATE job_account_assignments 
        SET status = 'completed', processed_urls_count = ?, successful_urls_count = ?, completed_at = NOW()
        WHERE job_id = ? AND account_id = ?
      `, [urls.length, results.length, jobId, account.id]);
      
    } catch (error) {
      console.error(`[${account.account_name}] Account processing failed:`, error.message);
      
      // Update assignment as failed
      await this.db.execute(`
        UPDATE job_account_assignments 
        SET status = 'failed', last_error_message = ?, last_error_at = NOW()
        WHERE job_id = ? AND account_id = ?
      `, [error.message, jobId, account.id]);
      
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    
    return results;
  }
  
  async processAccountSearch(jobId, account, searchQuery, maxResults) {
    let browser;
    
    try {
      // Update assignment status
      await this.db.execute(`
        UPDATE job_account_assignments 
        SET status = 'processing', started_at = NOW()
        WHERE job_id = ? AND account_id = ?
      `, [jobId, account.id]);
      
      browser = await this.launchBrowser(account.proxy_url);
      const page = await browser.newPage();
      
      await this.setLinkedInCookie(page, this.accountsService.decrypt(account.session_cookie), account.id);
      
      const results = await this.searchLinkedIn(page, searchQuery, maxResults);
      
      // Record usage
      await this.accountsService.recordUsage(
        account.id, 'search', null, true, null, null, null, jobId
      );
      
      // Update assignment as completed
      await this.db.execute(`
        UPDATE job_account_assignments 
        SET status = 'completed', successful_urls_count = ?, completed_at = NOW()
        WHERE job_id = ? AND account_id = ?
      `, [results.length, jobId, account.id]);
      
      return results;
      
    } catch (error) {
      console.error(`[${account.account_name}] Search failed:`, error.message);
      
      // Record failed usage
      await this.accountsService.recordUsage(
        account.id, 'search', null, false, null, 'SEARCH_ERROR', error.message, jobId
      );
      
      // Update assignment as failed
      await this.db.execute(`
        UPDATE job_account_assignments 
        SET status = 'failed', last_error_message = ?, last_error_at = NOW()
        WHERE job_id = ? AND account_id = ?
      `, [error.message, jobId, account.id]);
      
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

module.exports = ScrapingService;