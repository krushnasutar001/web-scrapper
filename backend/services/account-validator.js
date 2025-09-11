const { chromium } = require('playwright');
const mysql = require('mysql2/promise');

class AccountValidator {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.validationInterval = 2 * 60 * 60 * 1000; // 2 hours - further reduced to improve performance
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🔍 Account Validator Service Started');
    
    // Start validation worker
    this.runValidationWorker();
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Account Validator Service Stopped');
  }

  async runValidationWorker() {
    while (this.isRunning) {
      try {
        await this.validateAllAccounts();
        await this.sleep(this.validationInterval);
      } catch (error) {
        console.error('❌ Error in validation worker:', error.message);
        await this.sleep(30000); // Wait 30 seconds on error
      }
    }
  }

  async validateAllAccounts() {
    try {
      // Get all accounts that need validation
      const [accounts] = await this.db.execute(`
        SELECT id, account_name as name, session_cookie as cookies, proxy_url, validation_status, last_validated_at
        FROM linkedin_accounts
        WHERE validation_status != 'INVALID' 
        AND (last_validated_at IS NULL OR last_validated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR))
        ORDER BY last_validated_at ASC
        LIMIT 5
      `);

      if (accounts.length === 0) {
        console.log('✅ All accounts are up to date');
        return;
      }

      console.log(`🔍 Validating ${accounts.length} LinkedIn accounts`);

      for (const account of accounts) {
        await this.validateAccount(account);
        // Add delay between validations to avoid rate limiting
        await this.sleep(10000 + Math.random() * 10000);
      }

    } catch (error) {
      console.error('❌ Error validating accounts:', error.message);
    }
  }

  async validateAccount(account) {
    let browser = null;
    
    try {
      console.log(`🔍 Validating account: ${account.name}`);
      
      // Launch browser with account settings
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
      
      // Add proxy if provided
      if (account.proxy_url) {
        launchOptions.proxy = {
          server: account.proxy_url
        };
      }
      
      browser = await chromium.launch(launchOptions);
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      // Add cookies
      if (account.cookies) {
        try {
          const cookieData = typeof account.cookies === 'string' ? 
            JSON.parse(account.cookies) : account.cookies;
          await context.addCookies(cookieData);
        } catch (error) {
          console.error(`❌ Error adding cookies for ${account.name}:`, error.message);
          await this.updateAccountStatus(account.id, 'INVALID', 'Invalid cookie format');
          return;
        }
      }
      
      const page = await context.newPage();
      
      // Navigate to LinkedIn feed to check login status
      console.log(`🌐 Checking login status for: ${account.name}`);
      
      try {
        const response = await page.goto('https://linkedin.com/feed/', { 
          waitUntil: 'networkidle',
          timeout: 30000
        });
        
        // Wait for page to load
        await page.waitForTimeout(5000);
        
        const currentUrl = page.url();
        const pageTitle = await page.title();
        
        console.log(`📍 Current URL: ${currentUrl}`);
        console.log(`📄 Page Title: ${pageTitle}`);
        
        // Check if we're logged in
        const isLoggedIn = await this.checkLoginStatus(page, currentUrl, pageTitle);
        
        if (isLoggedIn) {
          console.log(`✅ Account ${account.name} is ACTIVE`);
          await this.updateAccountStatus(account.id, 'ACTIVE', null);
        } else {
          console.log(`❌ Account ${account.name} is EXPIRED`);
          await this.updateAccountStatus(account.id, 'EXPIRED', 'Redirected to login page');
        }
        
      } catch (error) {
        console.error(`❌ Error checking ${account.name}:`, error.message);
        
        if (error.message.includes('timeout')) {
          await this.updateAccountStatus(account.id, 'EXPIRED', 'Page load timeout');
        } else {
          await this.updateAccountStatus(account.id, 'INVALID', error.message);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error validating account ${account.name}:`, error.message);
      await this.updateAccountStatus(account.id, 'INVALID', error.message);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          console.error('❌ Error closing browser:', error.message);
        }
      }
    }
  }

  async checkLoginStatus(page, currentUrl, pageTitle) {
    // Check URL - if redirected to login, account is expired
    if (currentUrl.includes('/login') || 
        currentUrl.includes('/uas/login') ||
        currentUrl.includes('/checkpoint/challenge')) {
      return false;
    }
    
    // Check page title
    if (pageTitle.toLowerCase().includes('sign in') ||
        pageTitle.toLowerCase().includes('login') ||
        pageTitle.toLowerCase().includes('join linkedin')) {
      return false;
    }
    
    // Check for LinkedIn feed elements
    try {
      // Look for elements that indicate we're logged in
      const feedIndicators = [
        '.feed-container',
        '.scaffold-layout__main',
        '.global-nav',
        '[data-test-id="nav-top-bar"]',
        '.artdeco-button--primary:contains("Start a post")',
        '.share-box-feed-entry__trigger'
      ];
      
      for (const selector of feedIndicators) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`✅ Found logged-in indicator: ${selector}`);
            return true;
          }
        } catch (error) {
          // Continue checking other selectors
        }
      }
      
      // Check for login form elements (indicates not logged in)
      const loginIndicators = [
        'input[name="session_key"]',
        'input[name="session_password"]',
        '.login-form',
        '.sign-in-form'
      ];
      
      for (const selector of loginIndicators) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`❌ Found login indicator: ${selector}`);
            return false;
          }
        } catch (error) {
          // Continue checking other selectors
        }
      }
      
      // If we're on the feed URL and don't see login forms, assume logged in
      if (currentUrl.includes('/feed')) {
        return true;
      }
      
    } catch (error) {
      console.error('❌ Error checking login status:', error.message);
    }
    
    // Default to expired if we can't determine status
    return false;
  }

  async updateAccountStatus(accountId, status, errorMessage = null) {
    try {
      const updateData = [status, new Date()];
      let query = 'UPDATE linkedin_accounts SET validation_status = ?, last_validated_at = ?';
      
      if (errorMessage) {
        query += ', validation_error = ?';
        updateData.push(errorMessage);
      } else {
        query += ', validation_error = NULL';
      }
      
      query += ' WHERE id = ?';
      updateData.push(accountId);
      
      await this.db.execute(query, updateData);
      
    } catch (error) {
      console.error('❌ Error updating account status:', error.message);
    }
  }

  async validateSingleAccount(accountId) {
    try {
      const [accounts] = await this.db.execute(`
        SELECT id, account_name as name, session_cookie as cookies, proxy_url, validation_status
        FROM linkedin_accounts
        WHERE id = ?
      `, [accountId]);
      
      if (accounts.length === 0) {
        throw new Error('Account not found');
      }
      
      await this.validateAccount(accounts[0]);
      
      // Return updated account status
      const [updated] = await this.db.execute(`
        SELECT validation_status, last_validated_at, validation_error
        FROM linkedin_accounts
        WHERE id = ?
      `, [accountId]);
      
      return updated[0];
      
    } catch (error) {
      console.error(`❌ Error validating single account ${accountId}:`, error.message);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AccountValidator;