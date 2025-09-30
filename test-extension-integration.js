/**
 * Test script for Extension-Backend Integration
 * This script tests the new extension API endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5001';
const API_BASE = `${BASE_URL}/api`;

// Test configuration
const testConfig = {
  email: 'test@example.com',
  password: 'testpassword123'
};

// Test account data with unique timestamp to avoid duplicates
const timestamp = Date.now();
const testAccount = {
  account_name: `Test LinkedIn Account ${timestamp}`,
  email: `linkedin.test.${timestamp}@example.com`,
  cookies_json: [
    {
      name: 'li_at',
      value: 'test_cookie_value_123',
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true
    }
  ]
};

let authToken = null;
let createdAccountId = null;

/**
 * Helper function to make authenticated requests
 */
async function makeRequest(method, endpoint, data = null) {
  const config = {
    method,
    url: `${API_BASE}${endpoint}`,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message, 
      status: error.response?.status 
    };
  }
}

/**
 * Test user authentication
 */
async function testAuthentication() {
  console.log('\n🔐 Testing Authentication...');
  
  // Try to login (assuming user exists)
  const loginResult = await makeRequest('POST', '/auth/login', testConfig);
  
  if (loginResult.success) {
    authToken = loginResult.data.data?.accessToken || loginResult.data.data?.token || loginResult.data.token;
    console.log('✅ Authentication successful');
    console.log('🔑 Token received:', authToken ? 'Yes' : 'No');
    return true;
  } else {
    console.log('❌ Authentication failed:', loginResult.error);
    console.log('ℹ️  Note: Make sure a test user exists or create one first');
    return false;
  }
}

/**
 * Test getting accounts via extension API
 */
async function testGetAccounts() {
  console.log('\n📋 Testing Get Accounts...');
  
  const result = await makeRequest('GET', '/extension/accounts');
  
  if (result.success) {
    console.log('✅ Get accounts successful');
    console.log(`   Found ${result.data.total} accounts`);
    return true;
  } else {
    console.log('❌ Get accounts failed:', result.error);
    return false;
  }
}

/**
 * Test adding account via extension API
 */
async function testAddAccount() {
  console.log('\n➕ Testing Add Account...');
  
  const result = await makeRequest('POST', '/extension/accounts', testAccount);
  
  if (result.success) {
    createdAccountId = result.data.account.id;
    console.log('✅ Add account successful');
    console.log(`   Created account ID: ${createdAccountId}`);
    return true;
  } else {
    console.log('❌ Add account failed:', result.error);
    return false;
  }
}

/**
 * Test updating account via extension API
 */
async function testUpdateAccount() {
  if (!createdAccountId) {
    console.log('\n⚠️  Skipping update test - no account created');
    return false;
  }

  console.log('\n🔄 Testing Update Account...');
  
  const updateData = {
    account_name: `Updated Test LinkedIn Account ${timestamp}`,
    email: `updated.linkedin.test.${timestamp}@example.com`
  };
  
  const result = await makeRequest('PUT', `/extension/accounts/${createdAccountId}`, updateData);
  
  if (result.success) {
    console.log('✅ Update account successful');
    console.log(`   Updated account: ${result.data.account.account_name}`);
    return true;
  } else {
    console.log('❌ Update account failed:', result.error);
    return false;
  }
}

/**
 * Test validating account via extension API
 */
async function testValidateAccount() {
  if (!createdAccountId) {
    console.log('\n⚠️  Skipping validation test - no account created');
    return false;
  }

  console.log('\n🔍 Testing Validate Account...');
  
  const result = await makeRequest('POST', `/extension/accounts/${createdAccountId}/validate`);
  
  if (result.success) {
    console.log('✅ Validate account successful');
    console.log(`   Validation status: ${result.data.account.validation_status}`);
    return true;
  } else {
    console.log('❌ Validate account failed:', result.error);
    return false;
  }
}

/**
 * Test syncing accounts via extension API
 */
async function testSyncAccounts() {
  console.log('\n🔄 Testing Sync Accounts...');
  
  const syncData = {
    accounts: [
      {
        account_name: `Sync Test Account 1 ${timestamp}`,
        email: `sync1.${timestamp}@example.com`,
        is_active: true
      },
      {
        account_name: `Sync Test Account 2 ${timestamp}`,
        email: `sync2.${timestamp}@example.com`,
        is_active: false
      }
    ]
  };
  
  const result = await makeRequest('POST', '/extension/accounts/sync', syncData);
  
  if (result.success) {
    console.log('✅ Sync accounts successful');
    console.log(`   Created: ${result.data.results.created}, Updated: ${result.data.results.updated}, Errors: ${result.data.results.errors}`);
    return true;
  } else {
    console.log('❌ Sync accounts failed:', result.error);
    return false;
  }
}

/**
 * Test deleting account via extension API
 */
async function testDeleteAccount() {
  if (!createdAccountId) {
    console.log('\n⚠️  Skipping delete test - no account created');
    return false;
  }

  console.log('\n🗑️  Testing Delete Account...');
  
  const result = await makeRequest('DELETE', `/extension/accounts/${createdAccountId}`);
  
  if (result.success) {
    console.log('✅ Delete account successful');
    return true;
  } else {
    console.log('❌ Delete account failed:', result.error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Starting Extension-Backend Integration Tests');
  console.log('='.repeat(50));

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  const tests = [
    { name: 'Authentication', fn: testAuthentication },
    { name: 'Get Accounts', fn: testGetAccounts },
    { name: 'Add Account', fn: testAddAccount },
    { name: 'Update Account', fn: testUpdateAccount },
    { name: 'Validate Account', fn: testValidateAccount },
    { name: 'Sync Accounts', fn: testSyncAccounts },
    { name: 'Delete Account', fn: testDeleteAccount }
  ];

  for (const test of tests) {
    results.total++;
    try {
      const success = await test.fn();
      if (success) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      console.log(`❌ Test ${test.name} threw an error:`, error.message);
      results.failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary:');
  console.log(`   Total Tests: ${results.total}`);
  console.log(`   Passed: ${results.passed} ✅`);
  console.log(`   Failed: ${results.failed} ❌`);
  console.log(`   Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! Extension-Backend integration is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
  }
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };