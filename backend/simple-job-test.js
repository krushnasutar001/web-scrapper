require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const Job = require('./models/Job');

async function simpleJobTest() {
  try {
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Test user ID
    const userId = '553cd272-33e3-4af5-a30c-f695345dd0ca';
    
    console.log('\n🔍 Testing Job.create directly...');
    
    const jobData = {
      user_id: userId,
      job_name: 'Simple Test Job',
      job_type: 'profile_scraping',
      max_results: 50,
      configuration: {
        accountSelectionMode: 'rotation',
        selectedAccountIds: []
      },
      urls: [
        'https://www.linkedin.com/in/satyanadella/',
        'https://linkedin.com/in/jeffweiner08'
      ]
    };
    
    console.log('Creating job with data:', jobData);
    
    const newJob = await Job.create(jobData);
    
    if (newJob) {
      console.log('✅ Job created successfully:', {
        id: newJob.id,
        name: newJob.job_name,
        type: newJob.job_type,
        status: newJob.status
      });
    } else {
      console.log('❌ Job.create returned null');
    }
    
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('❌ Test error:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    process.exit(0);
  }
}

simpleJobTest();