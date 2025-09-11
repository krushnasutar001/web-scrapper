const axios = require('axios');

class AccountsDebugger {
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
      console.error('❌ Login error:', error.response?.data || error.message);
      return false;
    }
  }

  async checkAccountsWithoutAuth() {
    try {
      console.log('\n🔍 Testing accounts API without authentication...');
      const response = await axios.get(`${this.baseUrl}/api/linkedin-accounts/available`);
      
      console.log('Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success) {
        console.log(`✅ Found ${response.data.data.length} accounts without auth`);
        return response.data.data;
      } else {
        console.log('❌ No accounts found without auth');
        return [];
      }
    } catch (error) {
      console.error('❌ Accounts API error (no auth):', error.response?.data || error.message);
      return [];
    }
  }

  async checkAccountsWithAuth() {
    try {
      console.log('\n🔍 Testing accounts API with authentication...');
      const response = await axios.get(`${this.baseUrl}/api/linkedin-accounts/available`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success) {
        console.log(`✅ Found ${response.data.data.length} accounts with auth`);
        return response.data.data;
      } else {
        console.log('❌ No accounts found with auth');
        return [];
      }
    } catch (error) {
      console.error('❌ Accounts API error (with auth):', error.response?.data || error.message);
      return [];
    }
  }

  async addTestAccount() {
    try {
      console.log('\n➕ Adding test LinkedIn account...');
      const response = await axios.post(`${this.baseUrl}/api/accounts/add-or-update`, {
        account_name: 'Debug Test Account',
        session_cookie: 'debug_test_cookie_12345',
        proxy_url: 'http://proxy.example.com:8080'
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data.success) {
        console.log('✅ Test account added successfully:', response.data.account_id);
        return true;
      } else {
        console.log('❌ Failed to add test account:', response.data);
        return false;
      }
    } catch (error) {
      console.error('❌ Add account error:', error.response?.data || error.message);
      return false;
    }
  }

  async updateAccountStatus() {
    try {
      console.log('\n🔄 Updating account status to ACTIVE...');
      
      // First get all accounts to find the one to update
      const accountsResponse = await axios.get(`${this.baseUrl}/api/linkedin-accounts`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (accountsResponse.data.success && accountsResponse.data.data.length > 0) {
        const account = accountsResponse.data.data.find(acc => acc.account_name === 'Debug Test Account');
        
        if (account) {
          // Update the account status using direct database query
          const updateResponse = await axios.put(`${this.baseUrl}/api/linkedin-accounts/${account.id}`, {
            validation_status: 'ACTIVE'
          }, {
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (updateResponse.data.success) {
            console.log('✅ Account status updated to ACTIVE');
            return true;
          }
        }
      }
      
      console.log('❌ Failed to update account status');
      return false;
    } catch (error) {
      console.error('❌ Update status error:', error.response?.data || error.message);
      return false;
    }
  }

  async checkFrontendCompatibility() {
    try {
      console.log('\n🌐 Testing frontend compatibility...');
      
      // Test the exact endpoint the frontend uses
      const response = await axios.get(`${this.baseUrl}/api/linkedin-accounts/available`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      console.log('Frontend-style response:', JSON.stringify(response.data, null, 2));
      
      // Check if response matches frontend expectations
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        const activeAccounts = response.data.data.filter(acc => acc.validation_status === 'ACTIVE');
        console.log(`✅ Frontend compatibility: ${activeAccounts.length} active accounts available`);
        
        if (activeAccounts.length === 0) {
          console.log('⚠️ No ACTIVE accounts found - this is why frontend shows "No accounts available"');
        }
        
        return activeAccounts;
      } else {
        console.log('❌ Response format doesn\'t match frontend expectations');
        return [];
      }
    } catch (error) {
      console.error('❌ Frontend compatibility test failed:', error.response?.data || error.message);
      return [];
    }
  }

  async runFullDiagnosis() {
    console.log('🚀 Starting LinkedIn Accounts Debug Session\n');
    
    // Step 1: Login
    const loginSuccess = await this.login();
    if (!loginSuccess) {
      console.log('❌ Cannot proceed without login');
      return;
    }
    
    // Step 2: Check accounts without auth
    await this.checkAccountsWithoutAuth();
    
    // Step 3: Check accounts with auth
    const accountsWithAuth = await this.checkAccountsWithAuth();
    
    // Step 4: Add test account if none exist
    if (accountsWithAuth.length === 0) {
      console.log('\n⚠️ No accounts found, adding test account...');
      await this.addTestAccount();
      await this.updateAccountStatus();
    }
    
    // Step 5: Final frontend compatibility test
    const activeAccounts = await this.checkFrontendCompatibility();
    
    // Step 6: Summary
    console.log('\n📊 === DIAGNOSIS SUMMARY ===');
    console.log(`🔐 Login: ${loginSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`👥 Total Accounts: ${accountsWithAuth.length}`);
    console.log(`✅ Active Accounts: ${activeAccounts.length}`);
    
    if (activeAccounts.length > 0) {
      console.log('\n🎉 SOLUTION: Accounts are available!');
      console.log('💡 If frontend still shows "No accounts available":');
      console.log('   1. Make sure you\'re logged in to the frontend');
      console.log('   2. Check browser console for authentication errors');
      console.log('   3. Clear browser cache and localStorage');
      console.log('   4. Try logging out and back in');
    } else {
      console.log('\n⚠️ ISSUE: No active accounts available');
      console.log('💡 SOLUTION: Add LinkedIn accounts in the LinkedIn Accounts section');
    }
    
    console.log('\n🔗 Access URLs:');
    console.log('   Frontend: http://localhost:3000');
    console.log('   Login: test@example.com / password123');
  }
}

// Run diagnosis if this file is executed directly
if (require.main === module) {
  const accountsDebugger = new AccountsDebugger();
  accountsDebugger.runFullDiagnosis().catch(error => {
    console.error('❌ Diagnosis failed:', error.message);
    process.exit(1);
  });
}

module.exports = AccountsDebugger;