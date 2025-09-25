// Test authentication flow
require('dotenv').config();

const axios = require('axios');

const API_BASE = 'http://localhost:5002';

async function testAuth() {
  console.log('🔍 Testing Authentication Flow...\n');
  
  try {
    // Step 1: Test login
    console.log('1. Testing login...');
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });
    
    console.log('✅ Login successful!');
    console.log('Response data:', JSON.stringify(loginResponse.data, null, 2));
    
    const token = loginResponse.data.data?.accessToken || loginResponse.data.data?.token;
    
    if (!token) {
      console.error('❌ No token in login response!');
      return;
    }
    
    console.log('🔑 Token:', token.substring(0, 50) + '...');
    
    // Step 2: Test dashboard stats with token
    console.log('\n2. Testing dashboard stats with token...');
    const dashboardResponse = await axios.get(`${API_BASE}/api/dashboard/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Dashboard stats successful!');
    console.log('Response:', JSON.stringify(dashboardResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testAuth();