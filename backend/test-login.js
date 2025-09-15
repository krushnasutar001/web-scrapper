const axios = require('axios');

async function testLogin() {
  try {
    console.log('🔍 Testing login endpoint directly...');
    
    const response = await axios.post('http://localhost:5001/api/auth/login', {
      email: 'krushna.sutar001@gmail.com',
      password: 'Krushna_Sutar@0809'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Login successful!');
    console.log('Status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    // Test token format
    if (response.data.success && response.data.data) {
      const { accessToken, refreshToken, user } = response.data.data;
      console.log('\n🔍 Token analysis:');
      console.log('Access Token length:', accessToken?.length);
      console.log('Access Token starts with:', accessToken?.substring(0, 20));
      console.log('Refresh Token length:', refreshToken?.length);
      console.log('User:', user);
    }
    
  } catch (error) {
    console.error('❌ Login failed!');
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Error data:', error.response?.data);
    console.error('Error message:', error.message);
  }
}

testLogin();