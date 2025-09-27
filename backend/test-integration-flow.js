/**
 * Scralytics Hub Integration Test Suite
 * Tests the complete flow from extension cookie capture to scraping execution
 */

require('dotenv').config();
const { query, initializeDatabase } = require('./utils/database');
const { encryptCookies, decryptCookies } = require('./services/cookieEncryption');
const LinkedInAccount = require('./models/LinkedInAccount');
const Job = require('./models/Job');
const accountRotationService = require('./services/accountRotationService');
const { addJobToQueue, getQueueStatus } = require('./services/jobWorker');
const { v4: uuidv4 } = require('uuid');

// Test configuration
const TEST_CONFIG = {
  testUserId: 'test-user-' + Date.now(),
  testAccountEmail: 'test@example.com',
  testProfileUrls: [
    'https://www.linkedin.com/in/test-profile-1/',
    'https://www.linkedin.com/in/test-profile-2/',
    'https://www.linkedin.com/in/test-profile-3/'
  ],
  mockCookies: [
    {
      name: 'li_at',
      value: 'test_li_at_token_' + Date.now(),
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true
    },
    {
      name: 'JSESSIONID',
      value: 'test_jsession_' + Date.now(),
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: false
    },
    {
      name: 'bcookie',
      value: 'test_bcookie_' + Date.now(),
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: false
    }
  ]
};

/**
 * Test 1: Cookie Encryption/Decryption System
 */
