const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * Cookie Validation Service for LinkedIn Account Management
 * Handles validation of LinkedIn cookies from JSON files
 */
class CookieValidationService {
  constructor() {
    this.browser = null;
    this.validationTimeout = 30000; // 30 seconds timeout
  }

  /**
   * Initialize browser instance
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
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
      });
    }
    return this.browser;
  }

  /**
   * Validate cookies from a single JSON file
   * @param {string} filePath - Path to the JSON file containing cookies
   * @returns {Promise<Object>} Validation result
   */
  async validateSingleCookieFile(filePath) {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Read and parse JSON file
      const fileContent = await fs.readFile(filePath, 'utf8');
      const cookies = JSON.parse(fileContent);
      
      // Validate the cookies
      const validationResult = await this.validateCookies(cookies, filePath);
      
      return {
        success: validationResult.isValid,
        filePath: filePath,
        accountData: validationResult.accountData,
        error: validationResult.error
      };
    } catch (error) {
      return {
        success: false,
        filePath: filePath,
        error: `Failed to process file: ${error.message}`
      };
    }
  }

  /**
   * Validate cookies from multiple JSON files in a folder
   * @param {string} folderPath - Path to folder containing JSON files
   * @param {number} concurrency - Number of concurrent validations (default: 3)
   * @returns {Promise<Array>} Array of validation results
   */
  async validateMultipleCookieFiles(folderPath, concurrency = 3) {
    try {
      // Check if folder exists
      await fs.access(folderPath);
      
      // Read all files in the folder
      const files = await fs.readdir(folderPath);
      const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
      
      if (jsonFiles.length === 0) {
        throw new Error('No JSON files found in the specified folder');
      }

      // Process files in batches to avoid overwhelming the system
      const results = [];
      for (let i = 0; i < jsonFiles.length; i += concurrency) {
        const batch = jsonFiles.slice(i, i + concurrency);
        const batchPromises = batch.map(file => {
          const filePath = path.join(folderPath, file);
          return this.validateSingleCookieFile(filePath);
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      
      return results;
    } catch (error) {
      throw new Error(`Failed to process folder: ${error.message}`);
    }
  }

  /**
   * Validate LinkedIn cookies by testing access to LinkedIn
   * @param {Array} cookies - Array of cookie objects
   * @param {string} sourcePath - Source file path for reference
   * @returns {Promise<Object>} Validation result with account data
   */
  async validateCookies(cookies, sourcePath) {
    let context = null;
    let page = null;

    try {
      await this.initBrowser();
      
      // Create new browser context
      context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // Add cookies to context
      await context.addCookies(cookies);

      // Create new page
      page = await context.newPage();

      // Set additional headers
      await page.setExtraHTTPHeaders({
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
        timeout: this.validationTimeout
      });

      // Check if the response is successful
      if (!response.ok()) {
        return {
          isValid: false,
          error: `HTTP ${response.status()}: ${response.statusText()}`
        };
      }

      // Wait for page to load and check for LinkedIn-specific elements
      await page.waitForTimeout(2000);

      // Check if we're logged in by looking for specific LinkedIn elements
      const isLoggedIn = await page.evaluate(() => {
        // Check for common LinkedIn logged-in indicators
        const indicators = [
          '.global-nav__me',
          '[data-control-name="nav.settings_and_privacy"]',
          '.feed-identity-module',
          '.artdeco-button--muted.artdeco-button--3.artdeco-dropdown__trigger',
          'button[aria-label*="View profile"]'
        ];
        
        return indicators.some(selector => document.querySelector(selector) !== null);
      });

      if (!isLoggedIn) {
        // Check if we're on login page (indicates invalid cookies)
        const isLoginPage = await page.evaluate(() => {
          return window.location.href.includes('/login') || 
                 document.querySelector('input[name="session_key"]') !== null ||
                 document.querySelector('.login__form') !== null;
        });

        if (isLoginPage) {
          return {
            isValid: false,
            error: 'Cookies are invalid or expired - redirected to login page'
          };
        }
      }

      // Try to extract basic account information
      let accountData = {};
      try {
        accountData = await page.evaluate(() => {
          const nameElement = document.querySelector('.text-heading-xlarge, .break-words, .global-nav__me-photo');
          const profileLink = document.querySelector('a[href*="/in/"]');
          
          return {
            name: nameElement ? nameElement.textContent?.trim() : null,
            profileUrl: profileLink ? profileLink.href : null,
            extractedAt: new Date().toISOString()
          };
        });
      } catch (extractError) {
        console.warn('Could not extract account data:', extractError.message);
      }

      return {
        isValid: true,
        accountData: {
          ...accountData,
          cookieSource: sourcePath,
          validatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      return {
        isValid: false,
        error: `Validation failed: ${error.message}`
      };
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }

  /**
   * Close browser instance
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Extract li_at cookie from cookies array
   * @param {Array} cookies - Array of cookie objects
   * @returns {string|null} li_at cookie value
   */
  extractLiAtCookie(cookies) {
    const liAtCookie = cookies.find(cookie => 
      cookie.name === 'li_at' && cookie.domain && cookie.domain.includes('linkedin.com')
    );
    return liAtCookie ? liAtCookie.value : null;
  }

  /**
   * Validate cookie file format
   * @param {Array} cookies - Parsed cookies array
   * @returns {Object} Validation result
   */
  validateCookieFormat(cookies) {
    if (!Array.isArray(cookies)) {
      return { valid: false, error: 'Cookies must be an array' };
    }

    if (cookies.length === 0) {
      return { valid: false, error: 'Cookies array is empty' };
    }

    // Check for required li_at cookie
    const hasLiAt = cookies.some(cookie => 
      cookie.name === 'li_at' && 
      cookie.value && 
      cookie.domain && 
      cookie.domain.includes('linkedin.com')
    );

    if (!hasLiAt) {
      return { valid: false, error: 'No valid li_at cookie found for LinkedIn domain' };
    }

    // Validate cookie structure
    for (const cookie of cookies) {
      if (!cookie.name || !cookie.value || !cookie.domain) {
        return { 
          valid: false, 
          error: `Invalid cookie structure: missing name, value, or domain for cookie: ${JSON.stringify(cookie)}` 
        };
      }
    }

    return { valid: true };
  }
}

module.exports = CookieValidationService;