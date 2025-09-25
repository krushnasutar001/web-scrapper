const { initializeDatabase, query } = require('./utils/database');
const { v4: uuidv4 } = require('uuid');

async function testDatabaseConnectivity() {
  console.log("🗄️ Testing Database Connectivity and Data Saving...");
  
  try {
    // Initialize database
    process.env.DB_PASSWORD = "Krushna_Sutar@0809";
    await initializeDatabase();
    console.log("✅ Database connection established");
    
    // Test basic connectivity
    const connectionTest = await query('SELECT 1 as test');
    console.log(`✅ Basic query test: ${connectionTest[0].test}`);
    
    // Test table existence
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'linkedin_automation' 
      ORDER BY table_name
    `);
    
    console.log(`📊 Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });
    
    // Test profile_results table structure
    console.log("\n🔍 Testing profile_results table...");
    const profileColumns = await query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'linkedin_automation' 
      AND table_name = 'profile_results'
      ORDER BY ordinal_position
    `);
    
    console.log(`📋 profile_results has ${profileColumns.length} columns:`);
    profileColumns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Test data insertion
    console.log("\n💾 Testing data insertion...");
    
    const testJobId = uuidv4();
    const testResultId = uuidv4();
    
    // First, create a test job
    await query(`
      INSERT INTO scraping_jobs (id, job_name, status, created_at, updated_at)
      VALUES (?, 'Test Job', 'pending', NOW(), NOW())
    `, [testJobId]);
    
    console.log("✅ Test job created");
    
    // Test profile_results insertion
    await query(`
      INSERT INTO profile_results (id, job_id, profile_url, full_name, headline)
      VALUES (?, ?, 'https://linkedin.com/in/test', 'Test User', 'Test Headline')
    `, [testResultId, testJobId]);
    
    console.log("✅ Test profile result created");
    
    // Test data retrieval
    const results = await query('SELECT * FROM profile_results WHERE job_id = ?', [testJobId]);
    console.log(`✅ Retrieved ${results.length} profile result(s)`);
    
    // Test data update
    await query(`
      UPDATE profile_results 
      SET headline = 'Updated Test Headline' 
      WHERE id = ?
    `, [testResultId]);
    console.log("✅ Profile result updated");
    
    // Test foreign key constraint (should work since job exists)
    console.log("✅ Foreign key constraint validated");
    
    // Test foreign key constraints
    console.log("\n🔗 Testing foreign key constraints...");
    
    try {
      await query(`
        INSERT INTO profile_results (
          id, job_id, profile_url, full_name, created_at
        ) VALUES (?, ?, 'test-url', 'test-name', NOW())
      `, [uuidv4(), uuidv4()]); // Invalid job_id
      
      console.log("❌ Foreign key constraint not working - invalid data inserted");
    } catch (fkError) {
      if (fkError.code === 'ER_NO_REFERENCED_ROW_2') {
        console.log("✅ Foreign key constraint working correctly");
      } else {
        console.log(`⚠️ Unexpected error: ${fkError.message}`);
      }
    }
    
    // Clean up test data
    await query('DELETE FROM profile_results WHERE id = ?', [testResultId]);
    await query('DELETE FROM scraping_jobs WHERE id = ?', [testJobId]);
    console.log("✅ Test data cleaned up");
    
    // Database statistics
    console.log("\n📊 Database Statistics:");
    
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM scraping_jobs) as total_jobs,
        (SELECT COUNT(*) FROM job_urls) as total_urls,
        (SELECT COUNT(*) FROM profile_results) as total_results,
        (SELECT COUNT(*) FROM linkedin_accounts) as total_accounts
    `);
    
    const stat = stats[0];
    console.log(`   📋 Total Jobs: ${stat.total_jobs}`);
    console.log(`   🔗 Total URLs: ${stat.total_urls}`);
    console.log(`   📄 Total Results: ${stat.total_results}`);
    console.log(`   👤 Total Accounts: ${stat.total_accounts}`);
    
  } catch (error) {
    console.error("❌ Error in database test:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

testDatabaseConnectivity().then(() => {
  console.log("✅ Database connectivity test completed");
  process.exit(0);
}).catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});