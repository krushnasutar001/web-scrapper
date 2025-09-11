/**
 * Test LinkedIn Scraping System
 * Tests the complete workflow with the provided LinkedIn URLs
 */

const axios = require('axios');

// Test LinkedIn URLs provided by the user
const testUrls = [
  'https://www.linkedin.com/in/shweta-biradar-1b5001257/',
  'https://www.linkedin.com/in/varshapawar1907/',
  'https://www.linkedin.com/in/ACwAAAIp9HgBuMQ-FJ1IJooutz3ikr--XWyUi24',
  'https://www.linkedin.com/in/ACwAAAEbwmcBIO2wI41NvGE_aExKGFSJgWpckWE'
];

async function testScrapingSystem() {
  console.log('🧪 Testing LinkedIn Scraping System');
  console.log('==================================');
  
  try {
    // Step 1: Login to get authentication token
    console.log('\n1. 🔐 Authenticating...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'demo@example.com',
      password: 'password123'
    });
    
    if (!loginResponse.data.success) {
      throw new Error('Authentication failed');
    }
    
    const token = loginResponse.data.data.token;
    console.log('✅ Authentication successful');
    
    // Step 2: Check available accounts
    console.log('\n2. 📋 Checking available accounts...');
    const accountsResponse = await axios.get('http://localhost:3001/api/linkedin-accounts/available', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log(`✅ Found ${accountsResponse.data.count} available accounts`);
    accountsResponse.data.data.forEach((account, index) => {
      console.log(`   ${index + 1}. ${account.account_name} (${account.validation_status})`);
    });
    
    // Step 3: Create scraping job with test URLs
    console.log('\n3. 🚀 Creating scraping job...');
    const jobResponse = await axios.post('http://localhost:3001/api/jobs', {
      jobName: 'Test LinkedIn Profile Scraping',
      jobType: 'profiles',
      urls: testUrls,
      accountSelectionMode: 'rotation'
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!jobResponse.data.success) {
      console.error('❌ Job creation failed:', jobResponse.data.error);
      if (jobResponse.data.validationResults) {
        console.log('\n📊 URL Validation Results:');
        console.log('Valid URLs:', jobResponse.data.validationResults.valid);
        console.log('Invalid URLs:', jobResponse.data.validationResults.invalid);
      }
      return;
    }
    
    const jobId = jobResponse.data.jobId;
    console.log(`✅ Job created successfully: ${jobId}`);
    console.log(`📊 URLs processed: ${jobResponse.data.urlsProcessed}`);
    console.log(`🔧 Account used: ${jobResponse.data.accountUsed}`);
    
    // Step 4: Monitor job status
    console.log('\n4. 👀 Monitoring job status...');
    let jobCompleted = false;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    
    while (!jobCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      attempts++;
      
      try {
        const statusResponse = await axios.get(`http://localhost:3001/api/jobs/${jobId}/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const job = statusResponse.data.job;
        console.log(`📊 Status: ${job.status} | Success: ${job.success_count || 0} | Failed: ${job.failure_count || 0}`);
        
        if (job.status === 'completed' || job.status === 'failed') {
          jobCompleted = true;
          
          if (job.status === 'completed') {
            console.log('\n🎉 Job completed successfully!');
            
            // Step 5: Get results
            console.log('\n5. 📥 Fetching results...');
            const resultsResponse = await axios.get(`http://localhost:3001/api/jobs/${jobId}/results`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            
            console.log(`✅ Retrieved ${resultsResponse.data.total} results`);
            
            // Display sample results
            if (resultsResponse.data.results.length > 0) {
              console.log('\n📋 Sample Results:');
              resultsResponse.data.results.slice(0, 2).forEach((result, index) => {
                console.log(`\n   Result ${index + 1}:`);
                console.log(`   URL: ${result.url}`);
                console.log(`   Status: ${result.status}`);
                if (result.data && result.data.full_name) {
                  console.log(`   Name: ${result.data.full_name}`);
                  console.log(`   Headline: ${result.data.headline || 'N/A'}`);
                  console.log(`   Location: ${result.data.location || 'N/A'}`);
                }
              });
            }
            
            // Step 6: Test download functionality
            console.log('\n6. 💾 Testing download functionality...');
            try {
              const downloadResponse = await axios.get(`http://localhost:3001/api/jobs/${jobId}/download?format=csv`, {
                headers: { 'Authorization': `Bearer ${token}` },
                responseType: 'stream'
              });
              
              console.log('✅ Download functionality working');
              console.log(`📁 Content-Type: ${downloadResponse.headers['content-type']}`);
              console.log(`📏 Content-Length: ${downloadResponse.headers['content-length']} bytes`);
              
            } catch (downloadError) {
              console.log('⚠️ Download test failed:', downloadError.response?.data || downloadError.message);
            }
            
          } else {
            console.log('❌ Job failed:', job.error_message);
          }
        }
        
      } catch (statusError) {
        console.log('⚠️ Status check failed:', statusError.response?.data || statusError.message);
      }
    }
    
    if (!jobCompleted) {
      console.log('⏰ Job is still running after 5 minutes. Check status later.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
if (require.main === module) {
  testScrapingSystem().then(() => {
    console.log('\n🏁 Test completed');
  }).catch(error => {
    console.error('💥 Test crashed:', error);
  });
}

module.exports = { testScrapingSystem, testUrls };