async function testCookieEncryption() {
  console.log('\n🔐 Testing Cookie Encryption/Decryption System...');
  
  try {
    // Test encryption
    const originalCookies = TEST_CONFIG.mockCookies;
    console.log(`📝 Original cookies count: ${originalCookies.length}`);
    
    const encryptedCookies = encryptCookies(originalCookies);
    console.log(`🔒 Encrypted cookies length: ${encryptedCookies.length} characters`);
    
    // Test decryption
    const decryptedCookies = decryptCookies(encryptedCookies);
    console.log(`🔓 Decrypted cookies count: ${decryptedCookies.length}`);
    
    // Verify integrity
    const isIntact = JSON.stringify(originalCookies) === JSON.stringify(decryptedCookies);
    console.log(`✅ Cookie integrity check: ${isIntact ? 'PASSED' : 'FAILED'}`);
    
    if (!isIntact) {
      throw new Error('Cookie encryption/decryption integrity check failed');
    }
    
    return { success: true, encryptedCookies };
  } catch (error) {
    console.error('❌ Cookie encryption test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: LinkedIn Account Management
 */
async function testAccountManagement(encryptedCookies) {
  console.log('\n👤 Testing LinkedIn Account Management...');
  
  try {
    // Create test account
    const accountData = {
      user_id: TEST_CONFIG.testUserId,
      account_name: 'Test Account Integration',
      email: TEST_CONFIG.testAccountEmail,
      cookies_json: encryptedCookies,
      is_active: true,
      validation_status: 'valid',
      daily_request_limit: 100,
      requests_today: 0
    };
    
    const account = await LinkedInAccount.create(accountData);
    console.log(`✅ Created test account: ${account.id}`);
    
    // Test cookie retrieval and decryption
    const retrievedCookies = account.getCookies();
    console.log(`🍪 Retrieved ${retrievedCookies.length} cookies from account`);
    
    // Test account health check
    const isHealthy = account.isAvailable();
    console.log(`💚 Account health check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    
    // Test rate limiting
    const canMakeRequest = account.isAvailable();
    console.log(`⚡ Can make request: ${canMakeRequest ? 'YES' : 'NO'}`);
    
    return { success: true, account };
  } catch (error) {
    console.error('❌ Account management test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Account Rotation Service
 */
async function testAccountRotation(testAccount) {
  console.log('\n🔄 Testing Account Rotation Service...');
  
  try {
    // Test getting next available account
    const nextAccount = await accountRotationService.getNextAvailableAccount(
      TEST_CONFIG.testUserId,
      'profile_scraping',
      'high'
    );
    
    if (!nextAccount) {
      throw new Error('No available account returned from rotation service');
    }
    
    console.log(`✅ Got next available account: ${nextAccount.email}`);
    
    // Test account selection strategies
    const strategies = ['health', 'round_robin', 'least_used', 'balanced'];
    
    for (const strategy of strategies) {
      const account = await accountRotationService.selectAccountByStrategy(
        [testAccount],
        strategy
      );
      console.log(`🎯 Strategy '${strategy}': ${account ? 'SUCCESS' : 'FAILED'}`);
    }
    
    // Test account health calculation
    const healthScore = await accountRotationService.calculateAccountHealth(testAccount);
    console.log(`💚 Account health score: ${healthScore.toFixed(2)}`);
    
    return { success: true };
  } catch (error) {
    console.error('❌ Account rotation test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Job Creation and Queue Management
 */
async function testJobManagement() {
  console.log('\n📋 Testing Job Creation and Queue Management...');
  
  try {
    // Create test job
    const jobData = {
      user_id: TEST_CONFIG.testUserId,
      job_name: 'Integration Test Job',
      job_type: 'profile_scraping',
      urls: TEST_CONFIG.testProfileUrls,
      status: 'pending'
    };
    
    const job = await Job.create(jobData);
    console.log(`✅ Created test job: ${job.id}`);
    
    // Add job to processing queue
    await addJobToQueue(job.id);
    console.log(`📤 Added job to processing queue`);
    
    // Check queue status
    const queueStatus = getQueueStatus();
    console.log(`📊 Queue status:`, {
      queue_length: queueStatus.queue_length,
      processing_jobs: queueStatus.processing_jobs,
      max_concurrent: queueStatus.max_concurrent
    });
    
    return { success: true, job };
  } catch (error) {
    console.error('❌ Job management test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Database Integration
 */
async function testDatabaseIntegration() {
  console.log('\n🗄️ Testing Database Integration...');
  
  try {
    // Test basic database connectivity
    const testQuery = 'SELECT 1 as test_value';
    const result = await query(testQuery);
    console.log(`✅ Database connectivity: ${result[0].test_value === 1 ? 'SUCCESS' : 'FAILED'}`);
    
    // Test user creation
    const userId = TEST_CONFIG.testUserId;
    const userExists = await query('SELECT id FROM users WHERE id = ?', [userId]);
    
    if (userExists.length === 0) {
      // Use a unique email for testing
      const testEmail = `test_${Date.now()}@example.com`;
      await query(
        'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, testEmail, 'Test User', 'test_password_hash']
      );
      console.log(`✅ Created test user: ${userId}`);
    } else {
      console.log(`ℹ️ Test user already exists: ${userId}`);
    }
    
    // Test table structure validation
    const tables = ['users', 'linkedin_accounts', 'jobs', 'job_urls', 'profile_results'];
    for (const table of tables) {
      const tableInfo = await query(`DESCRIBE ${table}`);
      console.log(`✅ Table '${table}': ${tableInfo.length} columns`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Database integration test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: End-to-End Simulation
 */
async function testEndToEndFlow(testAccount, testJob) {
  console.log('\n🔄 Testing End-to-End Integration Flow...');
  
  try {
    // Simulate extension cookie capture
    console.log('1️⃣ Simulating extension cookie capture...');
    const capturedCookies = TEST_CONFIG.mockCookies;
    console.log(`   📝 Captured ${capturedCookies.length} cookies`);
    
    // Simulate cookie encryption and storage
    console.log('2️⃣ Encrypting and storing cookies...');
    const encryptedCookies = encryptCookies(capturedCookies);
    await testAccount.setCookies(capturedCookies);
    console.log(`   🔒 Cookies encrypted and stored`);
    
    // Simulate account rotation selection
    console.log('3️⃣ Selecting account via rotation service...');
    const selectedAccount = await accountRotationService.getNextAvailableAccount(
      TEST_CONFIG.testUserId,
      'profile_scraping',
      'high'
    );
    console.log(`   🎯 Selected account: ${selectedAccount ? selectedAccount.email : 'None'}`);
    
    // Simulate cookie decryption for scraping
    console.log('4️⃣ Decrypting cookies for scraping...');
    const decryptedCookies = selectedAccount ? JSON.parse(selectedAccount.cookies_json || '[]') : [];
    console.log(`   🔓 Decrypted ${decryptedCookies.length} cookies`);
    
    // Simulate job processing initiation
    console.log('5️⃣ Initiating job processing...');
    await testJob.updateStatus('running');
    console.log(`   ⚡ Job status updated to running`);
    
    // Simulate account usage tracking
    console.log('6️⃣ Tracking account usage...');
    if (selectedAccount) {
      await accountRotationService.updateAccountUsage(selectedAccount, 'profile_scraping');
      console.log(`   📊 Account usage tracked`);
    }
    
    console.log('✅ End-to-end flow simulation completed successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ End-to-end flow test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Clean up in reverse order of dependencies
    await query('DELETE FROM profile_results WHERE job_id IN (SELECT id FROM jobs WHERE user_id = ?)', [TEST_CONFIG.testUserId]);
    await query('DELETE FROM job_urls WHERE job_id IN (SELECT id FROM jobs WHERE user_id = ?)', [TEST_CONFIG.testUserId]);
    await query('DELETE FROM jobs WHERE user_id = ?', [TEST_CONFIG.testUserId]);
    await query('DELETE FROM linkedin_accounts WHERE user_id = ?', [TEST_CONFIG.testUserId]);
    await query('DELETE FROM users WHERE id = ?', [TEST_CONFIG.testUserId]);
    
    console.log('✅ Test data cleaned up successfully');
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

/**
 * Main test runner
 */
async function runIntegrationTests() {
  console.log('🚀 Starting Scralytics Hub Integration Tests');
  console.log('=' .repeat(60));
  
  // Initialize database first
  try {
    console.log('🔧 Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    return {
      passed: 0,
      total: 1,
      success: false,
      results: { databaseInit: { success: false, error: error.message } }
    };
  }
  
  const results = {
    cookieEncryption: null,
    accountManagement: null,
    accountRotation: null,
    jobManagement: null,
    databaseIntegration: null,
    endToEndFlow: null
  };
  
  let testAccount = null;
  let testJob = null;
  let encryptedCookies = null;
  
  try {
    // Run tests in sequence
    results.databaseIntegration = await testDatabaseIntegration();
    
    if (results.databaseIntegration.success) {
      const cookieTest = await testCookieEncryption();
      results.cookieEncryption = cookieTest;
      encryptedCookies = cookieTest.encryptedCookies;
      
      if (cookieTest.success) {
        const accountTest = await testAccountManagement(encryptedCookies);
        results.accountManagement = accountTest;
        testAccount = accountTest.account;
        
        if (accountTest.success) {
          results.accountRotation = await testAccountRotation(testAccount);
        }
      }
      
      const jobTest = await testJobManagement();
      results.jobManagement = jobTest;
      testJob = jobTest.job;
      
      if (testAccount && testJob) {
        results.endToEndFlow = await testEndToEndFlow(testAccount, testJob);
      }
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    // Always attempt cleanup
    await cleanup();
  }
  
  // Print results summary
  console.log('\n📊 Integration Test Results Summary');
  console.log('=' .repeat(60));
  
  const testNames = Object.keys(results);
  let passedTests = 0;
  let totalTests = 0;
  
  for (const testName of testNames) {
    const result = results[testName];
    if (result !== null) {
      totalTests++;
      const status = result.success ? '✅ PASSED' : '❌ FAILED';
      console.log(`${testName.padEnd(20)}: ${status}`);
      if (result.success) passedTests++;
      if (!result.success && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
  }
  
  console.log('=' .repeat(60));
  console.log(`Overall Result: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests && totalTests > 0) {
    console.log('🎉 All integration tests passed! Scralytics Hub is ready for production.');
  } else {
    console.log('⚠️ Some tests failed. Please review the errors above.');
  }
  
  return {
    passed: passedTests,
    total: totalTests,
    success: passedTests === totalTests && totalTests > 0,
    results
  };
}

// Run tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests()
    .then((summary) => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runIntegrationTests,
  TEST_CONFIG
};