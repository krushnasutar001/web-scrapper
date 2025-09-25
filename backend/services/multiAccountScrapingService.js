const PlaywrightCookieValidator = require('./playwrightCookieValidator');
const crypto = require('crypto');

/**
 * Multi-Account LinkedIn Scraping Service
 * Handles parallel scraping across multiple accounts with proper isolation
 */
class MultiAccountScrapingService {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.validator = new PlaywrightCookieValidator();
    this.activeJobs = new Map(); // Track active scraping jobs
    this.accountCooldowns = new Map(); // Track account cooldowns
  }

  /**
   * Start multi-account scraping job
   * @param {string} jobId - Unique job identifier
   * @param {string} userId - User ID
   * @param {Object} scrapingConfig - Scraping configuration
   * @returns {Promise<Object>} Scraping results
   */
  async startScrapingJob(jobId, userId, scrapingConfig) {
    try {
      console.log(`🚀 Starting multi-account scraping job: ${jobId}`);
      
      // Get active accounts for user
      const accounts = await this.getActiveAccounts(userId);
      
      if (accounts.length === 0) {
        throw new Error('No active LinkedIn accounts available for scraping');
      }

      console.log(`📊 Found ${accounts.length} active accounts for scraping`);
      
      // Filter accounts that are not on cooldown
      const availableAccounts = accounts.filter(account => 
        !this.isAccountOnCooldown(account.id)
      );

      if (availableAccounts.length === 0) {
        throw new Error('All accounts are currently on cooldown');
      }

      console.log(`✅ ${availableAccounts.length} accounts available (not on cooldown)`);
      
      // Validate accounts before scraping
      const validatedAccounts = await this.validateAccountsBeforeScraping(availableAccounts);
      
      if (validatedAccounts.length === 0) {
        throw new Error('No valid accounts available after validation');
      }

      console.log(`🔍 ${validatedAccounts.length} accounts validated successfully`);
      
      // Start parallel scraping
      const results = await this.performParallelScraping(
        jobId, 
        validatedAccounts, 
        scrapingConfig
      );
      
      // Update job status in database
      await this.updateJobResults(jobId, results);
      
      return results;
      
    } catch (error) {
      console.error(`❌ Multi-account scraping job ${jobId} failed:`, error);
      throw error;
    }
  }

  /**
   * Get active LinkedIn accounts for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of active accounts
   */
  async getActiveAccounts(userId) {
    try {
      const [accounts] = await this.db.execute(`
        SELECT 
          id, account_name, session_cookie, proxy_url, proxy_type,
          proxy_username, proxy_password, daily_request_limit,
          requests_today, last_request_at, cooldown_until,
          min_delay_seconds, max_delay_seconds, validation_status
        FROM linkedin_accounts 
        WHERE user_id = ? 
          AND is_active = TRUE 
          AND validation_status = 'valid'
          AND (blocked_until IS NULL OR blocked_until < NOW())
        ORDER BY last_request_at ASC, requests_today ASC
      `, [userId]);

      return accounts.map(account => ({
        ...account,
        // Decrypt sensitive data
        session_cookie: this.decrypt(account.session_cookie),
        proxy_password: account.proxy_password ? this.decrypt(account.proxy_password) : null
      }));
    } catch (error) {
      console.error('Failed to get active accounts:', error);
      throw error;
    }
  }

  /**
   * Validate accounts before starting scraping
   * @param {Array} accounts - Array of accounts to validate
   * @returns {Promise<Array>} Array of validated accounts
   */
  async validateAccountsBeforeScraping(accounts) {
    console.log('🔍 Pre-scraping validation of accounts...');
    
    const validationConfigs = accounts.map(account => ({
      liAtCookie: account.session_cookie,
      proxyConfig: this.buildProxyConfig(account),
      accountId: account.id
    }));

    const validationResults = await this.validator.validateMultipleCookies(
      validationConfigs, 
      3 // Max 3 concurrent validations
    );

    const validAccounts = [];
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const validation = validationResults[i];
      
      if (validation.isValid) {
        validAccounts.push(account);
        console.log(`✅ Account ${account.account_name} validated successfully`);
      } else {
        console.log(`❌ Account ${account.account_name} validation failed: ${validation.message}`);
        
        // Update account status in database
        await this.updateAccountValidationStatus(account.id, validation.status, validation.message);
      }
    }

    return validAccounts;
  }

  /**
   * Perform parallel scraping across multiple accounts
   * @param {string} jobId - Job identifier
   * @param {Array} accounts - Validated accounts
   * @param {Object} scrapingConfig - Scraping configuration
   * @returns {Promise<Object>} Scraping results
   */
  async performParallelScraping(jobId, accounts, scrapingConfig) {
    const results = {
      jobId,
      totalAccounts: accounts.length,
      successfulAccounts: 0,
      failedAccounts: 0,
      totalProfiles: 0,
      profiles: [],
      errors: [],
      startTime: new Date(),
      endTime: null
    };

    // Create scraping promises for each account
    const scrapingPromises = accounts.map(account => 
      this.scrapeWithAccount(account, scrapingConfig, jobId)
    );

    // Execute scraping with controlled concurrency
    const scrapingResults = await Promise.allSettled(scrapingPromises);
    
    // Process results
    for (let i = 0; i < scrapingResults.length; i++) {
      const result = scrapingResults[i];
      const account = accounts[i];
      
      if (result.status === 'fulfilled' && result.value.success) {
        results.successfulAccounts++;
        results.totalProfiles += result.value.profiles.length;
        results.profiles.push(...result.value.profiles);
        
        // Update account usage
        await this.updateAccountUsage(account.id);
        
        console.log(`✅ Account ${account.account_name}: ${result.value.profiles.length} profiles scraped`);
      } else {
        results.failedAccounts++;
        const error = result.status === 'rejected' ? result.reason : result.value.error;
        results.errors.push({
          accountId: account.id,
          accountName: account.account_name,
          error: error.message || error
        });
        
        // Handle account errors
        await this.handleAccountError(account.id, error);
        
        console.log(`❌ Account ${account.account_name} failed: ${error.message || error}`);
      }
    }

    results.endTime = new Date();
    results.duration = results.endTime - results.startTime;
    
    console.log(`📊 Scraping completed: ${results.successfulAccounts}/${results.totalAccounts} accounts successful, ${results.totalProfiles} profiles scraped`);
    
    return results;
  }

  /**
   * Scrape LinkedIn with a specific account
   * @param {Object} account - Account configuration
   * @param {Object} scrapingConfig - Scraping parameters
   * @param {string} jobId - Job identifier
   * @returns {Promise<Object>} Scraping result for this account
   */
  async scrapeWithAccount(account, scrapingConfig, jobId) {
    let browser = null;
    let context = null;
    let page = null;
    
    try {
      console.log(`🔍 Starting scraping with account: ${account.account_name}`);
      
      // Create isolated browser context for this account
      const resources = await this.validator.createScrapingContext(
        account.session_cookie,
        this.buildProxyConfig(account),
        account.id
      );
      
      browser = resources.browser;
      context = resources.context;
      page = resources.page;
      
      // Verify session is still valid
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle' });
      
      if (page.url().includes('/login')) {
        throw new Error('Account session expired during scraping');
      }
      
      // Perform LinkedIn search based on configuration
      const profiles = await this.performLinkedInSearch(page, scrapingConfig);
      
      // Add random delay between accounts
      const delay = this.calculateDelay(account.min_delay_seconds, account.max_delay_seconds);
      await this.sleep(delay * 1000);
      
      return {
        success: true,
        accountId: account.id,
        accountName: account.account_name,
        profiles: profiles,
        profileCount: profiles.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Scraping failed for account ${account.account_name}:`, error);
      
      return {
        success: false,
        accountId: account.id,
        accountName: account.account_name,
        error: error,
        timestamp: new Date().toISOString()
      };
    } finally {
      // Clean up resources
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.warn('Error closing page:', e.message);
        }
      }
    }
  }

  /**
   * Perform LinkedIn search and extract profiles
   * @param {Page} page - Playwright page instance
   * @param {Object} scrapingConfig - Search configuration
   * @returns {Promise<Array>} Array of profile data
   */
  async performLinkedInSearch(page, scrapingConfig) {
    const { searchQuery, location, maxResults = 25 } = scrapingConfig;
    
    // Build search URL
    let searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`;
    
    if (location) {
      searchUrl += `&geoUrn=${encodeURIComponent(location)}`;
    }
    
    // Navigate to search results
    await page.goto(searchUrl, { waitUntil: 'networkidle' });
    
    // Wait for search results to load
    await page.waitForSelector('.search-results-container', { timeout: 15000 });
    
    const profiles = [];
    let currentResults = 0;
    
    while (currentResults < maxResults) {
      // Extract profiles from current page
      const pageProfiles = await page.evaluate(() => {
        const profileElements = document.querySelectorAll('.reusable-search__result-container');
        const extractedProfiles = [];
        
        profileElements.forEach(element => {
          try {
            const nameElement = element.querySelector('.entity-result__title-text a');
            const titleElement = element.querySelector('.entity-result__primary-subtitle');
            const locationElement = element.querySelector('.entity-result__secondary-subtitle');
            const imageElement = element.querySelector('.presence-entity__image');
            
            if (nameElement) {
              extractedProfiles.push({
                name: nameElement.textContent.trim(),
                title: titleElement?.textContent.trim() || '',
                location: locationElement?.textContent.trim() || '',
                profileUrl: nameElement.href,
                imageUrl: imageElement?.src || '',
                scrapedAt: new Date().toISOString()
              });
            }
          } catch (e) {
            console.warn('Error extracting profile:', e);
          }
        });
        
        return extractedProfiles;
      });
      
      profiles.push(...pageProfiles);
      currentResults += pageProfiles.length;
      
      // Check if we have enough results or if there are no more pages
      if (currentResults >= maxResults || pageProfiles.length === 0) {
        break;
      }
      
      // Try to load more results (scroll or click next)
      try {
        const nextButton = page.locator('button[aria-label="Next"]');
        if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
          await nextButton.click();
          await page.waitForTimeout(2000); // Wait for new results to load
        } else {
          break; // No more pages
        }
      } catch (e) {
        console.warn('Error navigating to next page:', e);
        break;
      }
    }
    
    return profiles.slice(0, maxResults);
  }

  /**
   * Build proxy configuration object
   * @param {Object} account - Account with proxy settings
   * @returns {Object|null} Proxy configuration
   */
  buildProxyConfig(account) {
    if (!account.proxy_url) {
      return null;
    }
    
    return {
      url: account.proxy_url,
      username: account.proxy_username,
      password: account.proxy_password
    };
  }

  /**
   * Update account validation status in database
   * @param {string} accountId - Account ID
   * @param {string} status - Validation status
   * @param {string} message - Status message
   */
  async updateAccountValidationStatus(accountId, status, message) {
    try {
      await this.db.execute(`
        UPDATE linkedin_accounts 
        SET validation_status = ?, last_validated_at = NOW(), 
            last_error_message = ?, last_error_at = NOW(),
            consecutive_failures = CASE WHEN ? = 'valid' THEN 0 ELSE consecutive_failures + 1 END
        WHERE id = ?
      `, [status, message, status, accountId]);
    } catch (error) {
      console.error('Failed to update account validation status:', error);
    }
  }

  /**
   * Update account usage statistics
   * @param {string} accountId - Account ID
   */
  async updateAccountUsage(accountId) {
    try {
      await this.db.execute(`
        UPDATE linkedin_accounts 
        SET requests_today = requests_today + 1,
            last_request_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
      `, [accountId]);
    } catch (error) {
      console.error('Failed to update account usage:', error);
    }
  }

  /**
   * Handle account errors and set appropriate cooldowns
   * @param {string} accountId - Account ID
   * @param {Error} error - Error that occurred
   */
  async handleAccountError(accountId, error) {
    try {
      let cooldownMinutes = 60; // Default 1 hour cooldown
      let validationStatus = 'invalid';
      
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        cooldownMinutes = 24 * 60; // 24 hours for rate limiting
        validationStatus = 'blocked';
      } else if (error.message.includes('expired') || error.message.includes('login')) {
        validationStatus = 'expired';
      }
      
      await this.db.execute(`
        UPDATE linkedin_accounts 
        SET validation_status = ?,
            consecutive_failures = consecutive_failures + 1,
            last_error_message = ?,
            last_error_at = NOW(),
            cooldown_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
        WHERE id = ?
      `, [validationStatus, error.message, cooldownMinutes, accountId]);
      
    } catch (dbError) {
      console.error('Failed to handle account error:', dbError);
    }
  }

  /**
   * Update job results in database
   * @param {string} jobId - Job ID
   * @param {Object} results - Scraping results
   */
  async updateJobResults(jobId, results) {
    try {
      // Store individual profiles
      // Store profiles in profile_results table
      for (const profile of results.profiles) {
        await this.db.execute(`
          INSERT INTO profile_results (
            id, job_id, profile_url, full_name, headline, 
            city, current_job_title, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', NOW(), NOW())
        `, [
          require('uuid').v4(),
          jobId,
          profile.profileUrl,
          profile.name,
          profile.title,
          profile.location,
          profile.title,
        ]);
      }
      
      // Update job status
      await this.db.execute(`
        UPDATE jobs 
        SET status = 'completed',
            results_count = ?,
            completed_at = NOW()
        WHERE id = ?
      `, [results.totalProfiles, jobId]);
      
    } catch (error) {
      console.error('Failed to update job results:', error);
    }
  }

  /**
   * Check if account is on cooldown
   * @param {string} accountId - Account ID
   * @returns {boolean} True if on cooldown
   */
  isAccountOnCooldown(accountId) {
    return this.accountCooldowns.has(accountId) && 
           this.accountCooldowns.get(accountId) > Date.now();
  }

  /**
   * Calculate random delay between min and max seconds
   * @param {number} minSeconds - Minimum delay
   * @param {number} maxSeconds - Maximum delay
   * @returns {number} Delay in seconds
   */
  calculateDelay(minSeconds, maxSeconds) {
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedText - Encrypted text
   * @returns {string} Decrypted text
   */
  decrypt(encryptedText) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    await this.validator.cleanup();
    this.activeJobs.clear();
    this.accountCooldowns.clear();
  }
}

module.exports = MultiAccountScrapingService;