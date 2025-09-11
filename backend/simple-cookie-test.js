/**
 * Simple Cookie Manager Test
 * Tests the core functionality without additional database tables
 */

const LinkedInCookieManager = require('./linkedin-cookie-manager');
const path = require('path');

class SimpleCookieTest {
  constructor() {
    this.manager = new LinkedInCookieManager({
      headless: true,
      timeout: 15000,
      concurrency: 2,
      logLevel: 'info',
      cookiesDir: path.join(__dirname, 'cookies')
    });
  }

  async testCookieLoading() {
    console.log('\n🍪 === TESTING COOKIE LOADING ===');
    
    try {
      const cookieFilePath = path.join(__dirname, 'cookies', 'sample-cookies.json');
      const cookies = await this.manager.loadCookiesFromFile(cookieFilePath);
      
      console.log(`✅ Loaded ${cookies.length} cookies`);
      
      // Show cookie details
      const importantCookies = cookies.filter(c => 
        ['li_at', 'JSESSIONID', 'bscookie', 'bcookie'].includes(c.name)
      );
      
      console.log('Important cookies found:');
      importantCookies.forEach(cookie => {
        console.log(`   - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
      });
      
      return cookies;
      
    } catch (error) {
      console.error('❌ Cookie loading failed:', error.message);
      throw error;
    }
  }

  async testSingleValidation() {
    console.log('\n🧪 === TESTING SINGLE ACCOUNT VALIDATION ===');
    
    const accountConfig = {
      accountId: 'test-simple-validation',
      cookieFile: 'sample-cookies.json',
      proxy: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezone: 'America/New_York'
    };
    
    try {
      console.log(`Testing account: ${accountConfig.accountId}`);
      
      // Create browser context
      const { browser, context } = await this.manager.createBrowserContext(accountConfig);
      
      // Create page
      const page = await context.newPage();
      
      // Validate login
      const result = await this.manager.validateLogin(page, accountConfig.accountId);
      
      console.log('\n📊 Validation Results:');
      console.log(`   Status: ${result.status}`);
      console.log(`   Valid: ${result.isValid}`);
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Final URL: ${result.finalUrl}`);
      console.log(`   Auth Elements: ${result.authElementsFound}`);
      console.log(`   Login Elements: ${result.loginElementsFound}`);
      console.log(`   Elapsed: ${result.elapsed}ms`);
      
      // Cleanup
      await this.manager.closeBrowserContext(accountConfig.accountId);
      
      return result;
      
    } catch (error) {
      console.error('❌ Single validation failed:', error.message);
      await this.manager.closeBrowserContext(accountConfig.accountId);
      throw error;
    }
  }

  async testDatabaseAccounts() {
    console.log('\n💾 === TESTING DATABASE ACCOUNTS ===');
    
    try {
      const accounts = await this.manager.getAccountsForValidation(3);
      
      console.log(`Found ${accounts.length} accounts in database:`);
      accounts.forEach((account, index) => {
        console.log(`   ${index + 1}. ${account.accountName}`);
        console.log(`      Status: ${account.currentStatus}`);
        console.log(`      Cookie File: ${account.cookieFile}`);
        console.log(`      Last Validated: ${account.lastValidated || 'Never'}`);
      });
      
      if (accounts.length > 0) {
        console.log('\n🧪 Testing first account from database...');
        
        // Test first account (but use sample cookies since we don't have real cookie files)
        const testAccount = {
          ...accounts[0],
          cookieFile: 'sample-cookies.json' // Use our sample file
        };
        
        const result = await this.manager.validateAccount(testAccount);
        
        console.log('\n📊 Database Account Test Results:');
        console.log(`   Account: ${result.accountId}`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Valid: ${result.isValid}`);
        console.log(`   Elapsed: ${result.elapsed}ms`);
        
        return { accounts, testResult: result };
      }
      
      return { accounts, testResult: null };
      
    } catch (error) {
      console.error('❌ Database accounts test failed:', error.message);
      throw error;
    }
  }

  async runSimpleTests() {
    console.log('🚀 === SIMPLE LINKEDIN COOKIE MANAGER TEST ===');
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    const results = {};
    
    try {
      // Test 1: Cookie Loading
      console.log('\n1️⃣ Testing cookie loading...');
      results.cookieLoading = await this.testCookieLoading();
      
      // Test 2: Single Validation
      console.log('\n2️⃣ Testing single validation...');
      results.singleValidation = await this.testSingleValidation();
      
      // Test 3: Database Integration
      console.log('\n3️⃣ Testing database integration...');
      results.databaseIntegration = await this.testDatabaseAccounts();
      
      // Summary
      console.log('\n🎉 === SIMPLE TESTS COMPLETED ===');
      console.log(`End Time: ${new Date().toISOString()}`);
      
      console.log('\n📊 Test Summary:');
      console.log(`   ✅ Cookie Loading: ${results.cookieLoading ? 'PASS' : 'FAIL'}`);
      console.log(`   ✅ Single Validation: ${results.singleValidation?.isValid ? 'PASS' : 'FAIL'}`);
      console.log(`   ✅ Database Integration: ${results.databaseIntegration?.accounts?.length > 0 ? 'PASS' : 'FAIL'}`);
      
      console.log('\n💡 === ANALYSIS ===');
      
      if (results.singleValidation?.isValid) {
        console.log('🎯 Cookie validation is working correctly!');
        console.log('✅ Your LinkedIn cookie system is functional');
        console.log('🚀 Ready for production use');
      } else {
        console.log('⚠️  Cookie validation issues detected:');
        console.log(`   Reason: ${results.singleValidation?.reason}`);
        console.log('   - Check if sample cookies are valid');
        console.log('   - Replace with real LinkedIn cookies');
        console.log('   - Ensure cookies are not expired');
      }
      
      const validationTime = results.singleValidation?.elapsed;
      if (validationTime) {
        if (validationTime < 10000) {
          console.log(`⚡ Excellent performance: ${validationTime}ms validation time`);
        } else if (validationTime < 20000) {
          console.log(`✅ Good performance: ${validationTime}ms validation time`);
        } else {
          console.log(`⚠️  Slow performance: ${validationTime}ms validation time`);
        }
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Simple tests failed:', error.message);
      throw error;
      
    } finally {
      // Cleanup
      console.log('\n🧹 Cleaning up...');
      await this.manager.closeAllBrowsers();
      console.log('✅ Cleanup completed');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new SimpleCookieTest();
  
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--cookies')) {
    tester.testCookieLoading().catch(console.error);
  } else if (args.includes('--single')) {
    tester.testSingleValidation().then(() => tester.manager.closeAllBrowsers()).catch(console.error);
  } else if (args.includes('--database')) {
    tester.testDatabaseAccounts().then(() => tester.manager.closeAllBrowsers()).catch(console.error);
  } else {
    // Run all simple tests
    tester.runSimpleTests().catch(error => {
      console.error('Simple tests failed:', error.message);
      process.exit(1);
    });
  }
}

module.exports = SimpleCookieTest;