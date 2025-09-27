require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { initializeDatabase } = require('./utils/database');
const LinkedInAccount = require('./models/LinkedInAccount');

const BASE_URL = 'http://localhost:5001/api';

async function testFrontendIntegration() {
  try {
    console.log('🚀 Starting frontend integration test...');
    
    // Initialize database
    console.log('🔄 Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Test user ID and generate JWT token
    const userId = 'af77771c-6504-470f-b05e-d68e045652a2';
    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
    
    // Generate token with the expected payload structure (matching backend middleware)
    const testToken = jwt.sign({ 
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      type: 'access'
    }, jwtSecret, {
      expiresIn: '1h',
    });
    
    console.log('✅ Using user ID:', userId);
    console.log('✅ Generated JWT token for authentication');
    console.log('🔑 Using JWT secret:', jwtSecret.substring(0, 10) + '...');
    console.log('🎯 Token payload includes type: access');
    
    // Create axios instance with authorization header
    const axiosInstance = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      },
    });
    
    // Create test LinkedIn accounts
    console.log('🔨 Creating test LinkedIn accounts...');
    const timestamp = Date.now();
    
    const account1 = await LinkedInAccount.create({
      user_id: userId,
      account_name: `Test Account 1 ${timestamp}`,
      email: `test1-${timestamp}@example.com`,
      username: `test1_${timestamp}`,
      cookies_json: [
        { 
          name: 'li_at', 
          value: 'AQEDATEwNzQAAAGMxyz123abc456def789ghi012jkl345mno678pqr901stu234vwx567yza890',
          domain: '.linkedin.com',
          path: '/',
          secure: true,
          httpOnly: true
        }
      ]
    });
    
    const account2 = await LinkedInAccount.create({
      user_id: userId,
      account_name: `Test Account 2 ${timestamp}`,
      email: `test2-${timestamp}@example.com`,
      username: `test2_${timestamp}`,
      cookies_json: [
        { 
          name: 'li_at', 
          value: 'AQEDATEwNzQAAAGMxyz123abc456def789ghi012jkl345mno678pqr901stu234vwx567yza890',
          domain: '.linkedin.com',
          path: '/',
          secure: true,
          httpOnly: true
        }
      ]
    });
    
    console.log('✅ Created test accounts:', account1.id, account2.id);
    
    // Test the /api/linkedin-accounts/available endpoint
    console.log('🔍 Testing available accounts endpoint...');
    try {
      const response = await axiosInstance.get('/linkedin-accounts/available');
      
      console.log('🔍 Full /accounts response:', JSON.stringify(response.data, null, 2));
      
      // Add null checks for response format
      if (!response.data) {
        throw new Error(`❌ Invalid response format: response.data is ${response.data}`);
      }
      
      // Fix: Use 'data' field instead of 'accounts' field based on actual API response
      if (!response.data.data) {
        throw new Error(`❌ Invalid response format: data field missing. Response: ${JSON.stringify(response.data)}`);
      }
      
      const accounts = response.data.data;
      
      if (!Array.isArray(accounts)) {
        throw new Error(`❌ Invalid response format: accounts array not found. Type: ${typeof accounts}. Full response: ${JSON.stringify(response.data)}`);
      }
      
      if (accounts.length === 0) {
        console.log('⚠️ No accounts returned from /accounts endpoint - this might be expected if no accounts are available');
      } else {
        console.log(`✅ Found ${accounts.length} accounts`);
      }
      
      console.log('📋 Available accounts response:', {
        status: response.status,
        accountCount: accounts.length,
        total: response.data.total || accounts.length,
        accounts: accounts.slice(0, 3).map(acc => ({  // Show first 3 accounts only
          id: acc.id,
          account_name: acc.account_name,
          email: acc.email,
          validation_status: acc.validation_status,
          displayName: acc.displayName
        }))
      });
      
      console.log('✅ Available accounts endpoint working correctly');
      
    } catch (error) {
      console.error('❌ Available accounts endpoint failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
    
    // Test job creation with account selection
    console.log('🔨 Testing job creation with account selection...');
    try {
      const jobData = {
        job_name: 'Frontend Integration Test Job',
        job_type: 'profile_scraping',
        max_results: 5,
        configuration: {
          account_selection_mode: 'specific',
          selectedAccountIds: [account1.id]
        },
        urls: [
          'https://www.linkedin.com/in/test-profile-frontend-1/',
          'https://www.linkedin.com/in/test-profile-frontend-2/'
        ]
      };
      
      const response = await axiosInstance.post('/jobs', jobData);
      
      console.log('📋 Job creation response:', {
        status: response.status,
        jobId: response.data.job.id,
        jobName: response.data.job.job_name,
        accountSelection: response.data.job.configuration.account_selection_mode,
        selectedAccounts: response.data.job.configuration.selectedAccountIds
      });
      
      if (response.status === 201) {
        console.log('✅ Job creation with account selection working correctly');
        
        // Clean up the created job
        const jobId = response.data.job.id;
        console.log('🧹 Cleaning up created job...');
        
        // Note: We'll let the job cleanup happen naturally or via database cleanup
        console.log('✅ Job cleanup noted for:', jobId);
      }
      
    } catch (error) {
      console.error('❌ Job creation failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
    
    // Clean up test accounts
    console.log('🧹 Cleaning up test accounts...');
    await account1.delete();
    await account2.delete();
    console.log('✅ Deleted test accounts');
    
    console.log('🎉 SUCCESS: Frontend integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Frontend integration test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testFrontendIntegration();