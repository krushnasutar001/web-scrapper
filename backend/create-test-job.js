const { initializeDatabase, query } = require('./utils/database');
const Job = require('./models/Job');

async function createTestJob() {
  try {
    await initializeDatabase();
    console.log('📊 Creating test job with results...');
    
    // Create a test job
    const jobData = {
      user_id: 1,
      job_name: 'Test Download Job',
      job_type: 'linkedin_search',
      search_query: 'software engineer',
      status: 'completed',
      result_count: 3,
      started_at: new Date(),
      completed_at: new Date()
    };
    
    const job = await Job.create(jobData);
    console.log(`✅ Created job with ID: ${job.id}`);
    
    // Add some test results
    const testResults = [
      {
        job_id: job.id,
        name: 'John Doe',
        title: 'Software Engineer',
        company: 'Tech Corp',
        location: 'San Francisco, CA',
        email: 'john.doe@example.com',
        linkedin_url: 'https://linkedin.com/in/johndoe',
        source_url: 'https://linkedin.com/in/johndoe',
        created_at: new Date()
      },
      {
        job_id: job.id,
        name: 'Jane Smith',
        title: 'Senior Developer',
        company: 'Innovation Inc',
        location: 'New York, NY',
        email: 'jane.smith@example.com',
        linkedin_url: 'https://linkedin.com/in/janesmith',
        source_url: 'https://linkedin.com/in/janesmith',
        created_at: new Date()
      },
      {
        job_id: job.id,
        name: 'Mike Johnson',
        title: 'Full Stack Developer',
        company: 'StartupXYZ',
        location: 'Austin, TX',
        email: 'mike.johnson@example.com',
        linkedin_url: 'https://linkedin.com/in/mikejohnson',
        source_url: 'https://linkedin.com/in/mikejohnson',
        created_at: new Date()
      }
    ];
    
    for (const result of testResults) {
      const sql = `
        INSERT INTO job_results 
        (job_id, name, title, company, location, email, linkedin_url, source_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await query(sql, [
        result.job_id,
        result.name,
        result.title,
        result.company,
        result.location,
        result.email,
        result.linkedin_url,
        result.source_url,
        result.created_at
      ]);
    }
    
    console.log(`✅ Added ${testResults.length} test results`);
    console.log(`🎯 Test job ID: ${job.id}`);
    console.log('📥 You can now test downloads with this job ID');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating test job:', error);
    process.exit(1);
  }
}

createTestJob();