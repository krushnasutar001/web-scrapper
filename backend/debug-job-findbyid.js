require('dotenv').config();
const { initializeDatabase, query } = require('./utils/database');
const Job = require('./models/Job');
const { v4: uuidv4 } = require('uuid');

async function debugJobFindById() {
  try {
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Test user ID
    const userId = '553cd272-33e3-4af5-a30c-f695345dd0ca';
    
    console.log('\n🔍 Checking existing jobs in database...');
    const existingJobs = await query('SELECT id, job_name, job_type, status FROM jobs WHERE user_id = ?', [userId]);
    console.log('Existing jobs:', existingJobs);
    
    if (existingJobs.length > 0) {
      console.log('\n🔍 Testing findById with existing job...');
      const testJob = await Job.findById(existingJobs[0].id);
      
      if (testJob) {
        console.log('✅ Found existing job:', testJob.job_name);
      } else {
        console.log('❌ Could not find existing job with findById');
      }
    }
    
    console.log('\n📋 Creating new job with manual ID tracking...');
    const jobId = uuidv4();
    console.log('Generated job ID:', jobId);
    
    // Insert job manually to test
    const insertSql = `
      INSERT INTO jobs (
        id, user_id, job_name, job_type, status, max_results, 
        configuration, total_urls, processed_urls, successful_urls, 
        failed_urls, result_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, 0, 0, 0, 0, NOW(), NOW())
    `;
    
    await query(insertSql, [
      jobId, userId, 'Manual Test Job', 'profile_scraping', 50, 
      JSON.stringify({ test: true }), 2
    ]);
    
    console.log('✅ Job inserted manually');
    
    // Test findById immediately
    console.log('\n🔍 Testing findById immediately after insert...');
    const foundJob = await Job.findById(jobId);
    
    if (foundJob) {
      console.log('✅ Job found:', {
        id: foundJob.id,
        name: foundJob.job_name,
        type: foundJob.job_type,
        status: foundJob.status
      });
    } else {
      console.log('❌ Job not found with findById');
      
      // Check if job exists with raw query
      console.log('\n🔍 Checking with raw query...');
      const rawResult = await query('SELECT * FROM jobs WHERE id = ?', [jobId]);
      console.log('Raw query result:', rawResult);
    }
    
    console.log('\n✅ Debug completed');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    process.exit(0);
  }
}

debugJobFindById();