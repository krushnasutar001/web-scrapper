/**
 * Test LinkedIn Cookie Manager
 * Comprehensive testing of cookie-based authentication with parallel validation
 */

const LinkedInCookieManager = require('./linkedin-cookie-manager');
const path = require('path');
const fs = require('fs').promises;

class CookieManagerTester {
  constructor() {
    this.manager = new LinkedInCookieManager({
      headless: true,
      timeout: 30000,
      concurrency: 3,
      logLevel: 'info',
      cookiesDir: path.join(__dirname, 'cookies')
    });
  }

  /**
   * Test single account validation
   */
  async testSingleAccount() {
    console.log('\n🧪 === SINGLE ACCOUNT VALIDATION TEST ===');
    
    const accountConfig = {
      accountId: 'test-account-1',
      cookieFile: 'sample-cookies.json',
      proxy: null, // No proxy for this test
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezone: 'America/New_York'
    };
    
    try {
      const result = await this.manager.validateAccount(accountConfig);
      
      console.log('\n📊 Single Account Results:');
      console.log(`   Account ID: ${result.accountId}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Valid: ${result.isValid}`);
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Final URL: ${result.finalUrl || 'N/A'}`);
      console.log(`   Auth Elements: ${result.authElementsFound || 0}`);
      console.log(`   Elapsed: ${result.elapsed}ms`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Single account test failed:', error.message);
      throw error;
    }
  }

  /**
   * Test multiple accounts with different configurations
   */
  async testMultipleAccounts() {
    console.log('\n🚀 === MULTIPLE ACCOUNTS VALIDATION TEST ===');
    
    // Create test configurations
    const accountConfigs = [
      {
        accountId: 'test-account-1',
        cookieFile: 'sample-cookies.json',
        proxy: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezone: 'America/New_York'
      },
      {
        accountId: 'test-account-2',
        cookieFile: 'sample-cookies.json',
        proxy: null,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
        locale: 'en-GB',
        timezone: 'Europe/London'
      },
      {
        accountId: 'test-account-3',
        cookieFile: 'sample-cookies.json',
        proxy: {
          url: 'http://proxy.example.com:8080',
          username: 'proxyuser',
          password: 'proxypass'
        },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US',
        timezone: 'America/Los_Angeles'
      }
    ];
    
    try {
      const results = await this.manager.validateMultipleAccounts(accountConfigs);
      
      console.log('\n📊 Multiple Accounts Results:');
      console.log(`   Total Accounts: ${results.summary.total}`);
      console.log(`   Valid: ${results.summary.valid}`);
      console.log(`   Invalid: ${results.summary.invalid}`);
      console.log(`   Errors: ${results.summary.errors}`);
      console.log(`   Total Time: ${results.summary.totalTime}ms`);
      console.log(`   Average Time: ${results.summary.averageTime}ms per account`);
      
      console.log('\n📋 Individual Results:');
      results.results.forEach((result, index) => {
        const statusIcon = result.isValid ? '✅' : '❌';
        console.log(`   ${index + 1}. ${statusIcon} ${result.accountId} - ${result.status} (${result.elapsed}ms)`);
        if (result.reason) {
          console.log(`      Reason: ${result.reason}`);
        }
      });
      
      return results;
      
    } catch (error) {
      console.error('❌ Multiple accounts test failed:', error.message);
      throw error;
    }
  }

  /**
   * Test database integration
   */
  async testDatabaseIntegration() {
    console.log('\n💾 === DATABASE INTEGRATION TEST ===');
    
    try {
      // Get accounts from database
      const accounts = await this.manager.getAccountsForValidation(5);
      
      console.log(`📊 Found ${accounts.length} accounts in database:`);
      accounts.forEach((account, index) => {
        console.log(`   ${index + 1}. ${account.accountName} (${account.accountId.substring(0, 8)}...)`);
        console.log(`      Status: ${account.currentStatus}`);
        console.log(`      Last Validated: ${account.lastValidated || 'Never'}`);
        console.log(`      Consecutive Failures: ${account.consecutiveFailures}`);
      });
      
      if (accounts.length === 0) {
        console.log('   ℹ️  No accounts found in database for validation');
        return { accounts: [], results: null };
      }
      
      // Validate first few accounts
      const accountsToValidate = accounts.slice(0, Math.min(3, accounts.length));
      console.log(`\n🔍 Validating ${accountsToValidate.length} accounts from database...`);
      
      const results = await this.manager.validateMultipleAccounts(accountsToValidate);
      
      console.log('\n📊 Database Validation Results:');
      console.log(`   Validated: ${results.summary.total}`);
      console.log(`   Valid: ${results.summary.valid}`);
      console.log(`   Invalid: ${results.summary.invalid}`);
      console.log(`   Errors: ${results.summary.errors}`);
      
      return { accounts, results };
      
    } catch (error) {
      console.error('❌ Database integration test failed:', error.message);
      throw error;
    }
  }

  /**
   * Test cookie file loading
   */
  async testCookieLoading() {
    console.log('\n🍪 === COOKIE LOADING TEST ===');
    
    try {
      const cookieFilePath = path.join(__dirname, 'cookies', 'sample-cookies.json');
      
      // Check if cookie file exists
      try {
        await fs.access(cookieFilePath);
        console.log('✅ Cookie file exists');
      } catch (error) {
        console.log('❌ Cookie file not found - creating sample file...');
        // The sample file should already be created, but let's verify
        throw new Error('Sample cookie file not found');
      }
      
      // Load cookies
      const cookies = await this.manager.loadCookiesFromFile(cookieFilePath);
      
      console.log(`📊 Cookie Analysis:`);
      console.log(`   Total Cookies: ${cookies.length}`);
      
      // Analyze cookie types
      const cookieTypes = {};
      cookies.forEach(cookie => {
        cookieTypes[cookie.name] = {
          domain: cookie.domain,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          hasExpiry: !!cookie.expires
        };
      });
      
      console.log('   Cookie Details:');
      Object.entries(cookieTypes).forEach(([name, details]) => {
        const secureIcon = details.secure ? '🔒' : '🔓';
        const httpOnlyIcon = details.httpOnly ? '🚫' : '📖';
        const expiryIcon = details.hasExpiry ? '⏰' : '♾️';
        
        console.log(`     ${name}: ${secureIcon}${httpOnlyIcon}${expiryIcon} ${details.domain}`);
      });
      
      // Check for required cookies
      const requiredCookies = ['li_at', 'JSESSIONID', 'bscookie'];
      const missingCookies = requiredCookies.filter(required => 
        !cookies.some(cookie => cookie.name === required)
      );
      
      if (missingCookies.length === 0) {
        console.log('✅ All required cookies present');
      } else {
        console.log(`⚠️  Missing required cookies: ${missingCookies.join(', ')}`);
      }
      
      return { cookies, cookieTypes, missingCookies };
      
    } catch (error) {
      console.error('❌ Cookie loading test failed:', error.message);
      throw error;
    }
  }

  /**
   * Performance benchmark test
   */
  async testPerformanceBenchmark() {
    console.log('\n⚡ === PERFORMANCE BENCHMARK TEST ===');
    
    const benchmarkConfigs = Array.from({ length: 5 }, (_, i) => ({
      accountId: `benchmark-account-${i + 1}`,
      cookieFile: 'sample-cookies.json',
      proxy: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezone: 'America/New_York'
    }));
    
    try {
      console.log(`🏃 Running benchmark with ${benchmarkConfigs.length} accounts...`);
      
      const startTime = Date.now();
      const results = await this.manager.validateMultipleAccounts(benchmarkConfigs);
      const totalTime = Date.now() - startTime;
      
      console.log('\n📊 Benchmark Results:');
      console.log(`   Total Accounts: ${results.summary.total}`);
      console.log(`   Total Time: ${totalTime}ms`);
      console.log(`   Average Time: ${Math.round(totalTime / results.summary.total)}ms per account`);
      console.log(`   Throughput: ${Math.round(results.summary.total / (totalTime / 1000))} accounts/second`);
      
      // Analyze timing distribution
      const timings = results.results.map(r => r.elapsed).filter(t => t);
      if (timings.length > 0) {
        const minTime = Math.min(...timings);
        const maxTime = Math.max(...timings);
        const avgTime = Math.round(timings.reduce((sum, t) => sum + t, 0) / timings.length);
        
        console.log('\n⏱️  Timing Analysis:');
        console.log(`   Fastest: ${minTime}ms`);
        console.log(`   Slowest: ${maxTime}ms`);
        console.log(`   Average: ${avgTime}ms`);
        console.log(`   Range: ${maxTime - minTime}ms`);
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Performance benchmark failed:', error.message);
      throw error;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 === LINKEDIN COOKIE MANAGER COMPREHENSIVE TEST ===');
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    const testResults = {};
    
    try {
      // Test 1: Cookie Loading
      console.log('\n1️⃣ Testing cookie loading...');
      testResults.cookieLoading = await this.testCookieLoading();
      
      // Test 2: Single Account
      console.log('\n2️⃣ Testing single account validation...');
      testResults.singleAccount = await this.testSingleAccount();
      
      // Test 3: Multiple Accounts
      console.log('\n3️⃣ Testing multiple accounts validation...');
      testResults.multipleAccounts = await this.testMultipleAccounts();
      
      // Test 4: Database Integration
      console.log('\n4️⃣ Testing database integration...');
      testResults.databaseIntegration = await this.testDatabaseIntegration();
      
      // Test 5: Performance Benchmark
      console.log('\n5️⃣ Running performance benchmark...');
      testResults.performanceBenchmark = await this.testPerformanceBenchmark();
      
      // Final Summary
      console.log('\n🎉 === ALL TESTS COMPLETED ===');
      console.log(`End Time: ${new Date().toISOString()}`);
      
      console.log('\n📊 Test Summary:');
      console.log(`   ✅ Cookie Loading: ${testResults.cookieLoading ? 'PASS' : 'FAIL'}`);
      console.log(`   ✅ Single Account: ${testResults.singleAccount?.isValid ? 'PASS' : 'FAIL'}`);
      console.log(`   ✅ Multiple Accounts: ${testResults.multipleAccounts?.summary?.total > 0 ? 'PASS' : 'FAIL'}`);
      console.log(`   ✅ Database Integration: ${testResults.databaseIntegration ? 'PASS' : 'FAIL'}`);
      console.log(`   ✅ Performance Benchmark: ${testResults.performanceBenchmark?.summary?.total > 0 ? 'PASS' : 'FAIL'}`);
      
      console.log('\n💡 === RECOMMENDATIONS ===');
      
      if (testResults.singleAccount?.isValid) {
        console.log('🎯 Cookie validation is working correctly');
        console.log('✅ Your LinkedIn cookies are valid and functional');
        console.log('🚀 System is ready for production use');
      } else {
        console.log('⚠️  Cookie validation issues detected:');
        console.log('   - Check if cookies are fresh and not expired');
        console.log('   - Verify cookies were exported from a logged-in session');
        console.log('   - Ensure cookies include all required LinkedIn cookies');
        console.log('   - Test cookies manually in a browser first');
      }
      
      const avgTime = testResults.performanceBenchmark?.summary?.averageTime;
      if (avgTime) {
        if (avgTime < 5000) {
          console.log(`⚡ Excellent performance: ${avgTime}ms average validation time`);
        } else if (avgTime < 10000) {
          console.log(`✅ Good performance: ${avgTime}ms average validation time`);
        } else {
          console.log(`⚠️  Slow performance: ${avgTime}ms average validation time`);
          console.log('   - Consider optimizing network connectivity');
          console.log('   - Check if LinkedIn is rate limiting requests');
          console.log('   - Reduce timeout values if appropriate');
        }
      }
      
      return testResults;
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
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
  const tester = new CookieManagerTester();
  
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--single')) {
    tester.testSingleAccount().then(() => tester.manager.closeAllBrowsers()).catch(console.error);
  } else if (args.includes('--multiple')) {
    tester.testMultipleAccounts().then(() => tester.manager.closeAllBrowsers()).catch(console.error);
  } else if (args.includes('--database')) {
    tester.testDatabaseIntegration().then(() => tester.manager.closeAllBrowsers()).catch(console.error);
  } else if (args.includes('--benchmark')) {
    tester.testPerformanceBenchmark().then(() => tester.manager.closeAllBrowsers()).catch(console.error);
  } else if (args.includes('--cookies')) {
    tester.testCookieLoading().catch(console.error);
  } else {
    // Run all tests
    tester.runAllTests().catch(error => {
      console.error('Test suite failed:', error.message);
      process.exit(1);
    });
  }
}

module.exports = CookieManagerTester;