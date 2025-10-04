const axios = require('axios');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: '../.env' });

/**
 * End-to-End Extension Flow Test
 * Tests the complete flow: Login -> Validate Cookies -> Save Account -> Start Scraping
 */

const BASE_URL = 'http://localhost:5001'; // server.js default port
const TEST_USER = {
  email: 'admin@test.com',
  password: 'admin123'
};

// Mock LinkedIn cookies for testing
const MOCK_LINKEDIN_COOKIES = [
  {
    name: 'li_at',
    value: 'AQEDARIgR2YAAAGLvI3-jAAAAAGBi7yOQAFfQ7z_8XPyBZ2z8eKD',
    domain: '.linkedin.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'None'
  },
  {
    name: 'JSESSIONID',
    value: 'ajax:1234567890123456789',
    domain: '.linkedin.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax'
  },
  {
    name: 'liap',
    value: 'true',
    domain: '.linkedin.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'None'
  }
];

class ExtensionFlowTester {
  constructor() {
    this.authToken = null;
    this.accountId = null;
    this.jobId = null;
  }

  async testFlow() {
    console.log('🚀 Starting Extension End-to-End Flow Test');
    console.log('=' .repeat(60));

    try {
      // Step 1: Authenticate user
      await this.testLogin();
      
      // Step 2: Validate LinkedIn cookies
      await this.testCookieValidation();
      
      // Step 3: Save LinkedIn account
      await this.testAccountCreation();
      
      // Step 4: Start scraping task
      await this.testScrapingStart();
      
      console.log('\n🎉 ALL TESTS PASSED! Extension flow working correctly.');
      console.log('\n📋 SUMMARY:');
      console.log(`✅ User authenticated with token: ${this.authToken?.substring(0, 20)}...`);
      console.log(`✅ Account created with ID: ${this.accountId}`);
      console.log(`✅ Scraping job started with ID: ${this.jobId}`);

    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      console.error('Full error:', error.response?.data || error);
      process.exit(1);
    }
  }

  async testLogin() {
    console.log('\n1️⃣  Testing User Authentication...');
    console.log('-'.repeat(40));

    try {
      const response = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: TEST_USER.email,
        password: TEST_USER.password
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      const data = response.data || {};
      const payload = data.data || data; // some endpoints wrap in { data: { ... } }
      const token = payload.token || payload.accessToken;
      const user = payload.user || data.user;

      if (token) {
        this.authToken = token;
        console.log('✅ Login successful');
        console.log(`   Token: ${this.authToken.substring(0, 30)}...`);
        console.log(`   User: ${user?.name || user?.email || 'Unknown'}`);
      } else {
        throw new Error('No token received in login response');
      }

    } catch (error) {
      if (error.response?.status === 401) {
        console.log('❌ Login failed - User not found or invalid credentials');
        console.log('🔧 Run: node create-user.js to create test user');
      }
      throw error;
    }
  }

  async testCookieValidation() {
    console.log('\n2️⃣  Testing Cookie Validation...');
    console.log('-'.repeat(40));

    // Test both working-server.js endpoint and extension route
    const endpoints = [
      { name: 'Working Server', url: `${BASE_URL}/api/cookies/validate` },
      { name: 'Extension Route', url: `${BASE_URL}/api/extension/validate-account` }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`\n   Testing ${endpoint.name}: ${endpoint.url}`);
        
        const response = await axios.post(endpoint.url, {
          cookies: MOCK_LINKEDIN_COOKIES
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`
          }
        });

        if (response.data?.success) {
          console.log(`   ✅ ${endpoint.name} validation successful`);
          console.log(`      Valid: ${response.data.data?.valid || response.data.isValid}`);
          console.log(`      Message: ${response.data.data?.message || response.data.message}`);
        }

      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ⚠️  ${endpoint.name} endpoint not available (${error.response.status})`);
        } else {
          console.log(`   ❌ ${endpoint.name} validation failed:`, error.response?.data?.message || error.message);
        }
      }
    }
  }

  async testAccountCreation() {
    console.log('\n3️⃣  Testing Account Creation...');
    console.log('-'.repeat(40));

    try {
      // Test extension-style account creation
      const response = await axios.post(`${BASE_URL}/api/linkedin-accounts`, {
        account_name: 'Test LinkedIn Account',
        cookies: MOCK_LINKEDIN_COOKIES
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.data?.success) {
        this.accountId = response.data.account?.id || response.data.data?.id || response.data.id;
        console.log('✅ Account creation successful');
        const accountName = response.data.account?.account_name || response.data.data?.account_name || 'Test LinkedIn Account';
        console.log(`   Account ID: ${this.accountId}`);
        console.log(`   Account Name: ${accountName}`);
      } else {
        throw new Error('Account creation failed - no success flag');
      }

    } catch (error) {
      if (error.response?.status === 409) {
        // Account already exists, try to retrieve it
        console.log('⚠️  Account already exists, fetching existing accounts...');
        
        try {
          const accountsResponse = await axios.get(`${BASE_URL}/api/extension/accounts`, {
            headers: {
              'Authorization': `Bearer ${this.authToken}`
            }
          });
          
          const accounts = accountsResponse.data?.data || accountsResponse.data?.accounts || [];
          if (accounts.length > 0) {
            this.accountId = accounts[0].id;
            console.log('✅ Using existing account');
            console.log(`   Account ID: ${this.accountId}`);
            console.log(`   Account Name: ${accounts[0].account_name}`);
          } else {
            throw new Error('No accounts found after creation conflict');
          }
          
        } catch (fetchError) {
          console.log('❌ Failed to fetch existing accounts:', fetchError.response?.data?.message || fetchError.message);
          throw error;
        }
      } else {
        console.log('❌ Account creation failed:', error.response?.data?.message || error.message);
        throw error;
      }
    }
  }

  async testScrapingStart() {
    console.log('\n4️⃣  Testing Scraping Task Start...');
    console.log('-'.repeat(40));

    try {
      const response = await axios.post(`${BASE_URL}/api/extension/scraping/start`, {
        accountId: this.accountId,
        taskType: 'profile_scraping'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.data?.success) {
        this.jobId = response.data.jobId;
        console.log('✅ Scraping task started successfully');
        console.log(`   Job ID: ${this.jobId}`);
        console.log(`   Task Type: profile_scraping`);
        console.log(`   Account ID: ${this.accountId}`);
      } else {
        throw new Error('Scraping start failed - no success flag');
      }

    } catch (error) {
      console.log('❌ Scraping start failed:', error.response?.data?.message || error.message);
      throw error;
    }
  }

  async checkServerHealth() {
    console.log('\n🏥 Checking Server Health...');
    console.log('-'.repeat(40));

    try {
      const response = await axios.get(`${BASE_URL}/health`);
      console.log('✅ Server is healthy');
      console.log(`   Status: ${response.data.status}`);
      console.log(`   Database: ${response.data.database?.status || 'Unknown'}`);
    } catch (error) {
      console.log('❌ Server health check failed');
      console.log('🔧 Make sure server.js is running on port 5001');
      throw error;
    }
  }
}

// Run the test
async function runTest() {
  const tester = new ExtensionFlowTester();
  
  // Check server health first
  await tester.checkServerHealth();
  
  // Run the complete flow test
  await tester.testFlow();
}

if (require.main === module) {
  runTest().catch((error) => {
    console.error('\n💥 Test execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = ExtensionFlowTester;