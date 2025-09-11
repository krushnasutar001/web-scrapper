const { chromium } = require('playwright');
const crypto = require('crypto');

/**
 * Enhanced LinkedIn Cookie Validation Service using Playwright
 * Supports multi-account browser contexts with proxy isolation
 */
class PlaywrightCookieValidator {
  constructor() {
    this.browsers = new Map(); // Store browser instances per proxy
    this.contexts = new Map(); // Store contexts per account
  }

  /**
   * Validate LinkedIn li_at cookie with optional proxy support
   * @param {string} liAtCookie - The li_at cookie value
   * @param {Object} proxyConfig - Optional proxy configuration
   * @param {string} accountId - Unique account identifier for context isolation
   * @returns {Promise<Object>} Validation result
   */
  async validateCookie(liAtCookie, proxyConfig = null, accountId = null) {
    let browser = null;
    let context = null;
    let page = null;

    try {
      // Generate unique browser key for proxy isolation
      const browserKey = proxyConfig ? 
        crypto.createHash('md5').update(JSON.stringify(proxyConfig)).digest('hex') : 
        'default';

      // Get or create browser instance for this proxy
      browser = await this.getBrowserInstance(browserKey, proxyConfig);
      
      // Create isolated context for this account
      context = await this.createAccountContext(browser, accountId);
      
      // Add LinkedIn cookie to context
      await context.addCookies([{
        name: 'li_at',
        value: liAtCookie,
        domain: '.linkedin.com',
        path: '/'
      }]);

      // Create page and test LinkedIn access
      page = await context.newPage();
      
      // Set realistic headers
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      });

      // Navigate to LinkedIn feed
      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Check current URL and page content
      const currentUrl = page.url();
      const isLoggedIn = !currentUrl.includes('/login') && 
                        !currentUrl.includes('/uas/login') && 
                        !currentUrl.includes('/checkpoint');

      let validationStatus = 'invalid';
      let statusMessage = 'Cookie validation failed';
      
      if (isLoggedIn) {
        // Additional check: look for logged-in indicators
        const hasNavigation = await page.locator('nav[aria-label="Primary Navigation"]').count() > 0;
        const hasProfile = await page.locator('[data-test-global-nav-profile]').count() > 0;
        
        if (hasNavigation || hasProfile) {
          validationStatus = 'valid';
          statusMessage = 'Cookie is valid and user is logged in';
        } else {
          validationStatus = 'expired';
          statusMessage = 'Cookie appears expired or session invalid';
        }
      } else if (response.status() === 429) {
        validationStatus = 'rate_limited';
        statusMessage = 'Rate limited by LinkedIn';
      } else if (currentUrl.includes('/checkpoint')) {
        validationStatus = 'challenge';
        statusMessage = 'Account requires security challenge';
      } else {
        validationStatus = 'invalid';
        statusMessage = 'Cookie is invalid or expired';
      }

