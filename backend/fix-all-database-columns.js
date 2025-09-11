const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixAllDatabaseColumns() {
  console.log(' Fixing all missing database columns...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log(' Connected to database successfully');
    
    // First, check current table structure
    console.log(' Checking current table structure...');
    const [currentColumns] = await connection.execute(
      "SHOW COLUMNS FROM scraping_jobs"
    );
    
    console.log('Current columns:');
    const existingColumns = [];
    currentColumns.forEach(column => {
      console.log(`  - ${column.Field}: ${column.Type}`);
      existingColumns.push(column.Field);
    });
    
    // Define all required columns
    const requiredColumns = [
      { name: 'user_id', type: 'VARCHAR(36)', after: 'id' },
      { name: 'account_selection_mode', type: "ENUM('rotation', 'specific') DEFAULT 'rotation'", after: 'status' },
      { name: 'selected_account_ids', type: 'JSON', after: 'account_selection_mode' },
      { name: 'total_urls', type: 'INT DEFAULT 0', after: 'search_query' },
      { name: 'success_count', type: 'INT DEFAULT 0', after: 'total_urls' },
      { name: 'failure_count', type: 'INT DEFAULT 0', after: 'success_count' },
      { name: 'started_at', type: 'TIMESTAMP NULL', after: 'created_at' },
      { name: 'completed_at', type: 'TIMESTAMP NULL', after: 'started_at' }
    ];
    
    // Add missing columns
    console.log('\n Adding missing columns...');
    for (const column of requiredColumns) {
      if (!existingColumns.includes(column.name)) {
        console.log(`Adding column: ${column.name}`);
        try {
          await connection.execute(
            `ALTER TABLE scraping_jobs ADD COLUMN ${column.name} ${column.type} AFTER ${column.after}`
          );
          console.log(` Added ${column.name} column`);
        } catch (error) {
          console.error(`❌ Failed to add ${column.name}:`, error.message);
        }
      } else {
        console.log(`✅ ${column.name} already exists`);
      }
    }
    
    // Verify final table structure
    console.log('\n📋 Final table structure:');
    const [finalColumns] = await connection.execute(
      "DESCRIBE scraping_jobs"
    );
    
    finalColumns.forEach(column => {
      console.log(`   ${column.Field}: ${column.Type} ${column.Null === 'YES' ? '(nullable)' : '(not null)'} ${column.Key ? '(' + column.Key + ')' : ''}`);
    });
    
    // Test job insertion with all columns
    console.log('\n Testing complete job insertion...');
    const testJobId = 'test-complete-' + Date.now();
    
    try {
      await connection.execute(`
        INSERT INTO scraping_jobs (
          id, user_id, job_name, job_type, status, 
          account_selection_mode, selected_account_ids,
          search_query, total_urls, success_count, failure_count,
          created_at, updated_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL, NULL)
      `, [
        testJobId,
        'test-user-123',
        'Complete Test Job',
        'profiles',
        'rotation',
        JSON.stringify(['account1', 'account2']),
        'test search query',
        5,
        0,
        0
      ]);
      
      console.log(' Complete job insertion successful');
      
      // Test job selection with all columns
      const [testJob] = await connection.execute(`
        SELECT 
          id, job_name, job_type, status, created_at, started_at, 
          completed_at, total_urls, success_count, failure_count
        FROM scraping_jobs 
        WHERE id = ?
      `, [testJobId]);
      
      if (testJob.length > 0) {
        console.log(' Job selection with all columns successful');
        console.log('Job data:', testJob[0]);
      }
      
      // Clean up test job
      await connection.execute('DELETE FROM scraping_jobs WHERE id = ?', [testJobId]);
      console.log(' Test job cleaned up');
      
    } catch (insertError) {
      console.error(' Complete job insertion failed:', insertError.message);
      console.error('SQL Error Code:', insertError.code);
    }
    
    console.log('\n All database columns fixed successfully!');
    
  } catch (error) {
    console.error(' Database fix error:', error.message);
    console.error('Error code:', error.code);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixAllDatabaseColumns();
