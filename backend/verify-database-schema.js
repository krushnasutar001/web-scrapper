const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyDatabaseSchema() {
  console.log('🔍 Verifying database schema...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log(' Database connection successful');
    
    // Check scraping_jobs table structure
    console.log('📋 Checking scraping_jobs table structure...');
    const [tableStructure] = await connection.execute(
      "DESCRIBE scraping_jobs"
    );
    
    console.log('Current scraping_jobs table columns:');
    tableStructure.forEach(column => {
      console.log(`  ${column.Field}: ${column.Type} ${column.Null === 'YES' ? '(nullable)' : '(not null)'} ${column.Key ? '(' + column.Key + ')' : ''}`);
    });
    
    // Check if user_id column exists
    const userIdColumn = tableStructure.find(col => col.Field === 'user_id');
    if (userIdColumn) {
      console.log('✅ user_id column exists');
    } else {
      console.log('❌ user_id column is missing');
    }
    
    // Test a simple insert to see what fails
    console.log('🧪 Testing job insertion...');
    const testJobId = 'test-' + Date.now();
    
    try {
      await connection.execute(`
        INSERT INTO scraping_jobs (
          id, user_id, job_name, job_type, status, 
          account_selection_mode, selected_account_ids,
          search_query, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, NOW(), NOW())
      `, [
        testJobId,
        'test-user-123',
        'Test Job',
        'profiles',
        'rotation',
        JSON.stringify([]),
        null
      ]);
      
      console.log(' Test job insertion successful');
      
      // Clean up test job
      await connection.execute('DELETE FROM scraping_jobs WHERE id = ?', [testJobId]);
      console.log('✅ Test job cleaned up');
      
    } catch (insertError) {
      console.error('❌ Job insertion failed:', insertError.message);
      console.error('SQL Error Code:', insertError.code);
    }
    
  } catch (error) {
    console.error('❌ Database verification error:', error.message);
    console.error('Error code:', error.code);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

verifyDatabaseSchema();
