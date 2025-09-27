require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const LinkedInAccount = require('./models/LinkedInAccount');
const Job = require('./models/Job');
const { v4: uuidv4 } = require('uuid');

async function testScraping() {
  try {
    console.log('🚀 Starting scraping functionality test...');
    
    // Initialize database
    console.log('🔄 Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Get or create a test user
    const userId = 'af77771c-6504-470f-b05e-d68e045652a2';
    console.log('✅ Using user ID:', userId);
    
    // Create a test LinkedIn account with cookies
    console.log('🔨 Creating test LinkedIn account with cookies...');
    const timestamp = Date.now();
    const testAccount = await LinkedInAccount.create({
      user_id: userId,
      account_name: `Scraping Test Account ${timestamp}`,
      email: `scraping-test-${timestamp}@example.com`,
      username: `scraping_user_${timestamp}`,
      cookies_json: [
        { 
          name: 'li_at', 
          value: 'AQEDATEwNzQAAAGMxyz123abc456def789ghi012jkl345mno678pqr901stu234vwx567yza890',
          domain: '.linkedin.com',
          path: '/',
          secure: true,
          httpOnly: true
        },
        { 
          name: 'JSESSIONID', 
          value: 'ajax:1234567890123456789',
          domain: '.linkedin.com',
          path: '/',
          secure: true,
          httpOnly: false
        }
      ]
    });
    console.log('✅ Test account created:', testAccount.id);
    
    // Test cookie retrieval
    console.log('🔍 Testing cookie retrieval...');
    const cookies = await testAccount.getCookies();
    console.log('📋 Retrieved cookies:', cookies.length);
    
    if (cookies.length === 0) {
      throw new Error('Cookie retrieval failed - no cookies found');
    }
    
    console.log('✅ Cookie names:', cookies.map(c => c.name));
    
    // Create a scraping job
    console.log('🔨 Creating scraping job...');
    const jobData = {
      user_id: userId,
      job_name: 'Scraping Test Job',
      job_type: 'profile_scraping',
      max_results: 5,
      configuration: {
        account_selection_mode: 'specific',
        selectedAccountIds: [testAccount.id]
      },
      urls: [
        'https://www.linkedin.com/in/test-profile-1/',
        'https://www.linkedin.com/in/test-profile-2/',
        'https://www.linkedin.com/in/test-profile-3/'
      ]
    };
    
    const job = await Job.create(jobData);
    console.log('✅ Scraping job created:', job.id);
    
    // Verify job details
    const createdJob = await Job.findById(job.id);
    console.log('📋 Job details:', {
      id: createdJob.id,
      job_name: createdJob.job_name,
      job_type: createdJob.job_type,
      status: createdJob.status,
      total_urls: createdJob.total_urls,
      configuration: createdJob.configuration
    });
    
    // Test account availability
    console.log('🔍 Testing account availability...');
    const isAvailable = testAccount.isAvailable();
    console.log('📋 Account availability result:', isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE');
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await job.delete();
    console.log('✅ Deleted job:', job.id);
    
    await testAccount.delete();
    console.log('✅ Deleted LinkedIn account:', testAccount.id);
    
    console.log('🎉 SUCCESS: Scraping functionality test completed successfully!');
    
  } catch (error) {
    console.error('❌ Scraping test failed:', error.message);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testScraping();