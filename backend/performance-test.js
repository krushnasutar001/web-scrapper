/**
 * LinkedIn Cookie Validation Performance Testing Script
 * Demonstrates timing measurements, proxy comparison, and parallel processing
 */

const RealLinkedInValidator = require('./services/realLinkedInValidator');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  // Test cookies (replace with real cookies for testing)
  testCookies: [
    {
      accountName: 'TestAccount1',
      liAtCookie: 'AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mPiwZMannH_NVPXf8UzpbLO0_PEH0xLYEp9As3KuIf0C_OsNdZ2gxPBc4DEbk08-HytchRmqAgFVsbfYthSBRx3Kpg2nP7Gjnu4Q83',
      proxyConfig: null // Add proxy config if needed
    },
    {
      accountName: 'TestAccount2', 
      liAtCookie: 'AQEFAREBAAAAABf_5rkAAAGZDyIZyQAAAZkzZ6tDTgAAtHVybjpsaTplbnRlcnByaXNlQXV0aFRva2VuOmVKeGpaQUFDbnRNNVZTQmFQQ0hLRWN5dlc4VEVDR0s0M3RDeEJ6T2l3ajJFR1JnQm1CVUdsZz09',
      proxyConfig: {
        url: 'http://proxy.example.com:8080',
        username: 'proxyuser',
        password: 'proxypass'
      }
    }
  ],
  
  // Performance test settings
  concurrency: 3,
  enableProxyComparison: true,
  testRealCookies: false // Set to true to test with real database cookies
};

class PerformanceTester {
  constructor() {
    this.validator = new RealLinkedInValidator();
    this.db = null;
  }

  async initDatabase() {
    if (!TEST_CONFIG.testRealCookies) return;
    
    try {
      this.db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'linkedin_automation'
      });
      console.log('✅ Database connected for real cookie testing');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      console.log('📝 Falling back to test cookies only');
    }
  }

  async getRealCookies(limit = 5) {
    if (!this.db) return [];
    
    try {
      const [rows] = await this.db.execute(`
        SELECT id, account_name, session_cookie, proxy_url, proxy_username, proxy_password
        FROM linkedin_accounts 
        WHERE is_active = 1 
        LIMIT ?
      `, [limit]);
      
      return rows.map(row => ({
        accountId: row.id,
        accountName: row.account_name,
        liAtCookie: this.decrypt(row.session_cookie), // You'll need to implement decrypt
        proxyConfig: row.proxy_url ? {
          url: row.proxy_url,
          username: row.proxy_username,
          password: row.proxy_password
        } : null
      }));
    } catch (error) {
      console.error('❌ Failed to fetch real cookies:', error.message);
      return [];
    }
  }

  decrypt(encryptedData) {
    // Implement your decryption logic here
    // For now, return as-is (assuming it's already decrypted for testing)
    return encryptedData;
  }

  async runSingleValidationTest() {
    console.log('\n🧪 === SINGLE VALIDATION PERFORMANCE TEST ===');
    
    const testCookie = TEST_CONFIG.testCookies[0];
    console.log(`Testing account: ${testCookie.accountName}`);
    
    const result = await this.validator.validateCookieWithTiming(
      testCookie.liAtCookie,
      testCookie.proxyConfig,
      'test-1',
      testCookie.accountName
    );
    
    console.log('\n📊 Single Validation Results:');
    console.log(`   Final Status: ${result.status}`);
    console.log(`   Total Time: ${result.totalTime}ms`);
    console.log(`   Valid: ${result.isValid}`);
    
    return result;
  }

  async runProxyComparisonTest() {
    console.log('\n🔄 === PROXY COMPARISON TEST ===');
    
    const testCookie = TEST_CONFIG.testCookies.find(c => c.proxyConfig);
    if (!testCookie) {
      console.log('⚠️ No proxy-enabled test cookie found, skipping proxy comparison');
      return;
    }
    
    console.log(`Testing account: ${testCookie.accountName}`);
    
    const result = await this.validator.validateWithProxyComparison(
      testCookie.liAtCookie,
      testCookie.proxyConfig,
      'proxy-test',
      testCookie.accountName
    );
    
    return result;
  }

  async runParallelValidationTest() {
    console.log('\n🚀 === PARALLEL VALIDATION TEST ===');
    
    let testConfigs = [];
    
    // Use real cookies if enabled and available
    if (TEST_CONFIG.testRealCookies) {
      const realCookies = await this.getRealCookies(5);
      if (realCookies.length > 0) {
        testConfigs = realCookies;
        console.log(`Using ${realCookies.length} real cookies from database`);
      }
    }
    
    // Fallback to test cookies
    if (testConfigs.length === 0) {
      testConfigs = TEST_CONFIG.testCookies.map((cookie, index) => ({
        accountId: `test-${index + 1}`,
        accountName: cookie.accountName,
        liAtCookie: cookie.liAtCookie,
        proxyConfig: cookie.proxyConfig
      }));
      console.log(`Using ${testConfigs.length} test cookies`);
    }
    
    // Configure validator
    this.validator.setConcurrency(TEST_CONFIG.concurrency);
    this.validator.setProxyComparison(TEST_CONFIG.enableProxyComparison);
    
    const startTime = Date.now();
    const results = await this.validator.validateMultipleCookiesParallel(
      testConfigs, 
      TEST_CONFIG.concurrency
    );
    const totalTime = Date.now() - startTime;
    
    // Analyze results
    console.log('\n📈 === PARALLEL VALIDATION ANALYSIS ===');
    console.log(`Total Execution Time: ${totalTime}ms`);
    console.log(`Average Time Per Account: ${Math.round(totalTime / results.length)}ms`);
    
    const timingBreakdown = this.analyzeTimings(results);
    console.log('\n⏱️ Timing Breakdown (Average):');
    Object.entries(timingBreakdown).forEach(([step, avgTime]) => {
      console.log(`   ${step}: ${avgTime}ms`);
    });
    
    return results;
  }

  analyzeTimings(results) {
    const breakdown = {};
    const validResults = results.filter(r => r.timings && r.timings.length > 0);
    
    if (validResults.length === 0) return breakdown;
    
    // Calculate average for each timing step
    const stepTotals = {};
    const stepCounts = {};
    
    validResults.forEach(result => {
      result.timings.forEach(timing => {
        if (!stepTotals[timing.label]) {
          stepTotals[timing.label] = 0;
          stepCounts[timing.label] = 0;
        }
        stepTotals[timing.label] += timing.elapsed;
        stepCounts[timing.label]++;
      });
    });
    
    Object.keys(stepTotals).forEach(step => {
      breakdown[step] = Math.round(stepTotals[step] / stepCounts[step]);
    });
    
    return breakdown;
  }

  async runBottleneckAnalysis() {
    console.log('\n🔍 === BOTTLENECK ANALYSIS ===');
    
    const testCookie = TEST_CONFIG.testCookies[0];
    
    // Test 1: No proxy
    console.log('\n📊 Test 1: No Proxy');
    const noProxyResult = await this.validator.validateCookieWithTiming(
      testCookie.liAtCookie,
      null,
      'bottleneck-1',
      `${testCookie.accountName}-NoProxy`
    );
    
    // Test 2: With proxy (if available)
    let proxyResult = null;
    const proxyTestCookie = TEST_CONFIG.testCookies.find(c => c.proxyConfig);
    if (proxyTestCookie) {
      console.log('\n📊 Test 2: With Proxy');
      proxyResult = await this.validator.validateCookieWithTiming(
        proxyTestCookie.liAtCookie,
        proxyTestCookie.proxyConfig,
        'bottleneck-2',
        `${proxyTestCookie.accountName}-WithProxy`
      );
    }
    
    // Analysis
    console.log('\n🎯 === BOTTLENECK IDENTIFICATION ===');
    
    if (noProxyResult.timings) {
      const slowestStep = noProxyResult.timings.reduce((prev, current) => 
        (prev.elapsed > current.elapsed) ? prev : current
      );
      console.log(`Slowest step (No Proxy): ${slowestStep.label} (${slowestStep.elapsed}ms)`);
    }
    
    if (proxyResult && proxyResult.timings) {
      const slowestStep = proxyResult.timings.reduce((prev, current) => 
        (prev.elapsed > current.elapsed) ? prev : current
      );
      console.log(`Slowest step (With Proxy): ${slowestStep.label} (${slowestStep.elapsed}ms)`);
      
      const proxyOverhead = proxyResult.totalTime - noProxyResult.totalTime;
      console.log(`Proxy Overhead: ${proxyOverhead}ms (${Math.round(proxyOverhead / noProxyResult.totalTime * 100)}% increase)`);
    }
    
    // Recommendations
    console.log('\n💡 === PERFORMANCE RECOMMENDATIONS ===');
    
    if (noProxyResult.timings) {
      const browserLaunch = noProxyResult.timings.find(t => t.label === 'Browser Launch');
      const navigation = noProxyResult.timings.find(t => t.label === 'Navigation');
      
      if (browserLaunch && browserLaunch.elapsed > 1000) {
        console.log('⚠️ Browser launch is slow (>1s). Consider browser reuse or faster hardware.');
      }
      
      if (navigation && navigation.elapsed > 3000) {
        console.log('⚠️ LinkedIn navigation is slow (>3s). Check network connectivity or LinkedIn rate limiting.');
      }
      
      if (proxyResult && proxyResult.totalTime > noProxyResult.totalTime * 2) {
        console.log('⚠️ Proxy adds significant overhead (>100%). Consider faster proxy or direct connection.');
      }
    }
  }

  async runAllTests() {
    console.log('🚀 === LINKEDIN VALIDATION PERFORMANCE TESTING ===');
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    try {
      await this.initDatabase();
      
      // Run individual tests
      await this.runSingleValidationTest();
      
      if (TEST_CONFIG.enableProxyComparison) {
        await this.runProxyComparisonTest();
      }
      
      await this.runParallelValidationTest();
      await this.runBottleneckAnalysis();
      
      console.log('\n✅ === ALL TESTS COMPLETED ===');
      console.log(`End Time: ${new Date().toISOString()}`);
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
    } finally {
      if (this.db) {
        await this.db.end();
      }
      await this.validator.cleanup();
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new PerformanceTester();
  tester.runAllTests().catch(console.error);
}

module.exports = PerformanceTester;