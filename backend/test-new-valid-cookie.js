/**
 * Test New Valid LinkedIn Cookie
 * Comprehensive validation and debugging for pending status issue
 */

const OptimizedLinkedInValidator = require('./optimized-validator');
const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// New LinkedIn cookie provided by user
const NEW_VALID_COOKIE = 'AQEDAVIYJnMEMkOTAAABmR7Mn30AAAGZQtkjfU0AKhtt5629U5o1HPZck8LzDXMnFQAKSr8afXu6UsGc2nXzPQ6QvIAHSxCanTYAp2Y-WWzSEhdIkRifsIm3jT8RM3mMJNGl3NpnYnDT7jWeQshZGih2';

class NewCookieValidator {
  constructor() {
    this.validator = new OptimizedLinkedInValidator();
    this.validator.setHttpFirst(true);
    this.validator.setTimeouts(5000, 15000);
    this.db = null;
  }

  async initDatabase() {
    try {
      this.db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'Krushna_Sutar@0809',
        database: process.env.DB_NAME || 'linkedin_automation'
      });
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  encrypt(text) {
    return Buffer.from(text).toString('base64');
  }

  /**
   * Comprehensive cookie validation test
   */
  async validateNewCookie() {
    console.log('🔍 === NEW LINKEDIN COOKIE VALIDATION ===');
    console.log(`Cookie: ${NEW_VALID_COOKIE.substring(0, 20)}...${NEW_VALID_COOKIE.substring(NEW_VALID_COOKIE.length - 10)}`);
    console.log(`Cookie Length: ${NEW_VALID_COOKIE.length} characters`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    try {
      // Step 1: HTTP Validation Test
      console.log('\n🚀 Step 1: HTTP Validation Test');
      const httpStart = Date.now();
      
      const httpResult = await this.validator.validateCookie(
        NEW_VALID_COOKIE,
        null,
        'NewValidCookie-HTTP'
      );
      
      const httpTime = Date.now() - httpStart;
      
      console.log('📊 HTTP Validation Results:');
      console.log(`   Status: ${httpResult.status}`);
      console.log(`   Method: ${httpResult.method}`);
      console.log(`   Valid: ${httpResult.isValid}`);
      console.log(`   Time: ${httpTime}ms`);
      console.log(`   Message: ${httpResult.message}`);
      
      if (httpResult.isValid) {
        console.log('   ✅ HTTP validation shows cookie is ACTIVE');
      } else {
        console.log('   ❌ HTTP validation shows cookie is INVALID');
        console.log('   🔍 This explains why accounts show as pending');
      }
      
      // Step 2: Playwright Browser Validation
      console.log('\n🌐 Step 2: Playwright Browser Validation');
      const browserResult = await this.validateWithPlaywright();
      
      console.log('📊 Browser Validation Results:');
      console.log(`   Status: ${browserResult.status}`);
      console.log(`   Valid: ${browserResult.isValid}`);
      console.log(`   Time: ${browserResult.elapsed}ms`);
      console.log(`   Final URL: ${browserResult.finalUrl}`);
      console.log(`   Elements Found: ${browserResult.elementsFound}`);
      
      // Step 3: Database Status Check
      console.log('\n💾 Step 3: Database Status Investigation');
      await this.investigateDatabaseStatus();
      
      // Step 4: Create Test Account
      console.log('\n📝 Step 4: Create Test Account with New Cookie');
      const accountResult = await this.createTestAccount(httpResult.status);
      
      // Step 5: Analyze Pending Status Issue
      console.log('\n🔍 Step 5: Pending Status Analysis');
      await this.analyzePendingIssue(httpResult, browserResult, accountResult);
      
      return {
        httpResult,
        browserResult,
        accountResult,
        overallValid: httpResult.isValid && browserResult.isValid
      };
      
    } catch (error) {
      console.error('\n❌ === VALIDATION FAILED ===');
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      throw error;
    } finally {
      if (this.db) {
        await this.db.end();
      }
    }
  }

  /**
   * Validate cookie using Playwright with detailed logging
   */
  async validateWithPlaywright() {
    const startTime = Date.now();
    let browser = null;
    let context = null;
    let page = null;
    
    try {
      console.log('   🚀 Launching browser...');
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-blink-features=AutomationControlled'
        ]
      });
      
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });
      
      page = await context.newPage();
      
      console.log('   🍪 Injecting cookie...');
      await context.addCookies([{
        name: 'li_at',
        value: NEW_VALID_COOKIE,
        domain: '.linkedin.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      }]);
      
      console.log('   🌐 Navigating to LinkedIn feed...');
      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle',
        timeout: 15000
      });
      
      console.log(`   📊 Response Status: ${response.status()}`);
      
      const finalUrl = page.url();
      console.log(`   🔗 Final URL: ${finalUrl}`);
      
      // Check for authentication elements
      const authElements = [
        '.feed-identity-module',
        '[data-test-id="nav-user-menu"]',
        '.global-nav__me',
        '.feed-shared-update-v2',
        '.scaffold-layout__sidebar'
      ];
      
      let foundElements = [];
      for (const selector of authElements) {
        try {
          const element = await page.$(selector);
          if (element) {
            foundElements.push(selector);
            console.log(`   ✅ Found: ${selector}`);
          }
        } catch (error) {
          console.log(`   ❌ Not found: ${selector}`);
        }
      }
      
      // Check for login indicators
      const loginElements = [
        'input[name="session_key"]',
        'input[name="session_password"]',
        '.sign-in-form'
      ];
      
      let loginFound = false;
      for (const selector of loginElements) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`   🚫 Login element found: ${selector}`);
            loginFound = true;
          }
        } catch (error) {
          // Expected - no login elements is good
        }
      }
      
      const isValid = !finalUrl.includes('/login') && !loginFound && foundElements.length > 0;
      
      return {
        isValid,
        status: isValid ? 'ACTIVE' : 'INVALID',
        finalUrl,
        elementsFound: foundElements.length,
        loginElementsFound: loginFound,
        elapsed: Date.now() - startTime
      };
      
    } catch (error) {
      console.log(`   ❌ Browser validation failed: ${error.message}`);
      return {
        isValid: false,
        status: 'ERROR',
        error: error.message,
        elapsed: Date.now() - startTime
      };
    } finally {
      try {
        if (page) await page.close();
        if (context) await context.close();
        if (browser) await browser.close();
      } catch (cleanupError) {
        console.error('⚠️  Cleanup error:', cleanupError.message);
      }
    }
  }

  /**
   * Investigate database status and pending accounts
   */
  async investigateDatabaseStatus() {
    try {
      await this.initDatabase();
      
      // Check all accounts and their statuses
      const [allAccounts] = await this.db.execute(`
        SELECT id, account_name, validation_status, is_active, 
               created_at, last_validated_at, last_error_message
        FROM linkedin_accounts
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      console.log(`   📊 Found ${allAccounts.length} recent accounts:`);
      
      let pendingCount = 0;
      let activeCount = 0;
      let invalidCount = 0;
      
      allAccounts.forEach((account, index) => {
        const statusIcon = account.validation_status === 'ACTIVE' ? '✅' : 
                          account.validation_status === 'INVALID' ? '❌' : 
                          account.validation_status === 'pending' ? '⏳' : '❓';
        
        console.log(`   ${index + 1}. ${statusIcon} ${account.account_name} - ${account.validation_status}`);
        
        if (account.validation_status === 'pending') pendingCount++;
        else if (account.validation_status === 'ACTIVE') activeCount++;
        else if (account.validation_status === 'INVALID') invalidCount++;
        
        if (account.last_error_message) {
          console.log(`      Error: ${account.last_error_message}`);
        }
      });
      
      console.log(`   📈 Status Summary:`);
      console.log(`      ⏳ Pending: ${pendingCount}`);
      console.log(`      ✅ Active: ${activeCount}`);
      console.log(`      ❌ Invalid: ${invalidCount}`);
      
      if (pendingCount > 0) {
        console.log('   ⚠️  Found pending accounts - investigating causes...');
        
        // Check if validation process is running
        const [pendingAccounts] = await this.db.execute(`
          SELECT id, account_name, created_at, last_validated_at
          FROM linkedin_accounts
          WHERE validation_status = 'pending'
          ORDER BY created_at DESC
        `);
        
        pendingAccounts.forEach(account => {
          const createdAgo = Date.now() - new Date(account.created_at).getTime();
          const lastValidatedAgo = account.last_validated_at ? 
            Date.now() - new Date(account.last_validated_at).getTime() : null;
          
          console.log(`      📝 ${account.account_name}:`);
          console.log(`         Created: ${Math.round(createdAgo / 1000)}s ago`);
          if (lastValidatedAgo) {
            console.log(`         Last validated: ${Math.round(lastValidatedAgo / 1000)}s ago`);
          } else {
            console.log(`         Never validated - this is the issue!`);
          }
        });
      }
      
    } catch (error) {
      console.error('   ❌ Database investigation failed:', error.message);
    }
  }

  /**
   * Create test account with new cookie
   */
  async createTestAccount(validationStatus) {
    try {
      await this.initDatabase();
      
      const accountId = uuidv4();
      const userId = '0e5719e5-009c-4e99-b50c-b2730f659d55'; // Use existing user ID
      const accountName = `TestNewCookie_${Date.now()}`;
      const encryptedCookie = this.encrypt(NEW_VALID_COOKIE);
      
      console.log(`   📝 Creating account: ${accountName}`);
      
      const [result] = await this.db.execute(`
        INSERT INTO linkedin_accounts (
          id, user_id, account_name, email, session_cookie,
          validation_status, is_active, created_at, last_validated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        accountId,
        userId,
        accountName,
        'newcookie@test.com',
        encryptedCookie,
        validationStatus, // Use the validation result
        1
      ]);
      
      console.log(`   ✅ Account created with status: ${validationStatus}`);
      console.log(`   📋 Account ID: ${accountId}`);
      
      // Verify the account was created correctly
      const [createdAccount] = await this.db.execute(`
        SELECT id, account_name, validation_status, created_at
        FROM linkedin_accounts
        WHERE id = ?
      `, [accountId]);
      
      if (createdAccount.length > 0) {
        console.log(`   ✅ Verification: Account exists with status ${createdAccount[0].validation_status}`);
        return {
          success: true,
          accountId,
          accountName,
          status: createdAccount[0].validation_status
        };
      } else {
        console.log(`   ❌ Verification failed: Account not found`);
        return { success: false, error: 'Account not found after creation' };
      }
      
    } catch (error) {
      console.error(`   ❌ Account creation failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze why accounts might show as pending
   */
  async analyzePendingIssue(httpResult, browserResult, accountResult) {
    console.log('\n🔍 === PENDING STATUS ROOT CAUSE ANALYSIS ===');
    
    // Check if validation is working
    if (httpResult.isValid && browserResult.isValid) {
      console.log('✅ Cookie validation is working correctly');
      console.log('   - HTTP validation: ACTIVE');
      console.log('   - Browser validation: ACTIVE');
      
      if (accountResult.success && accountResult.status === 'ACTIVE') {
        console.log('✅ Account creation is working correctly');
        console.log('   - Account created with ACTIVE status immediately');
        console.log('   - No pending status issue detected');
      } else {
        console.log('❌ Account creation issue detected:');
        console.log(`   - Account status: ${accountResult.status || 'ERROR'}`);
        console.log('   - This could cause pending status in UI');
      }
    } else {
      console.log('❌ Cookie validation issues detected:');
      if (!httpResult.isValid) {
        console.log('   - HTTP validation failed');
        console.log(`   - HTTP status: ${httpResult.status}`);
        console.log(`   - HTTP message: ${httpResult.message}`);
      }
      if (!browserResult.isValid) {
        console.log('   - Browser validation failed');
        console.log(`   - Browser status: ${browserResult.status}`);
        console.log(`   - Final URL: ${browserResult.finalUrl}`);
      }
      console.log('   🔍 This explains pending status - validation is failing');
    }
    
    console.log('\n💡 === RECOMMENDATIONS ===');
    
    if (httpResult.isValid && browserResult.isValid) {
      console.log('🎉 GOOD NEWS: Your cookie is VALID!');
      console.log('✅ Cookie works with both HTTP and browser validation');
      console.log('✅ Accounts should show as ACTIVE immediately');
      console.log('');
      console.log('🔧 If you\'re still seeing pending status:');
      console.log('1. Check frontend auto-refresh is working (5-second intervals)');
      console.log('2. Clear browser cache and reload the page');
      console.log('3. Check network tab for failed API requests');
      console.log('4. Verify backend validation process is running');
    } else {
      console.log('⚠️  COOKIE ISSUES DETECTED:');
      
      if (!httpResult.isValid) {
        console.log('❌ HTTP validation failed:');
        console.log('   - Cookie may be expired or invalid');
        console.log('   - LinkedIn may be blocking automated requests');
        console.log('   - Try getting a fresh cookie from manual login');
      }
      
      if (!browserResult.isValid) {
        console.log('❌ Browser validation failed:');
        console.log('   - Cookie may not work in automated browser');
        console.log('   - LinkedIn may have detected automation');
        console.log('   - Try using the cookie in a regular browser first');
      }
      
      console.log('\n🔧 FIXES:');
      console.log('1. Get a fresh cookie from a manual LinkedIn login');
      console.log('2. Use incognito/private browsing when getting the cookie');
      console.log('3. Avoid using cookies from automated/bot sessions');
      console.log('4. Test the cookie manually in browser before automation');
    }
    
    console.log('\n📊 === VALIDATION SUMMARY ===');
    console.log(`HTTP Validation: ${httpResult.isValid ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Browser Validation: ${browserResult.isValid ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Account Creation: ${accountResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Overall Status: ${httpResult.isValid && browserResult.isValid ? '✅ COOKIE IS VALID' : '❌ COOKIE HAS ISSUES'}`);
  }
}

// Run validation test
if (require.main === module) {
  const validator = new NewCookieValidator();
  
  async function runValidation() {
    try {
      console.log('🚀 === NEW LINKEDIN COOKIE VALIDATION TEST ===');
      console.log('Testing if cookie is valid and investigating pending status...');
      console.log('');
      
      const result = await validator.validateNewCookie();
      
      console.log('\n🏁 === FINAL RESULTS ===');
      if (result.overallValid) {
        console.log('🎉 SUCCESS: Cookie is VALID and working!');
        console.log('✅ Your cookie should create ACTIVE accounts immediately');
        console.log('✅ No pending status issues detected');
      } else {
        console.log('⚠️  ISSUES DETECTED: Cookie validation failed');
        console.log('❌ This explains why accounts show as pending');
        console.log('🔧 Follow the recommendations above to fix the issues');
      }
      
    } catch (error) {
      console.error('❌ Validation test failed:', error.message);
      process.exit(1);
    }
  }
  
  runValidation();
}

module.exports = NewCookieValidator;