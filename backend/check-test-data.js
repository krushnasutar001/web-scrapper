require('dotenv').config();
const { initializeDatabase, query } = require('./utils/database');

async function checkTestData() {
  try {
    await initializeDatabase();
    console.log('🔍 Checking existing jobs and results...');
    
    // Check jobs
    const jobs = await query('SELECT id, job_name, job_type, status, result_count FROM jobs LIMIT 10');
    console.log('\n📋 Jobs in database:');
    console.table(jobs);
    
    // Check profile_results
    const profileResults = await query('SELECT job_id, full_name, headline, status, created_at FROM profile_results LIMIT 10');
    console.log('\n👤 Profile results in database:');
    console.table(profileResults);
    
    // Check if the test job exists
    const testJobId = '02f5650d-7008-44c9-9813-c66b7f8f37a9';
    const testJob = await query('SELECT * FROM jobs WHERE id = ?', [testJobId]);
    console.log(`\n🎯 Test job (${testJobId}):`);
    console.table(testJob);
    
    // Check results for test job
    const testResults = await query('SELECT * FROM profile_results WHERE job_id = ?', [testJobId]);
    console.log(`\n📊 Results for test job (${testJobId}):`);
    console.table(testResults);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkTestData();