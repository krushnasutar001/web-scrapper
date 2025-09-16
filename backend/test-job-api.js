const axios = require('axios');

async function testJobAPI() {
  try {
    console.log('🔍 Testing job creation API...');
    
    // Wait a bit to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Login
    console.log('1. Logging in...');
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      email: 'krushna.sutar001@gmail.com',
      password: 'Krushna_Sutar@0809'
    });
    
    const token = loginResponse.data.data.accessToken;
    console.log('✅ Login successful');
    
    // Create job
    console.log('2. Creating job...');
    const jobResponse = await axios.post('http://localhost:5001/api/jobs', {
      jobType: 'profile_scraping',
      jobName: 'API Test Job',
      maxResults: 50,
      urls: [
        'https://www.linkedin.com/in/satyanadella/',
        'https://linkedin.com/in/jeffweiner08'
      ],
      accountSelectionMode: 'rotation'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Job created successfully:', jobResponse.data);
    
    // Get jobs
    console.log('3. Getting jobs...');
    const getJobsResponse = await axios.get('http://localhost:5001/api/jobs', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Jobs retrieved:', getJobsResponse.data);
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testJobAPI();