      return {
        isValid: validationStatus === 'valid',
        status: validationStatus,
        message: statusMessage,
        url: currentUrl,
        responseStatus: response.status(),
        timestamp: new Date().toISOString(),
        accountId: accountId
      };

    } catch (error) {
      console.error(`Cookie validation error for account ${accountId}:`, error);
      
      return {
        isValid: false,
        status: 'error',
        message: `Validation failed: ${error.message}`,
        error: error.name,
        timestamp: new Date().toISOString(),
        accountId: accountId
      };
    } finally {
      // Clean up page
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.warn('Error closing page:', e.message);
        }
      }
      
      // Clean up context if it's temporary
      if (context && !accountId) {
        try {
          await context.close();
        } catch (e) {
          console.warn('Error closing context:', e.message);
        }
      }
    }
  }

  /**
   * Get or create browser instance for proxy configuration
   * @param {string} browserKey - Unique key for browser instance
   * @param {Object} proxyConfig - Proxy configuration
   * @returns {Promise<Browser>} Browser instance
   */
  async getBrowserInstance(browserKey, proxyConfig) {
    if (this.browsers.has(browserKey)) {
      const browser = this.browsers.get(browserKey);
      if (browser.isConnected()) {
        return browser;
      } else {
        this.browsers.delete(browserKey);
      }
    }

    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };

    // Add proxy configuration if provided
    if (proxyConfig) {
      launchOptions.proxy = {
        server: proxyConfig.url,
        username: proxyConfig.username,
        password: proxyConfig.password
      };
    }

    const browser = await chromium.launch(launchOptions);
    this.browsers.set(browserKey, browser);
    
    return browser;
  }

  /**
   * Create isolated browser context for account
   * @param {Browser} browser - Browser instance
   * @param {string} accountId - Account identifier
   * @returns {Promise<BrowserContext>} Browser context
   */
  async createAccountContext(browser, accountId) {
    if (accountId && this.contexts.has(accountId)) {
      const context = this.contexts.get(accountId);
      if (!context.isClosed) {
        return context;
      } else {
        this.contexts.delete(accountId);
      }
    }

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    if (accountId) {
      this.contexts.set(accountId, context);
    }

    return context;
  }

  /**
   * Validate multiple cookies in parallel
   * @param {Array} cookieConfigs - Array of {liAtCookie, proxyConfig, accountId}
   * @param {number} concurrency - Maximum concurrent validations
   * @returns {Promise<Array>} Array of validation results
   */
  async validateMultipleCookies(cookieConfigs, concurrency = 3) {
    const results = [];
    const chunks = [];
    
    // Split into chunks for controlled concurrency
    for (let i = 0; i < cookieConfigs.length; i += concurrency) {
      chunks.push(cookieConfigs.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(config => 
        this.validateCookie(config.liAtCookie, config.proxyConfig, config.accountId)
      );
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      results.push(...chunkResults.map(r => r.status === 'fulfilled' ? r.value : {
        isValid: false,
        status: 'error',
        message: 'Validation promise rejected',
        error: r.reason?.message || 'Unknown error'
      }));
    }

    return results;
  }

  /**
   * Create browser context for scraping with account isolation
   * @param {string} liAtCookie - LinkedIn cookie
   * @param {Object} proxyConfig - Proxy configuration
   * @param {string} accountId - Account identifier
   * @returns {Promise<{browser, context, page}>} Browser resources
   */
  async createScrapingContext(liAtCookie, proxyConfig, accountId) {
    const browserKey = proxyConfig ? 
      crypto.createHash('md5').update(JSON.stringify(proxyConfig)).digest('hex') : 
      'default';

    const browser = await this.getBrowserInstance(browserKey, proxyConfig);
    const context = await this.createAccountContext(browser, accountId);
    
    // Add LinkedIn cookie
    await context.addCookies([{
      name: 'li_at',
      value: liAtCookie,
      domain: '.linkedin.com',
      path: '/'
    }]);

    const page = await context.newPage();
    
    // Set realistic headers for scraping
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    return { browser, context, page };
  }

  /**
   * Clean up resources for specific account
   * @param {string} accountId - Account identifier
   */
  async cleanupAccount(accountId) {
    if (this.contexts.has(accountId)) {
      const context = this.contexts.get(accountId);
      try {
        await context.close();
      } catch (e) {
        console.warn(`Error closing context for account ${accountId}:`, e.message);
      }
      this.contexts.delete(accountId);
    }
  }

  /**
   * Clean up all browser instances and contexts
   */
  async cleanup() {
    // Close all contexts
    for (const [accountId, context] of this.contexts) {
      try {
        await context.close();
      } catch (e) {
        console.warn(`Error closing context for account ${accountId}:`, e.message);
      }
    }
    this.contexts.clear();

    // Close all browsers
    for (const [browserKey, browser] of this.browsers) {
      try {
        await browser.close();
      } catch (e) {
        console.warn(`Error closing browser ${browserKey}:`, e.message);
      }
    }
    this.browsers.clear();
  }

  /**
   * Get statistics about active resources
   * @returns {Object} Resource statistics
   */
  getStats() {
    return {
      activeBrowsers: this.browsers.size,
      activeContexts: this.contexts.size,
      browserKeys: Array.from(this.browsers.keys()),
      accountIds: Array.from(this.contexts.keys())
    };
  }
}

module.exports = PlaywrightCookieValidator;