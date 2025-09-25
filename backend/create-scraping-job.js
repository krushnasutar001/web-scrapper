require('dotenv').config();
const { initializeDatabase, query } = require('./utils/database');

async function createScrapingJob() {
  try {
    await initializeDatabase();
    console.log('🔍 Creating scraping job entry...');
    
    const testJobId = '02f5650d-7008-44c9-9813-c66b7f8f37a9';
    
    // Create scraping job entry
    const sql = `
      INSERT INTO scraping_jobs (
        id, job_name, job_type, status, stage, progress, 
        total_items, fetched_items, parsed_items, failed_items,
        account_id, input_data, job_config, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    await query(sql, [
      testJobId,
      'Test Profile Scraping Job',
      'profiles',
      'completed',
      'completed',
      100,
      3,
      3,
      3,
      0,
      'test-account-1',
      JSON.stringify({urls: ['https://linkedin.com/in/john-doe', 'https://linkedin.com/in/jane-smith', 'https://linkedin.com/in/mike-johnson']}),
      JSON.stringify({max_results: 100, delay: 2000})
    ]);
    
    console.log(`✅ Created scraping job: ${testJobId}`);
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating scraping job:', error);
    process.exit(1);
  }
}

createScrapingJob();