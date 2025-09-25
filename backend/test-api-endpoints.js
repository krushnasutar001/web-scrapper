const axios = require('axios');
const User = require('./models/User');
const { initializeDatabase } = require('./utils/database');

async function testAPI() {
  try {
    console.log('🧪 Testing API endpoints...');
    
    // Initialize database first
    console.log('0. Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Create a test user
    console.log('1. Creating test user...');
    try {
      await User.create({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
      console.log('✅ Test user created successfully');
    } catch (error) {
      if (error.message.includes('Duplicate entry')) {
        console.log('ℹ️ Test user already exists');
      } else {
        console.log('❌ Error creating test user:', error.message);
      }
    }
    
    // Test login
    console.log('2. Testing login...');
    const loginResponse = await axios.post('http://localhost:5002/api/auth/login', {
      email: 'test@example.com',
      password: 'password123'
    });
    
    console.log('✅ Login response:', loginResponse.data);
    
    if (loginResponse.data.success) {
      const token = loginResponse.data.token;
      console.log('🔑 Token received:', token.substring(0, 50) + '...');
      
      // Test dashboard stats
      console.log('3. Testing dashboard stats...');
      const dashboardResponse = await axios.get('http://localhost:5002/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('✅ Dashboard response:', dashboardResponse.data);
      
      // Test accounts endpoint
      console.log('4. Testing accounts endpoint...');
      const accountsResponse = await axios.get('http://localhost:5002/api/linkedin-accounts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('✅ Accounts response:', accountsResponse.data);
      
      // Test account creation
      console.log('5. Testing account creation...');
      const createAccountResponse = await axios.post('http://localhost:5002/api/linkedin-accounts', {
        account_name: 'Test Account',
        cookies: 'li_at=test_cookie_value; JSESSIONID=test_session',
        proxyUrl: ''
      }, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Account creation response:', createAccountResponse.data);
      
    } else {
      console.log('❌ Login failed:', loginResponse.data);
    }
  } catch (error) {
    console.error('❌ API Test Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url
    });
  }
}

testAPI();