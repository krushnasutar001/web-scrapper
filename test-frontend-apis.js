const axios = require('axios');

class FrontendAPITester {
  constructor() {
    this.baseUrl = 'http://localhost:3001';
    this.token = null;
  }

  async login() {
    try {
      console.log('🔐 Testing login...');
      const response = await axios.post(`${this.baseUrl}/api/auth/login`, {
        email: 'test@example.com',
        password: 'password123'
      });
      
      if (response.data.success) {
        this.token = response.data.data.token;
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
      
      console.log('Jobs API Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success) {
        console.log('✅ Jobs API working correctly');
        console.log(`📊 Found ${response.data.jobs.length} jobs`);
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
      const response = await axios.get(`${this.baseUrl}/api/linkedin-accounts/available`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Accounts API Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success) {
        console.log('✅ Accounts API working correctly');
        console.log(`📊 Found ${response.data.data.length} available accounts`);
        
        if (response.data.data.length > 0) {
          console.log('📋 Available accounts:');
          response.data.data.forEach((account, index) => {
            console.log(`   ${index + 1}. ${account.account_name} (${account.validation_status})`);
          });
        } else {
          console.log('⚠️ No LinkedIn accounts available');
        }
        return true;
      } else {
        console.log('❌ Accounts API returned success: false');
        return false;
      }
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