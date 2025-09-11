const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkJobs() {
  console.log(' Checking jobs in database...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log(' Connected to database');
    
    // Check if scraping_jobs table exists
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'scraping_jobs'"
    );
    
    if (tables.length === 0) {
      console.log(' scraping_jobs table does not exist');
      return;
    }
    
    console.log(' scraping_jobs table exists');
    
    // Count all jobs
    const [countResult] = await connection.execute(
      "SELECT COUNT(*) as total FROM scraping_jobs"
    );
    
    console.log(`\n Total jobs in database: ${countResult[0].total}`);
    
    // Get recent jobs
    const [jobs] = await connection.execute(
      "SELECT id, job_name, job_type, status, created_at, updated_at FROM scraping_jobs ORDER BY created_at DESC LIMIT 10"
    );
    
    if (jobs.length > 0) {
      console.log('\n Recent Jobs:');
      jobs.forEach(job => {
        console.log(`  - ID: ${job.id}`);
        console.log(`    Name: ${job.job_name}`);
        console.log(`    Type: ${job.job_type}`);
        console.log(`    Status: ${job.status}`);
        console.log(`    Created: ${job.created_at}`);
        console.log(`    Updated: ${job.updated_at}`);
        console.log('');
      });
    } else {
      console.log('⚠️ No jobs found in database');
    }
    
  } catch (error) {
    console.error('❌ Database jobs check error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkJobs();
