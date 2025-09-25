/**
 * Test script to verify scraping fixes
 * Run this after making the fixes to test the system
 */

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

async function testScrapingFix() {
  console.log('🧪 Testing LinkedIn Scraping Fixes...');
  
  // Database connection
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Krushna_Sutar@0809',
    database: 'linkedin_automation_saas'
  });
  
  try {
    // 1. Check LinkedIn accounts
    console.log('\n1️⃣ Checking LinkedIn accounts...');
    const [accounts] = await connection.execute(
      'SELECT id, account_name, email, is_active, validation_status FROM linkedin_accounts'
    );
    console.log(`✅ Found ${accounts.length} LinkedIn accounts:`);
    accounts.forEach(acc => {
      console.log(`   - ${acc.account_name} (${acc.email || 'no email'}) - ${acc.validation_status}`);
    });
    
    // 2. Check cookie files
    console.log('\n2️⃣ Checking cookie files...');
    const fs = require('fs');
    const path = require('path');
    const cookiesDir = path.join(__dirname, 'backend', 'cookies');
    
    for (const account of accounts) {
      const cookieFile = path.join(cookiesDir, `${account.id}.json`);
      if (fs.existsSync(cookieFile)) {
        console.log(`   ✅ Cookie file exists for ${account.account_name}`);
      } else {
        console.log(`   ❌ Cookie file missing for ${account.account_name}`);
      }
    }
    
    // 3. Create a test job
    console.log('\n3️⃣ Creating test job...');
    const userId = 'mock-user-id'; // Using the default test user
    const jobId = uuidv4();
    const testUrls = [
      'https://www.linkedin.com/in/shweta-biradar-1b5001257/',
      'https://www.linkedin.com/in/varshapawar1907/'
    ];
    
    // Insert test job
    await connection.execute(
      `INSERT INTO jobs (
        id, user_id, job_name, job_type, status, max_results, 
        configuration, total_urls, processed_urls, successful_urls, 
        failed_urls, result_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, 0, 0, 0, 0, NOW(), NOW())`,
      [jobId, userId, 'Test Scraping Fix', 'profile_scraping', 100, JSON.stringify({}), testUrls.length]
    );
    
    // Insert test URLs
    for (const url of testUrls) {
      const urlId = uuidv4();
      await connection.execute(
        'INSERT INTO job_urls (id, job_id, url, status, created_at) VALUES (?, ?, ?, "pending", NOW())',
        [urlId, jobId, url]
      );
    }
    
    console.log(`✅ Created test job: ${jobId}`);
    console.log(`   - Job name: Test Scraping Fix`);
    console.log(`   - URLs: ${testUrls.length}`);
    console.log(`   - Status: pending`);
    
    // 4. Check if job worker will pick it up
    console.log('\n4️⃣ Job created successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Start the backend server: cd backend && npm start');
    console.log('   2. Check the server logs for job processing');
    console.log('   3. Monitor the job status in the database');
    console.log('   4. Check for any "incrementRequestCount is not a function" errors');
    
    console.log('\n🔍 Monitor with these SQL queries:');
    console.log('   - Job status: SELECT id, job_name, status, error_message FROM jobs WHERE id = "' + jobId + '";');
    console.log('   - URL status: SELECT url, status, error_message FROM job_urls WHERE job_id = "' + jobId + '";');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await connection.end();
  }
}

// Run the test
if (require.main === module) {
  testScrapingFix().catch(console.error);
}

module.exports = testScrapingFix;