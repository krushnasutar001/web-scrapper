const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabaseSchema() {
  console.log(' Fixing database schema issues...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    
    // Check if scraping_jobs table exists
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'scraping_jobs'"
    );
    
    if (tables.length === 0) {
      console.log(' Creating scraping_jobs table...');
      await connection.execute(`
        CREATE TABLE scraping_jobs (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36),
          job_name VARCHAR(255) NOT NULL,
          job_type ENUM('profiles', 'companies', 'sales_navigator') NOT NULL,
          status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
          account_selection_mode ENUM('rotation', 'specific') DEFAULT 'rotation',
          selected_account_ids JSON,
          search_query TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Created scraping_jobs table');
    } else {
      console.log('📋 Checking scraping_jobs table structure...');
      
      // Check if user_id column exists
      const [columns] = await connection.execute(
        "SHOW COLUMNS FROM scraping_jobs LIKE 'user_id'"
      );
      
      if (columns.length === 0) {
        console.log('➕ Adding user_id column...');
        await connection.execute(
          "ALTER TABLE scraping_jobs ADD COLUMN user_id VARCHAR(36) AFTER id"
        );
        console.log(' Added user_id column');
      } else {
        console.log(' user_id column already exists');
      }
    }
    
    // Check linkedin_accounts table for duplicate columns
    console.log(' Checking linkedin_accounts table...');
    const [accountTables] = await connection.execute(
      "SHOW TABLES LIKE 'linkedin_accounts'"
    );
    
    if (accountTables.length > 0) {
      const [accountColumns] = await connection.execute(
        "SHOW COLUMNS FROM linkedin_accounts"
      );
      
      const lastUsedColumns = accountColumns.filter(col => col.Field === 'last_used_at');
      if (lastUsedColumns.length > 1) {
        console.log(' Fixing duplicate last_used_at columns...');
        // This would require more complex logic to handle duplicates
        console.log(' Duplicate column detected - may need manual intervention');
      }
    }
    
    console.log(' Database schema fix completed!');
    
  } catch (error) {
    console.error(' Database fix error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixDatabaseSchema();
