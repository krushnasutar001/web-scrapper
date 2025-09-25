require('dotenv').config();
const { query, initializeDatabase } = require('./utils/database');

async function checkJobs() {
  try {
    await initializeDatabase();
    
    const jobs = await query('SELECT id, job_name, status, result_count FROM jobs WHERE status = "completed" LIMIT 5');
    console.log('Completed jobs:', jobs);
    
    const allJobs = await query('SELECT id, job_name, status, result_count FROM jobs LIMIT 10');
    console.log('All jobs:', allJobs);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkJobs();