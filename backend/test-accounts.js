const axios = require('axios');

async function testAccountManagement() {
  try {
    console.log('🔍 Testing account management system...');
    
    // Step 1: Login
    console.log('\n1. Testing login...');
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      email: 'krushna.sutar001@gmail.com',
      password: 'Krushna_Sutar@0809'
    });
    
    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.error);
    }
    
    const token = loginResponse.data.data.accessToken;
    console.log('✅ Login successful, token obtained');
    console.log('Token length:', token.length);
    
    // Step 2: Get existing accounts
    console.log('\n2. Getting existing accounts...');
    const getAccountsResponse = await axios.get('http://localhost:5001/api/linkedin-accounts', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Accounts retrieved:', getAccountsResponse.data);
    console.log('Current account count:', getAccountsResponse.data.total);
    
    // Step 3: Create a new account
    console.log('\n3. Creating new LinkedIn account...');
    const accountData = {
      account_name: 'Test LinkedIn Account',
      email: 'test.linkedin@example.com',
      username: 'testuser'
    };
    
    console.log('Account data to create:', accountData);
    
    const createAccountResponse = await axios.post('http://localhost:5001/api/linkedin-accounts', accountData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Account created successfully:', createAccountResponse.data);
    
    // Step 4: Get accounts again to verify
    console.log('\n4. Verifying account was created...');
    const verifyAccountsResponse = await axios.get('http://localhost:5001/api/linkedin-accounts', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Updated accounts list:', verifyAccountsResponse.data);
    console.log('New account count:', verifyAccountsResponse.data.total);
    
    // Step 5: Test available accounts endpoint
    console.log('\n5. Testing available accounts endpoint...');
    const availableAccountsResponse = await axios.get('http://localhost:5001/api/linkedin-accounts/available', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Available accounts:', availableAccountsResponse.data);
    
    console.log('\n🎉 All account management tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed!');
    console.error('Error message:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);
    console.error('Full error:', error);
  }
}

testAccountManagement();