/**
 * LinkedIn Cookie Manager
 * Advanced cookie-based authentication with full cookie jar support,
 * proxy integration, and parallel validation
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

class LinkedInCookieManager {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      concurrency: options.concurrency || 3,
      cookiesDir: options.cookiesDir || path.join(__dirname, 'cookies'),
      logLevel: options.logLevel || 'info',
      ...options
    };
    
    this.db = null;
    this.activeBrowsers = new Map();
    this.timers = new Map();
  }

  /**
   * Initialize database connection
   */
  async initDatabase() {
    if (this.db) return this.db;
    
    try {
      this.db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'Krushna_Sutar@0809',
        database: process.env.DB_NAME || 'linkedin_automation'
      });
      
      this.log('info', '✅ Database connected successfully');
      return this.db;
    } catch (error) {
      this.log('error', `❌ Database connection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enhanced logging with timestamps and levels
   */
  log(level, message, accountId = null) {
    const timestamp = new Date().toISOString();
    const prefix = accountId ? `[${accountId}]` : '';
    const logMessage = `${timestamp} ${prefix} ${message}`;
    
    if (level === 'error' || this.options.logLevel === 'debug' || 
        (this.options.logLevel === 'info' && level === 'info')) {
      console.log(logMessage);
    }
  }

  /**
   * Start timer for performance measurement
   */
  startTimer(key) {
    this.timers.set(key, Date.now());
  }

  /**
   * End timer and return elapsed time
   */
  endTimer(key) {
    const startTime = this.timers.get(key);
    if (!startTime) return 0;
    
    const elapsed = Date.now() - startTime;
    this.timers.delete(key);
    return elapsed;
  }

  /**
   * Load cookies from JSON file
   */
  async loadCookiesFromFile(cookieFilePath) {
    try {
      const cookieData = await fs.readFile(cookieFilePath, 'utf8');
      const cookies = JSON.parse(cookieData);
      
      // Validate cookie structure
      if (!Array.isArray(cookies)) {
        throw new Error('Cookies must be an array');
      }
      
      // Ensure required LinkedIn cookies are present
      const requiredCookies = ['li_at'];
      const cookieNames = cookies.map(c => c.name);
      
      for (const required of requiredCookies) {
        if (!cookieNames.includes(required)) {
          throw new Error(`Required cookie '${required}' not found`);
        }
      }
      
      this.log('info', `✅ Loaded ${cookies.length} cookies from ${path.basename(cookieFilePath)}`);
      return cookies;
      
    } catch (error) {
      this.log('error', `❌ Failed to load cookies from ${cookieFilePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create browser context with cookies and proxy
   */
  async createBrowserContext(accountConfig) {
    const { accountId, cookieFile, proxy, userAgent, viewport, locale, timezone } = accountConfig;
    
    this.startTimer(`browser-${accountId}`);
    
    try {
      // Launch browser
      this.log('info', '🚀 Launching browser...', accountId);
      const browser = await chromium.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });
      
      const browserTime = this.endTimer(`browser-${accountId}`);
      this.log('info', `⚡ Browser launched in ${browserTime}ms`, accountId);
      
      // Create context with matching environment
      this.startTimer(`context-${accountId}`);
      
      const contextOptions = {
        userAgent: userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: viewport || { width: 1920, height: 1080 },
        locale: locale || 'en-US',
        timezoneId: timezone || 'America/New_York',
        permissions: ['geolocation'],
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1'
        }
      };
      
      // Add proxy if provided
      if (proxy && proxy.url) {
        contextOptions.proxy = {
          server: proxy.url,
          username: proxy.username,
          password: proxy.password
        };
        this.log('info', `🔗 Using proxy: ${proxy.url}`, accountId);
      }
      
      const context = await browser.newContext(contextOptions);
      const contextTime = this.endTimer(`context-${accountId}`);
      this.log('info', `🌐 Context created in ${contextTime}ms`, accountId);
      
      // Load and inject cookies BEFORE navigation
      this.startTimer(`cookies-${accountId}`);
      
      const cookieFilePath = path.join(this.options.cookiesDir, cookieFile);
      const cookies = await this.loadCookiesFromFile(cookieFilePath);
      
      // Filter and format cookies for Playwright
      const playwrightCookies = cookies
        .filter(cookie => cookie.domain && cookie.name && cookie.value)
        .map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`,
          path: cookie.path || '/',
          expires: cookie.expirationDate ? cookie.expirationDate : undefined,
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false,
          sameSite: cookie.sameSite || 'Lax'
        }));
      
      await context.addCookies(playwrightCookies);
      
      const cookieTime = this.endTimer(`cookies-${accountId}`);
      this.log('info', `🍪 ${playwrightCookies.length} cookies injected in ${cookieTime}ms`, accountId);
      
      // Store browser reference for cleanup
      this.activeBrowsers.set(accountId, { browser, context });
      
      return { browser, context };
      
    } catch (error) {
      this.endTimer(`browser-${accountId}`);
      this.endTimer(`context-${accountId}`);
      this.endTimer(`cookies-${accountId}`);
      
      this.log('error', `❌ Failed to create browser context: ${error.message}`, accountId);
      throw error;
    }
  }

  /**
   * Validate LinkedIn login status
   */
  async validateLogin(page, accountId) {
    this.startTimer(`validation-${accountId}`);
    
    try {
      this.log('info', '🔍 Validating login status...', accountId);
      
      // Navigate directly to LinkedIn feed
      this.startTimer(`navigation-${accountId}`);
      
      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle',
        timeout: this.options.timeout
      });
      
      const navTime = this.endTimer(`navigation-${accountId}`);
      this.log('info', `🌐 Navigation completed in ${navTime}ms`, accountId);
      
      const finalUrl = page.url();
      const statusCode = response.status();
      
      this.log('debug', `Response: ${statusCode}, URL: ${finalUrl}`, accountId);
      
      // Check if redirected to login
      if (finalUrl.includes('/login') || finalUrl.includes('/uas/login') || 
          finalUrl.includes('/checkpoint/challenge')) {
        this.log('info', '❌ Redirected to login - Authentication failed', accountId);
        return {
          isValid: false,
          status: 'INVALID',
          reason: 'Redirected to login page',
          finalUrl,
          statusCode,
          elapsed: this.endTimer(`validation-${accountId}`)
        };
      }
      
      // Wait for feed content to load
      try {
        await page.waitForSelector('.feed-shared-update-v2, .scaffold-layout__sidebar, .global-nav', {
          timeout: 10000
        });
      } catch (waitError) {
        this.log('debug', `Feed elements not found: ${waitError.message}`, accountId);
      }
      
      // Check for authenticated elements
      const authSelectors = [
        '.feed-shared-update-v2',           // Feed posts
        '.scaffold-layout__sidebar',        // Sidebar
        '.global-nav__me',                  // Profile menu
        '[data-test-id="nav-user-menu"]',  // User menu
        '.feed-identity-module',            // Identity module
        '.artdeco-dropdown__trigger'        // Dropdown triggers
      ];
      
      let foundElements = 0;
      const foundSelectors = [];
      
      for (const selector of authSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            foundElements++;
            foundSelectors.push(selector);
            this.log('debug', `✅ Found: ${selector}`, accountId);
          }
        } catch (error) {
          this.log('debug', `❌ Not found: ${selector}`, accountId);
        }
      }
      
      // Check for login form elements (bad signs)
      const loginSelectors = [
        'input[name="session_key"]',
        'input[name="session_password"]',
        '.sign-in-form',
        '.login-form'
      ];
      
      let loginElementsFound = 0;
      for (const selector of loginSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            loginElementsFound++;
            this.log('debug', `🚫 Login element found: ${selector}`, accountId);
          }
        } catch (error) {
          // Expected - no login elements is good
        }
      }
      
      // Determine validation result
      const isValid = foundElements >= 2 && loginElementsFound === 0 && statusCode === 200;
      const validationTime = this.endTimer(`validation-${accountId}`);
      
      const result = {
        isValid,
        status: isValid ? 'ACTIVE' : 'INVALID',
        reason: isValid ? 'Feed accessible with auth elements' : 
                `Insufficient auth elements (${foundElements}/6) or login elements present (${loginElementsFound})`,
        finalUrl,
        statusCode,
        authElementsFound: foundElements,
        loginElementsFound,
        foundSelectors,
        elapsed: validationTime
      };
      
      this.log('info', `${isValid ? '✅' : '❌'} Validation result: ${result.status} (${validationTime}ms)`, accountId);
      this.log('debug', `Auth elements: ${foundElements}, Login elements: ${loginElementsFound}`, accountId);
      
      return result;
      
    } catch (error) {
      const validationTime = this.endTimer(`validation-${accountId}`);
      this.endTimer(`navigation-${accountId}`);
      
      this.log('error', `❌ Validation failed: ${error.message}`, accountId);
      
      return {
        isValid: false,
        status: 'ERROR',
        reason: `Validation error: ${error.message}`,
        error: error.message,
        elapsed: validationTime
      };
    }
  }

  /**
   * Validate single account
   */
  async validateAccount(accountConfig) {
    const { accountId } = accountConfig;
    let browserContext = null;
    
    try {
      this.log('info', '🔍 Starting account validation...', accountId);
      
      // Create browser context with cookies
      browserContext = await this.createBrowserContext(accountConfig);
      const { context } = browserContext;
      
      // Create page
      const page = await context.newPage();
      
      // Validate login
      const validationResult = await this.validateLogin(page, accountId);
      
      // Update database
      await this.updateAccountStatus(accountId, validationResult);
      
      return {
        accountId,
        ...validationResult,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this.log('error', `❌ Account validation failed: ${error.message}`, accountId);
      
      // Update database with error
      await this.updateAccountStatus(accountId, {
        isValid: false,
        status: 'ERROR',
        reason: error.message
      });
      
      return {
        accountId,
        isValid: false,
        status: 'ERROR',
        reason: error.message,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
    } finally {
      // Cleanup browser context
      if (browserContext) {
        await this.closeBrowserContext(accountId);
      }
    }
  }

  /**
   * Validate multiple accounts in parallel
   */
  async validateMultipleAccounts(accountConfigs) {
    this.log('info', `🚀 Starting parallel validation of ${accountConfigs.length} accounts`);
    this.log('info', `Concurrency: ${this.options.concurrency}`);
    
    const startTime = Date.now();
    const results = [];
    
    // Process accounts in batches to control concurrency
    for (let i = 0; i < accountConfigs.length; i += this.options.concurrency) {
      const batch = accountConfigs.slice(i, i + this.options.concurrency);
      this.log('info', `📦 Processing batch ${Math.floor(i / this.options.concurrency) + 1} (${batch.length} accounts)`);
      
      const batchPromises = batch.map(config => this.validateAccount(config));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const config = batch[index];
          this.log('error', `❌ Promise rejected for ${config.accountId}: ${result.reason}`);
          results.push({
            accountId: config.accountId,
            isValid: false,
            status: 'ERROR',
            reason: `Promise rejected: ${result.reason}`,
            error: result.reason,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // Small delay between batches
      if (i + this.options.concurrency < accountConfigs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const totalTime = Date.now() - startTime;
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.filter(r => !r.isValid && r.status !== 'ERROR').length;
    const errorCount = results.filter(r => r.status === 'ERROR').length;
    
    this.log('info', '🎯 Parallel validation complete:');
    this.log('info', `   Total Time: ${totalTime}ms`);
    this.log('info', `   Average Time: ${Math.round(totalTime / results.length)}ms per account`);
    this.log('info', `   ✅ Valid: ${validCount}`);
    this.log('info', `   ❌ Invalid: ${invalidCount}`);
    this.log('info', `   💥 Errors: ${errorCount}`);
    
    return {
      results,
      summary: {
        total: results.length,
        valid: validCount,
        invalid: invalidCount,
        errors: errorCount,
        totalTime,
        averageTime: Math.round(totalTime / results.length)
      }
    };
  }

  /**
   * Update account status in database
   */
  async updateAccountStatus(accountId, validationResult) {
    try {
      await this.initDatabase();
      
      const updateData = {
        validation_status: validationResult.status,
        last_validated_at: new Date(),
        last_error_message: validationResult.reason || null,
        last_error_at: validationResult.isValid ? null : new Date()
      };
      
      // Update consecutive failures
      if (validationResult.isValid) {
        updateData.consecutive_failures = 0;
      } else {
        // Increment consecutive failures
        await this.db.execute(`
          UPDATE linkedin_accounts 
          SET consecutive_failures = consecutive_failures + 1
          WHERE id = ?
        `, [accountId]);
      }
      
      await this.db.execute(`
        UPDATE linkedin_accounts 
        SET validation_status = ?, last_validated_at = ?, 
            last_error_message = ?, last_error_at = ?
        WHERE id = ?
      `, [
        updateData.validation_status,
        updateData.last_validated_at,
        updateData.last_error_message,
        updateData.last_error_at,
        accountId
      ]);
      
      this.log('debug', `📝 Database updated for account ${accountId}`, accountId);
      
    } catch (error) {
      this.log('error', `❌ Failed to update database: ${error.message}`, accountId);
    }
  }

  /**
   * Close browser context and cleanup
   */
  async closeBrowserContext(accountId) {
    try {
      const browserData = this.activeBrowsers.get(accountId);
      if (browserData) {
        const { browser, context } = browserData;
        
        if (context) await context.close();
        if (browser) await browser.close();
        
        this.activeBrowsers.delete(accountId);
        this.log('debug', '🧹 Browser context closed', accountId);
      }
    } catch (error) {
      this.log('error', `⚠️ Cleanup error: ${error.message}`, accountId);
    }
  }

  /**
   * Close all active browsers
   */
  async closeAllBrowsers() {
    this.log('info', '🧹 Closing all active browsers...');
    
    const closePromises = Array.from(this.activeBrowsers.keys()).map(accountId => 
      this.closeBrowserContext(accountId)
    );
    
    await Promise.allSettled(closePromises);
    
    if (this.db) {
      await this.db.end();
      this.db = null;
    }
    
    this.log('info', '✅ All browsers closed and database disconnected');
  }

  /**
   * Get accounts from database for validation
   */
  async getAccountsForValidation(limit = null) {
    try {
      await this.initDatabase();
      
      let query = `
        SELECT id, account_name, session_cookie, proxy_url, proxy_username, proxy_password,
               validation_status, last_validated_at, consecutive_failures
        FROM linkedin_accounts 
        WHERE is_active = 1
        ORDER BY last_validated_at ASC NULLS FIRST
      `;
      
      if (limit) {
        query += ` LIMIT ${limit}`;
      }
      
      const [accounts] = await this.db.execute(query);
      
      return accounts.map(account => ({
        accountId: account.id,
        accountName: account.account_name,
        cookieFile: `${account.id}.json`, // Assumes cookie files are named by account ID
        proxy: account.proxy_url ? {
          url: account.proxy_url,
          username: account.proxy_username,
          password: account.proxy_password
        } : null,
        currentStatus: account.validation_status,
        lastValidated: account.last_validated_at,
        consecutiveFailures: account.consecutive_failures
      }));
      
    } catch (error) {
      this.log('error', `❌ Failed to get accounts: ${error.message}`);
      throw error;
    }
  }
}

module.exports = LinkedInCookieManager;