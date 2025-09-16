const axios = require('axios');

async function testJobCreation() {
  try {
    console.log('🔍 Testing job creation system...');
    
    // Step 1: Login
    console.log('\n1. Testing login...');
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      email: 'krushna.sutar001@gmail.com',
      password: 'Krushna_Sutar@0809'
    });
    
    const token = loginResponse.data.data.accessToken;
    console.log('✅ Login successful, token obtained');
    
    // Step 2: Get available accounts
    console.log('\n2. Getting available LinkedIn accounts...');
    const accountsResponse = await axios.get('http://localhost:5001/api/linkedin-accounts/available', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Available accounts:', accountsResponse.data.total);
    
    if (accountsResponse.data.total === 0) {
      console.log('⚠️ No LinkedIn accounts available. Creating a test account...');
      
      await axios.post('http://localhost:5001/api/linkedin-accounts', {
        account_name: 'Job Test Account',
        email: 'jobtest@example.com',
        username: 'jobtestuser'
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Test account created');
    }
    
    // Step 3: Test job creation with valid LinkedIn URLs
    console.log('\n3. Creating job with valid LinkedIn URLs...');
    
    const validLinkedInUrls = [
      'https://www.linkedin.com/in/satyanadella/',
      'https://linkedin.com/in/jeffweiner08',
      'https://www.linkedin.com/company/microsoft/',
      'https://linkedin.com/company/google'
    ];
    
    const jobData = {
      jobType: 'profile_scraping',
      jobName: 'Test Profile Scraping Job',
      maxResults: 50,
      urls: validLinkedInUrls,
      accountSelectionMode: 'rotation'
    };
    
    console.log('Job data:', jobData);
    
    const createJobResponse = await axios.post('http://localhost:5001/api/jobs', jobData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Job created successfully:', createJobResponse.data);
    
    // Step 4: Test with invalid URLs
    console.log('\n4. Testing with invalid URLs (should fail)...');
    
    const invalidUrls = [
      'https://www.google.com',
      'https://facebook.com/profile',
      'invalid-url',
      'https://twitter.com/user'
    ];
    
    try {
      await axios.post('http://localhost:5001/api/jobs', {
        jobType: 'profile_scraping',
        jobName: 'Invalid URL Test Job',
        maxResults: 50,
        urls: invalidUrls
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('❌ This should have failed!');
    } catch (error) {
      console.log('✅ Correctly rejected invalid URLs:', error.response?.data?.error);
    }
    
    // Step 5: Test mixed valid/invalid URLs
    console.log('\n5. Testing with mixed valid/invalid URLs...');
    
    const mixedUrls = [
      'https://www.linkedin.com/in/satyanadella/',
      'https://www.google.com',
      'https://linkedin.com/company/microsoft/',
      'invalid-url'
    ];
    
    const mixedJobResponse = await axios.post('http://localhost:5001/api/jobs', {
      jobType: 'company_scraping',
      jobName: 'Mixed URLs Test Job',
      maxResults: 50,
      urls: mixedUrls
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Mixed URLs job created (valid URLs only):', mixedJobResponse.data);
    
    // Step 6: Get all jobs
    console.log('\n6. Getting all jobs...');
    
    const jobsResponse = await axios.get('http://localhost:5001/api/jobs', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Jobs retrieved:', jobsResponse.data);
    
    console.log('\n🎉 All job creation tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed!');
    console.error('Error message:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);
  }
}

testJobCreation();