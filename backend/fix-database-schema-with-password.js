const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabaseSchema() {
  console.log('🔧 Fixing database schema issues...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database successfully');
    
    // Check if scraping_jobs table exists
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'scraping_jobs'"
    );
    
    if (tables.length === 0) {
      console.log('📋 Creating scraping_jobs table...');
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
      console.log(' Created scraping_jobs table with user_id column');
    } else {
      console.log(' Checking scraping_jobs table structure...');
      
      // Check if user_id column exists
      const [columns] = await connection.execute(
        "SHOW COLUMNS FROM scraping_jobs LIKE 'user_id'"
      );
      
      if (columns.length === 0) {
        console.log(' Adding missing user_id column...');
        await connection.execute(
          "ALTER TABLE scraping_jobs ADD COLUMN user_id VARCHAR(36) AFTER id"
        );
        console.log(' Added user_id column successfully');
      } else {
        console.log(' user_id column already exists');
      }
    }
    
    // Verify the table structure
    console.log(' Verifying table structure...');
    const [tableStructure] = await connection.execute(
      "DESCRIBE scraping_jobs"
    );
    
    console.log(' Current scraping_jobs table structure:');
    tableStructure.forEach(column => {
      console.log(`  - ${column.Field}: ${column.Type} ${column.Null === 'YES' ? '(nullable)' : '(not null)'}`);
    });
    
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
        console.log(' Found duplicate last_used_at columns');
        console.log(' Manual intervention may be needed for duplicate columns');
      } else {
        console.log(' No duplicate columns found in linkedin_accounts');
      }
    }
    
    console.log(' Database schema fix completed successfully!');
    
  } catch (error) {
    console.error(' Database fix error:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(' Access denied - check MySQL username and password');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error(' Database does not exist - creating it...');
      try {
        const tempConnection = await mysql.createConnection({
          host: dbConfig.host,
          user: dbConfig.user,
          password: dbConfig.password
        });
        await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        console.log(' Database created successfully');
        await tempConnection.end();
        
        // Retry with the new database
        connection = await mysql.createConnection(dbConfig);
        console.log(' Connected to newly created database');
      } catch (createError) {
        console.error(' Failed to create database:', createError.message);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixDatabaseSchema();
