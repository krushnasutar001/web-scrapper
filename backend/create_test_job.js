require('dotenv').config();
const { query, initializeDatabase } = require('./utils/database');
const { v4: uuidv4 } = require('uuid');

async function createTestJob() {
  try {
    await initializeDatabase();
    
    // Get a user ID from the database
    const users = await query('SELECT id FROM users LIMIT 1');
    if (users.length === 0) {
      console.log('No users found. Please create a user first.');
      process.exit(1);
    }
    
    const userId = users[0].id;
    const jobId = uuidv4();
    
    // Create a completed job with results using valid job_type
    await query(`
      INSERT INTO jobs (
        id, user_id, job_name, job_type, status, max_results, 
        configuration, total_urls, processed_urls, successful_urls, 
        failed_urls, result_count, created_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `, [
      jobId, userId, 'Test Job with Results', 'profile_scraping', 'completed', 100,
      JSON.stringify({}), 5, 5, 5, 0, 25
    ]);
    
    // Create some test results for this job
      for (let i = 1; i <= 5; i++) {
        const resultId = uuidv4();
        const urlId = uuidv4();
        
        // First create a job_url entry
        await query(`
          INSERT INTO job_urls (
            id, job_id, url, status, created_at
          ) VALUES (?, ?, ?, ?, NOW())
        `, [urlId, jobId, `https://linkedin.com/in/test-profile-${i}`, 'completed']);
        
        // Then create the job_result
        await query(`
          INSERT INTO job_results (
            id, job_id, job_url_id, source_url, scraped_data, name, title, company, location, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          resultId, 
          jobId, 
          urlId,
          `https://linkedin.com/in/test-profile-${i}`,
          JSON.stringify({
            name: `Test User ${i}`,
            title: `Test Title ${i}`,
            company: `Test Company ${i}`,
            location: `Test Location ${i}`
          }),
          `Test User ${i}`,
          `Test Title ${i}`,
          `Test Company ${i}`,
          `Test Location ${i}`
        ]);
      }
    
    console.log('✅ Created test job with results:', jobId);
    console.log('✅ Added 5 test results');
    
    // Verify the job was created
    const job = await query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    console.log('✅ Job verification:', job[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestJob();