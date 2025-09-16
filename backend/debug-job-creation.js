require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const Job = require('./models/Job');
const { v4: uuidv4 } = require('uuid');

async function debugJobCreation() {
  try {
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Test user ID (from our previous tests)
    const userId = '553cd272-33e3-4af5-a30c-f695345dd0ca';
    
    console.log('\n🔍 Testing job creation...');
    
    const jobData = {
      user_id: userId,
      job_name: 'Debug Test Job',
      job_type: 'profile_scraping',
      max_results: 50,
      configuration: {
        accountSelectionMode: 'rotation',
        selectedAccountIds: [],
        urls: [
          'https://www.linkedin.com/in/satyanadella/',
          'https://linkedin.com/in/jeffweiner08'
        ]
      },
      urls: [
        'https://www.linkedin.com/in/satyanadella/',
        'https://linkedin.com/in/jeffweiner08'
      ]
    };
    
    console.log('Job data:', jobData);
    
    console.log('\n📋 Creating job...');
    const newJob = await Job.create(jobData);
    
    if (newJob) {
      console.log('✅ Job created successfully:', {
        id: newJob.id,
        name: newJob.job_name,
        type: newJob.job_type,
        status: newJob.status,
        total_urls: newJob.total_urls
      });
    } else {
      console.log('❌ Job creation returned null');
    }
    
    // Test finding the job by ID if it was created
    if (newJob && newJob.id) {
      console.log('\n🔍 Testing job retrieval...');
      const foundJob = await Job.findById(newJob.id);
      
      if (foundJob) {
        console.log('✅ Job found:', foundJob.job_name);
      } else {
        console.log('❌ Job not found after creation');
      }
    }
    
    console.log('\n✅ Debug completed');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    process.exit(0);
  }
}

debugJobCreation();