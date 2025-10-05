const axios = require('axios');

class FrontendAPITester {
  constructor() {
    this.baseUrl = process.env.API_URL || process.env.REACT_APP_API_URL || 'http://localhost:5002';
    this.token = null;
  }

  async login() {
    try {
      console.log('🔐 Testing login...');
      const response = await axios.post(`${this.baseUrl}/api/auth/login`, {
        email: 'test@example.com',
        password: 'password123'
      });
      
      const data = response.data || {};
      const token = data.token || data.authToken || data?.data?.token || data?.data?.authToken;
      if (data.success || token) {
        this.token = token;
        console.log('✅ Login successful, token:', this.token);
        return true;
      } else {
        console.log('❌ Login failed:', response.data);
        return false;
      }
    } catch (error) {
      console.error('❌ Login error:', error.message);
      return false;
    }
  }

  async testJobsAPI() {
    try {
      console.log('\n📋 Testing Jobs API...');
      const response = await axios.get(`${this.baseUrl}/api/jobs`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const jobsData = response.data;
      console.log('Jobs API Response:', JSON.stringify(jobsData, null, 2));
      
      if (Array.isArray(jobsData)) {
        console.log('✅ Jobs API working correctly (array shape)');
        console.log(`📊 Found ${jobsData.length} jobs`);
        return true;
      }

      if (jobsData?.success && Array.isArray(jobsData.jobs)) {
        console.log('✅ Jobs API working correctly (object shape)');
        console.log(`📊 Found ${jobsData.jobs.length} jobs`);
        return true;
      } else {
        console.log('❌ Jobs API returned success: false');
        return false;
      }
    } catch (error) {
      console.error('❌ Jobs API error:', error.response?.data || error.message);
      return false;
    }
  }

  async testAccountsAPI() {
    try {
      console.log('\n👥 Testing LinkedIn Accounts API...');
      const response = await axios.get(`${this.baseUrl}/api/linkedin-accounts`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const accData = response.data;
      console.log('Accounts API Response:', JSON.stringify(accData, null, 2));
      
      if (Array.isArray(accData)) {
        console.log('✅ Accounts API working correctly (array shape)');
        console.log(`📊 Found ${accData.length} accounts`);
        return true;
      }

      if (accData?.success && Array.isArray(accData.data)) {
        console.log('✅ Accounts API working correctly (object shape)');
        console.log(`📊 Found ${accData.data.length} available accounts`);
        return true;
      }

      console.log('⚠️ Unexpected accounts response shape');
      return false;
    } catch (error) {
      console.error('❌ Accounts API error:', error.response?.data || error.message);
      return false;
    }
  }

  async testCORSHeaders() {
    try {
      console.log('\n🌐 Testing CORS headers...');
      const response = await axios.options(`${this.baseUrl}/api/jobs`);
      
      console.log('CORS Headers:');
      console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
      console.log('  Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
      console.log('  Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);
      
      return true;
    } catch (error) {
      console.error('❌ CORS test error:', error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Frontend API Tests\n');
    
    const loginSuccess = await this.login();
    if (!loginSuccess) {
      console.log('❌ Cannot proceed without login');
      return;
    }
    
    const jobsSuccess = await this.testJobsAPI();
    const accountsSuccess = await this.testAccountsAPI();
    await this.testCORSHeaders();
    
    console.log('\n📊 === TEST SUMMARY ===');
    console.log(`🔐 Login: ${loginSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`📋 Jobs API: ${jobsSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`👥 Accounts API: ${accountsSuccess ? '✅ PASS' : '❌ FAIL'}`);
    
    if (loginSuccess && jobsSuccess && accountsSuccess) {
      console.log('\n🎉 All APIs are working correctly!');
      console.log('\n💡 Frontend Issues Likely Causes:');
      console.log('   1. Authentication token not being sent from frontend');
      console.log('   2. CORS issues in browser environment');
      console.log('   3. Frontend not handling response format correctly');
      console.log('   4. Network connectivity issues');
    } else {
      console.log('\n⚠️ Some APIs are not working correctly');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new FrontendAPITester();
  tester.runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = FrontendAPITester;