require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const LinkedInAccount = require('./models/LinkedInAccount');
const Job = require('./models/Job');
const { v4: uuidv4 } = require('uuid');

async function testJobCreation() {
  try {
    console.log('🚀 Starting job creation test...');
    
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Get a user ID (use the first user from the database)
    const { query } = require('./utils/database');
    const users = await query('SELECT id FROM users LIMIT 1');
    
    if (users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }
    
    const userId = users[0].id;
    console.log('✅ Using user ID:', userId);
    
    // Create a test LinkedIn account
    console.log('🔨 Creating test LinkedIn account...');
    const timestamp = Date.now();
    const testAccount = await LinkedInAccount.create({
      user_id: userId,
      account_name: `Test Job Account ${timestamp}`,
      email: `test-${timestamp}@example.com`, // Use timestamp to make it unique
      username: `test_user_${timestamp}`,
      cookies_json: [
        { name: 'li_at', value: 'test-cookie-value-1' },
        { name: 'JSESSIONID', value: 'test-cookie-value-2' }
      ],
      status: 'active'
    });
    console.log('✅ Test account created:', testAccount.id);
    
    // Test job creation
    const jobData = {
      user_id: userId,
      job_name: 'Test Job Creation',
      job_type: 'profile_scraping',
      max_results: 10,
      configuration: {
        account_selection_mode: 'specific',
        selectedAccountIds: [testAccount.id]
      },
      urls: [
        'https://www.linkedin.com/in/test-profile-1/',
        'https://www.linkedin.com/in/test-profile-2/'
      ]
    };
    
    console.log('🔨 Creating job with data:', jobData);
    
    const job = await Job.create(jobData);
    console.log('✅ Job created successfully:', job.id);
    
    // Verify job was created correctly
    const createdJob = await Job.findById(job.id);
    console.log('📋 Job details:', {
      id: createdJob.id,
      job_name: createdJob.job_name,
      job_type: createdJob.job_type,
      status: createdJob.status,
      total_urls: createdJob.total_urls,
      configuration: createdJob.configuration
    });
    
    // Test job URL creation
    if (createdJob.urls && createdJob.urls.length > 0) {
      console.log('🔗 Job URLs:');
      createdJob.urls.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url}`);
      });
    }
    
    // Clean up
    console.log('🧹 Cleaning up test data...');
    await job.delete();
    console.log('✅ Job deleted');
    
    await testAccount.delete();
    console.log('✅ Test account deleted');
    
    console.log('🎉 SUCCESS: Job creation test completed successfully!');
    
  } catch (error) {
    console.error('❌ Job creation test failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testJobCreation();