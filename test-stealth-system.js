const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class StealthSystemTester {
  constructor() {
    this.baseUrl = 'http://localhost:3001';
    this.results = {
      loginTest: null,
      accountVisibility: null,
      profileScraping: null,
      apiTests: [],
      databaseTests: null
    };
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Stealth System Tests\n');
    
    try {
      // Test 1: Health Check
      await this.testHealthCheck();
      
      // Test 2: Stealth Login
      await this.testStealthLogin();
      
      // Test 3: Account Visibility
      await this.testAccountVisibility();
      
      // Test 4: Profile Scraping
      await this.testProfileScraping();
      
      // Test 5: Database Operations
      await this.testDatabaseOperations();
      
      // Test 6: All API Endpoints
      await this.testAllAPIs();
      
      // Generate Report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    }
  }

  async testHealthCheck() {
    console.log('🏥 Testing Health Check...');
    try {
      const response = await axios.get(`${this.baseUrl}/health`);
      console.log('✅ Health Check Status:', response.data.services);
      
      if (response.data.services.stealthScraper === 'running') {
        console.log('✅ Stealth Scraper Service: RUNNING');
      } else {
        console.log('❌ Stealth Scraper Service: NOT RUNNING');
      }
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
    console.log('');
  }

  async testStealthLogin() {
    console.log('🔐 Testing Stealth Login with Cookies...');
    try {
      const response = await axios.post(`${this.baseUrl}/api/stealth/test-login`, {
        cookieFilePath: path.join(__dirname, 'linkedin-automation-saas', 'account1.json')
      });
      
      this.results.loginTest = response.data;
      
      if (response.data.success && response.data.login.success) {
        console.log('✅ Stealth Login: SUCCESS');
        console.log('📊 Login Details:', response.data.login.details);
      } else {
        console.log('❌ Stealth Login: FAILED');
        console.log('🔍 Failure Reason:', response.data.login.reason);
        console.log('📊 Login Details:', response.data.login.details);
      }
    } catch (error) {
      console.error('❌ Stealth login test failed:', error.response?.data || error.message);
      this.results.loginTest = { success: false, error: error.message };
    }
    console.log('');
  }

  async testAccountVisibility() {
    console.log('👁️ Testing Account Visibility in Add Job Section...');
    try {
      const response = await axios.get(`${this.baseUrl}/api/linkedin-accounts/available`);
      
      this.results.accountVisibility = response.data;
      
      if (response.data.success && response.data.data.length > 0) {
        console.log('✅ Account Visibility: SUCCESS');
        console.log(`📊 Available Accounts: ${response.data.data.length}`);
        response.data.data.forEach((account, index) => {
          console.log(`   ${index + 1}. ${account.account_name} (${account.validation_status})`);
        });
      } else {
        console.log('❌ Account Visibility: NO ACCOUNTS FOUND');
      }
    } catch (error) {
      console.error('❌ Account visibility test failed:', error.response?.data || error.message);
      this.results.accountVisibility = { success: false, error: error.message };
    }
    console.log('');
  }

  async testProfileScraping() {
    console.log('🕷️ Testing Profile Scraping from CSV...');
    try {
      const response = await axios.post(`${this.baseUrl}/api/stealth/scrape-profiles`, {
        csvFilePath: path.join(__dirname, 'linkedin-automation-saas', 'profile_test.csv')
      }, {
        timeout: 300000 // 5 minutes timeout for scraping
      });
      
      this.results.profileScraping = response.data;
      
      if (response.data.success) {
        console.log('✅ Profile Scraping: SUCCESS');
        console.log(`📊 Profiles Scraped: ${response.data.count}`);
        
        if (response.data.results.length > 0) {
          console.log('📋 Sample Scraped Data:');
          const sample = response.data.results[0];
          console.log(`   Name: ${sample.full_name || 'N/A'}`);
          console.log(`   Headline: ${sample.headline || 'N/A'}`);
          console.log(`   Location: ${sample.city || 'N/A'}, ${sample.country || 'N/A'}`);
          console.log(`   HTML File: ${sample.html_file_path || 'N/A'}`);
        }
      } else {
        console.log('❌ Profile Scraping: FAILED');
        console.log('🔍 Error:', response.data.error);
      }
    } catch (error) {
      console.error('❌ Profile scraping test failed:', error.response?.data || error.message);
      this.results.profileScraping = { success: false, error: error.message };
    }
    console.log('');
  }

  async testDatabaseOperations() {
    console.log('🗄️ Testing Database Operations...');
    try {
      // Test getting scraped profiles
      const profilesResponse = await axios.get(`${this.baseUrl}/api/stealth/profiles`);
      
      // Test getting scraped companies
      const companiesResponse = await axios.get(`${this.baseUrl}/api/stealth/companies`);
      
      this.results.databaseTests = {
        profiles: profilesResponse.data,
        companies: companiesResponse.data
      };
      
      console.log('✅ Database Operations: SUCCESS');
      console.log(`📊 Profiles in Database: ${profilesResponse.data.count}`);
      console.log(`📊 Companies in Database: ${companiesResponse.data.count}`);
      
      if (profilesResponse.data.profiles.length > 0) {
        console.log('📋 Sample Profile from Database:');
        const profile = profilesResponse.data.profiles[0];
        console.log(`   ID: ${profile.id}`);
        console.log(`   Name: ${profile.full_name || 'N/A'}`);
        console.log(`   URL: ${profile.profile_url}`);
        console.log(`   Scraped: ${profile.scraped_at}`);
      }
      
    } catch (error) {
      console.error('❌ Database operations test failed:', error.response?.data || error.message);
      this.results.databaseTests = { success: false, error: error.message };
    }
    console.log('');
  }

  async testAllAPIs() {
    console.log('🔌 Testing All API Endpoints...');
    
    const apiTests = [
      {
        name: 'Add/Update Account API',
        method: 'POST',
        url: '/api/accounts/add-or-update',
        data: {
          account_name: 'Test Stealth Account',
          session_cookie: 'test_cookie_value_12345',
          proxy_url: 'http://proxy.example.com:8080'
        }
      },
      {
        name: 'Validate Account API',
        method: 'GET',
        url: '/api/linkedin-accounts/available'
      },
      {
        name: 'Get Profiles API',
        method: 'GET',
        url: '/api/stealth/profiles'
      },
      {
        name: 'Get Companies API',
        method: 'GET',
        url: '/api/stealth/companies'
      },
      {
        name: 'Health Check API',
        method: 'GET',
        url: '/health'
      }
    ];
    
    for (const test of apiTests) {
      try {
        console.log(`   Testing ${test.name}...`);
        
        let response;
        if (test.method === 'GET') {
          response = await axios.get(`${this.baseUrl}${test.url}`);
        } else if (test.method === 'POST') {
          response = await axios.post(`${this.baseUrl}${test.url}`, test.data);
        }
        
        const result = {
          name: test.name,
          success: true,
          status: response.status,
          data: response.data
        };
        
        this.results.apiTests.push(result);
        console.log(`   ✅ ${test.name}: SUCCESS (${response.status})`);
        
      } catch (error) {
        const result = {
          name: test.name,
          success: false,
          error: error.response?.data || error.message,
          status: error.response?.status
        };
        
        this.results.apiTests.push(result);
        console.log(`   ❌ ${test.name}: FAILED (${error.response?.status || 'Network Error'})`);
      }
    }
    console.log('');
  }

  generateReport() {
    console.log('📊 === COMPREHENSIVE TEST REPORT ===\n');
    
    // Login Test Results
    console.log('🔐 STEALTH LOGIN TEST:');
    if (this.results.loginTest?.success && this.results.loginTest?.login?.success) {
      console.log('   ✅ Status: PASSED');
      console.log('   📍 LinkedIn Feed: ACCESSIBLE');
      console.log('   🍪 Cookies: SUCCESSFULLY INJECTED');
    } else {
      console.log('   ❌ Status: FAILED');
      console.log(`   🔍 Reason: ${this.results.loginTest?.login?.reason || 'Unknown'}`);
    }
    console.log('');
    
    // Account Visibility Results
    console.log('👁️ ACCOUNT VISIBILITY TEST:');
    if (this.results.accountVisibility?.success && this.results.accountVisibility?.data?.length > 0) {
      console.log('   ✅ Status: PASSED');
      console.log(`   📊 Available Accounts: ${this.results.accountVisibility.data.length}`);
    } else {
      console.log('   ❌ Status: FAILED');
      console.log('   🔍 Issue: No accounts visible in Add Job section');
    }
    console.log('');
    
    // Profile Scraping Results
    console.log('🕷️ PROFILE SCRAPING TEST:');
    if (this.results.profileScraping?.success) {
      console.log('   ✅ Status: PASSED');
      console.log(`   📊 Profiles Scraped: ${this.results.profileScraping.count}`);
      console.log('   💾 HTML Files: SAVED');
      console.log('   🗄️ Database: UPDATED');
    } else {
      console.log('   ❌ Status: FAILED');
      console.log(`   🔍 Error: ${this.results.profileScraping?.error || 'Unknown'}`);
    }
    console.log('');
    
    // Database Tests Results
    console.log('🗄️ DATABASE OPERATIONS TEST:');
    if (this.results.databaseTests?.profiles?.success && this.results.databaseTests?.companies?.success) {
      console.log('   ✅ Status: PASSED');
      console.log(`   📊 Profiles Table: ${this.results.databaseTests.profiles.count} records`);
      console.log(`   📊 Companies Table: ${this.results.databaseTests.companies.count} records`);
    } else {
      console.log('   ❌ Status: FAILED');
      console.log('   🔍 Issue: Database operations failed');
    }
    console.log('');
    
    // API Tests Results
    console.log('🔌 API ENDPOINTS TEST:');
    const passedAPIs = this.results.apiTests.filter(test => test.success).length;
    const totalAPIs = this.results.apiTests.length;
    
    if (passedAPIs === totalAPIs) {
      console.log('   ✅ Status: ALL PASSED');
    } else {
      console.log(`   ⚠️ Status: ${passedAPIs}/${totalAPIs} PASSED`);
    }
    
    this.results.apiTests.forEach(test => {
      const status = test.success ? '✅' : '❌';
      console.log(`   ${status} ${test.name}`);
    });
    console.log('');
    
    // Overall Summary
    console.log('🎯 OVERALL SYSTEM STATUS:');
    const allTestsPassed = 
      this.results.loginTest?.success &&
      this.results.loginTest?.login?.success &&
      this.results.accountVisibility?.success &&
      this.results.profileScraping?.success &&
      this.results.databaseTests?.profiles?.success &&
      passedAPIs === totalAPIs;
    
    if (allTestsPassed) {
      console.log('   🎉 STEALTH LINKEDIN AUTOMATION: FULLY FUNCTIONAL');
      console.log('   ✅ Login: Working');
      console.log('   ✅ Account Visibility: Working');
      console.log('   ✅ Profile Scraping: Working');
      console.log('   ✅ Database: Working');
      console.log('   ✅ APIs: Working');
    } else {
      console.log('   ⚠️ STEALTH LINKEDIN AUTOMATION: PARTIAL FUNCTIONALITY');
      console.log('   🔧 Some components need attention');
    }
    
    console.log('\n📋 Test completed at:', new Date().toISOString());
  }

  async saveResultsToFile() {
    try {
      const resultsFile = path.join(__dirname, 'stealth-test-results.json');
      await fs.writeFile(resultsFile, JSON.stringify(this.results, null, 2));
      console.log(`💾 Test results saved to: ${resultsFile}`);
    } catch (error) {
      console.error('❌ Failed to save test results:', error.message);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new StealthSystemTester();
  tester.runAllTests().then(() => {
    tester.saveResultsToFile();
  }).catch(error => {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = StealthSystemTester;