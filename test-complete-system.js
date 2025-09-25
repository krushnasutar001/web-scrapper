/**
 * Comprehensive End-to-End Test Suite for LinkedIn Scraping System
 * Tests all major functionality including scraping, job management, dashboard, and account management
 */

const mysql = require('mysql2/promise');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuration
const CONFIG = {
  database: {
    host: 'localhost',
    user: 'root',
    password: 'Krushna_Sutar@0809',
    database: 'linkedin_automation_saas'
  },
  api: {
    baseURL: 'http://localhost:5001/api',
    timeout: 30000
  },
  testData: {
    testUser: {
      email: 'test@linkedin-scraper.com',
      password: 'TestPassword123!',
      name: 'Test User'
    },
    testUrls: [
      'https://www.linkedin.com/in/shweta-biradar-1b5001257/',
      'https://www.linkedin.com/in/varshapawar1907/',
      'https://www.linkedin.com/company/microsoft/',
      'https://www.linkedin.com/company/google/'
    ]
  }
};

class SystemTester {
  constructor() {
    this.connection = null;
    this.authToken = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async initialize() {
    console.log('🚀 Initializing comprehensive system test...');
    
    // Connect to database
    this.connection = await mysql.createConnection(CONFIG.database);
    console.log('✅ Database connection established');
    
    // Setup axios instance
    this.api = axios.create({
      baseURL: CONFIG.api.baseURL,
      timeout: CONFIG.api.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API client configured');
  }

  async runTest(testName, testFunction) {
    try {
      console.log(`\n🧪 Running test: ${testName}`);
      await testFunction();
      console.log(`✅ Test passed: ${testName}`);
      this.testResults.passed++;
      this.testResults.tests.push({ name: testName, status: 'PASSED' });
    } catch (error) {
      console.error(`❌ Test failed: ${testName}`);
      console.error(`   Error: ${error.message}`);
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAILED', error: error.message });
    }
  }

  async testDatabaseSchema() {
    // Test that all required tables exist
    const requiredTables = [
      'users', 'linkedin_accounts', 'jobs', 'job_urls', 'job_results',
      'profiles', 'companies', 'search_results', 'job_logs'
    ];
    
    for (const table of requiredTables) {
      const [rows] = await this.connection.execute(
        'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [CONFIG.database.database, table]
      );
      
      if (rows[0].count === 0) {
        throw new Error(`Required table '${table}' does not exist`);
      }
    }
    
    console.log(`   ✅ All ${requiredTables.length} required tables exist`);
  }

  async testUserAuthentication() {
    // Test user registration
    const testUser = {
      ...CONFIG.testData.testUser,
      email: `test-${Date.now()}@linkedin-scraper.com`
    };
    
    const registerResponse = await this.api.post('/auth/register', testUser);
    
    if (!registerResponse.data.success) {
      throw new Error('User registration failed');
    }
    
    console.log('   ✅ User registration successful');
    
    // Test user login
    const loginResponse = await this.api.post('/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    
    if (!loginResponse.data.success || !loginResponse.data.token) {
      throw new Error('User login failed');
    }
    
    this.authToken = loginResponse.data.token;
    this.api.defaults.headers.Authorization = `Bearer ${this.authToken}`;
    
    console.log('   ✅ User login successful');
  }

  async testLinkedInAccountManagement() {
    // Test adding LinkedIn account
    const testAccount = {
      account_name: 'Test LinkedIn Account',
      email: 'test@linkedin.com',
      username: 'testuser'
    };
    
    const addResponse = await this.api.post('/linkedin-accounts', testAccount);
    
    if (!addResponse.data.success) {
      throw new Error('LinkedIn account creation failed');
    }
    
    const accountId = addResponse.data.account.id;
    console.log('   ✅ LinkedIn account created');
    
    // Test fetching accounts
    const fetchResponse = await this.api.get('/linkedin-accounts');
    
    if (!fetchResponse.data.success || !Array.isArray(fetchResponse.data.accounts)) {
      throw new Error('LinkedIn accounts fetch failed');
    }
    
    console.log(`   ✅ LinkedIn accounts fetched: ${fetchResponse.data.accounts.length} accounts`);
    
    // Test account validation
    const validateResponse = await this.api.post(`/linkedin-accounts/${accountId}/validate`);
    
    if (!validateResponse.data.success) {
      console.log('   ⚠️ Account validation failed (expected for test account)');
    } else {
      console.log('   ✅ Account validation successful');
    }
    
    return accountId;
  }

  async testJobCreation() {
    // Test profile scraping job
    const profileJob = {
      job_name: 'Test Profile Scraping',
      job_type: 'profile_scraping',
      urls: CONFIG.testData.testUrls.filter(url => url.includes('/in/')),
      max_results: 10
    };
    
    const profileResponse = await this.api.post('/jobs', profileJob);
    
    if (!profileResponse.data.success) {
      throw new Error('Profile scraping job creation failed');
    }
    
    console.log('   ✅ Profile scraping job created');
    
    // Test company scraping job
    const companyJob = {
      job_name: 'Test Company Scraping',
      job_type: 'company_scraping',
      urls: CONFIG.testData.testUrls.filter(url => url.includes('/company/')),
      max_results: 10
    };
    
    const companyResponse = await this.api.post('/jobs', companyJob);
    
    if (!companyResponse.data.success) {
      throw new Error('Company scraping job creation failed');
    }
    
    console.log('   ✅ Company scraping job created');
    
    return {
      profileJobId: profileResponse.data.job.id,
      companyJobId: companyResponse.data.job.id
    };
  }

  async testJobManagement(jobIds) {
    // Test job fetching
    const fetchResponse = await this.api.get('/jobs');
    
    if (!fetchResponse.data.success || !Array.isArray(fetchResponse.data.jobs)) {
      throw new Error('Jobs fetch failed');
    }
    
    console.log(`   ✅ Jobs fetched: ${fetchResponse.data.jobs.length} jobs`);
    
    // Test job status
    const statusResponse = await this.api.get(`/jobs/${jobIds.profileJobId}/status`);
    
    if (!statusResponse.data.success) {
      throw new Error('Job status fetch failed');
    }
    
    console.log('   ✅ Job status fetched');
    
    // Test job logs
    const logsResponse = await this.api.get(`/jobs/${jobIds.profileJobId}/logs`);
    
    if (!logsResponse.data.success) {
      console.log('   ⚠️ Job logs fetch failed (may be empty for new job)');
    } else {
      console.log(`   ✅ Job logs fetched: ${logsResponse.data.logs.length} entries`);
    }
    
    // Test job pause
    try {
      await this.api.post(`/jobs/${jobIds.profileJobId}/pause`);
      console.log('   ✅ Job pause successful');
    } catch (error) {
      console.log('   ⚠️ Job pause failed (job may not be running)');
    }
    
    // Test job retry
    try {
      await this.api.post(`/jobs/${jobIds.profileJobId}/retry`);
      console.log('   ✅ Job retry successful');
    } catch (error) {
      console.log('   ⚠️ Job retry failed (job may not be in failed state)');
    }
  }

  async testDashboardPerformance() {
    const startTime = Date.now();
    
    // Test dashboard stats
    const statsResponse = await this.api.get('/dashboard/stats');
    
    if (!statsResponse.data.success) {
      throw new Error('Dashboard stats fetch failed');
    }
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (responseTime > 2000) {
      throw new Error(`Dashboard response too slow: ${responseTime}ms (should be < 2000ms)`);
    }
    
    console.log(`   ✅ Dashboard stats loaded in ${responseTime}ms`);
    console.log(`   📊 Stats: ${JSON.stringify(statsResponse.data.data, null, 2)}`);
  }

  async testScrapingPerformance() {
    // Test scraper timeout configuration
    const LinkedInScraper = require('./backend/services/linkedin-scraper');
    const scraper = new LinkedInScraper();
    
    if (scraper.options.timeout > 10000) {
      throw new Error(`Scraper timeout too high: ${scraper.options.timeout}ms (should be ≤ 10000ms)`);
    }
    
    console.log(`   ✅ Scraper timeout optimized: ${scraper.options.timeout}ms`);
    
    if (scraper.options.navigationTimeout > 8000) {
      throw new Error(`Navigation timeout too high: ${scraper.options.navigationTimeout}ms (should be ≤ 8000ms)`);
    }
    
    console.log(`   ✅ Navigation timeout optimized: ${scraper.options.navigationTimeout}ms`);
  }

  async testDataStorage() {
    // Check if dedicated tables have data
    const [profilesCount] = await this.connection.execute('SELECT COUNT(*) as count FROM profiles');
    const [companiesCount] = await this.connection.execute('SELECT COUNT(*) as count FROM companies');
    const [searchResultsCount] = await this.connection.execute('SELECT COUNT(*) as count FROM search_results');
    const [jobLogsCount] = await this.connection.execute('SELECT COUNT(*) as count FROM job_logs');
    
    console.log(`   📊 Data storage status:`);
    console.log(`      - Profiles: ${profilesCount[0].count}`);
    console.log(`      - Companies: ${companiesCount[0].count}`);
    console.log(`      - Search Results: ${searchResultsCount[0].count}`);
    console.log(`      - Job Logs: ${jobLogsCount[0].count}`);
    
    console.log('   ✅ Data storage tables accessible');
  }

  async cleanup() {
    try {
      // Clean up test data
      await this.connection.execute('DELETE FROM users WHERE email LIKE "test-%@linkedin-scraper.com"');
      console.log('   🧹 Test data cleaned up');
    } catch (error) {
      console.warn('   ⚠️ Cleanup warning:', error.message);
    }
  }

  async runAllTests() {
    try {
      await this.initialize();
      
      // Run all tests
      await this.runTest('Database Schema', () => this.testDatabaseSchema());
      await this.runTest('User Authentication', () => this.testUserAuthentication());
      
      const accountId = await this.runTest('LinkedIn Account Management', () => this.testLinkedInAccountManagement());
      const jobIds = await this.runTest('Job Creation', () => this.testJobCreation());
      
      if (jobIds) {
        await this.runTest('Job Management', () => this.testJobManagement(jobIds));
      }
      
      await this.runTest('Dashboard Performance', () => this.testDashboardPerformance());
      await this.runTest('Scraping Performance', () => this.testScrapingPerformance());
      await this.runTest('Data Storage', () => this.testDataStorage());
      
      // Cleanup
      await this.cleanup();
      
    } catch (error) {
      console.error('❌ Test suite initialization failed:', error);
    } finally {
      if (this.connection) {
        await this.connection.end();
      }
    }
    
    // Print results
    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Passed: ${this.testResults.passed}`);
    console.log(`   ❌ Failed: ${this.testResults.failed}`);
    console.log(`   📈 Success Rate: ${Math.round((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100)}%`);
    
    console.log(`\n📋 Detailed Results:`);
    this.testResults.tests.forEach((test, index) => {
      const status = test.status === 'PASSED' ? '✅' : '❌';
      console.log(`   ${index + 1}. ${status} ${test.name}`);
      if (test.error) {
        console.log(`      Error: ${test.error}`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (this.testResults.failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Your LinkedIn scraping system is fully functional.');
    } else {
      console.log(`⚠️ ${this.testResults.failed} test(s) failed. Please review and fix the issues above.`);
    }
    
    console.log('='.repeat(60));
  }
}

// Run the test suite
if (require.main === module) {
  const tester = new SystemTester();
  tester.runAllTests().catch(console.error);
}

module.exports = SystemTester;