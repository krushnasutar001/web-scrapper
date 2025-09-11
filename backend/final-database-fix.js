const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabaseSchemaCompletely() {
  console.log(' Complete database schema fix...');
  
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
    
    // Check current table structure
    const [currentColumns] = await connection.execute(
      "DESCRIBE scraping_jobs"
    );
    
    const existingColumns = currentColumns.map(col => col.Field);
    console.log('Current columns:', existingColumns.join(', '));
    
    // Add missing columns that JobManager expects
    const requiredColumns = [
      { name: 'search_query', type: 'TEXT', after: 'selected_account_ids' },
      { name: 'total_urls', type: 'INT DEFAULT 0', after: 'search_query' },
      { name: 'success_count', type: 'INT DEFAULT 0', after: 'total_urls' },
      { name: 'failure_count', type: 'INT DEFAULT 0', after: 'success_count' }
    ];
    
    for (const column of requiredColumns) {
      if (!existingColumns.includes(column.name)) {
        console.log(`Adding missing column: ${column.name}`);
        try {
          await connection.execute(
            `ALTER TABLE scraping_jobs ADD COLUMN ${column.name} ${column.type} AFTER ${column.after}`
          );
          console.log(`✅ Added ${column.name}`);
        } catch (error) {
          console.log(` Column ${column.name} might already exist or error:`, error.message);
        }
      }
    }
    
    // Test complete job insertion
    console.log('\n Testing job insertion...');
    const testJobId = 'test-final-' + Date.now();
    
    try {
      await connection.execute(`
        INSERT INTO scraping_jobs (
          id, user_id, job_name, job_type, status, 
          account_selection_mode, selected_account_ids,
          search_query, total_urls, success_count, failure_count,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        testJobId,
        'test-user-123',
        'Final Test Job',
        'profiles',
        'rotation',
        JSON.stringify([]),
        null,
        5,
        0,
        0
      ]);
      
      console.log(' Job insertion successful');
      
      // Test job selection
      const [jobs] = await connection.execute(`
        SELECT 
          id, job_name, job_type, status, created_at, started_at, 
          completed_at, total_urls, success_count, failure_count
        FROM scraping_jobs 
        WHERE id = ?
      `, [testJobId]);
      
      if (jobs.length > 0) {
        console.log(' Job selection successful');
      }
      
      // Clean up
      await connection.execute('DELETE FROM scraping_jobs WHERE id = ?', [testJobId]);
      console.log(' Test job cleaned up');
      
    } catch (insertError) {
      console.error(' Job insertion failed:', insertError.message);
    }
    
    console.log('\n Database schema completely fixed!');
    
  } catch (error) {
    console.error(' Database fix error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixDatabaseSchemaCompletely();
