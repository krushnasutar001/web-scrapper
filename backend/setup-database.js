const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function setupDatabase() {
  let connection;
  
  try {
    console.log('🔄 Connecting to MySQL server...');
    
    // Connect to MySQL server (without specifying database)
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Krushna_Sutar@0809'
    });
    
    console.log('✅ Connected to MySQL server');
    
    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'linkedin_automation';
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database '${dbName}' created or already exists`);
    
    // Close connection and reconnect to the specific database
    await connection.end();
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Krushna_Sutar@0809',
      database: dbName
    });
    
    console.log(`✅ Connected to database '${dbName}'`);
    
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        last_login_at DATETIME,
        email_verified_at DATETIME,
        reset_password_token VARCHAR(255),
        reset_password_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Users table created');
    
    // Create jobs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        type ENUM('profile', 'company', 'search', 'jobPosting') NOT NULL,
        query TEXT NOT NULL,
        status ENUM('queued', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'queued',
        progress INT DEFAULT 0,
        total_results INT DEFAULT 0,
        processed_results INT DEFAULT 0,
        error_message TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        scheduled_for DATETIME,
        cron_expression VARCHAR(255),
        is_recurring BOOLEAN DEFAULT FALSE,
        max_results INT DEFAULT 100,
        retry_count INT DEFAULT 0,
        configuration JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_type (type),
        INDEX idx_created_at (created_at),
        INDEX idx_scheduled_for (scheduled_for)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Jobs table created');
    
    // Create results table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS results (
        id VARCHAR(36) PRIMARY KEY,
        job_id VARCHAR(36) NOT NULL,
        data JSON NOT NULL,
        unique_key VARCHAR(255),
        source ENUM('linkedin', 'api', 'manual') DEFAULT 'linkedin',
        quality ENUM('high', 'medium', 'low') DEFAULT 'medium',
        is_processed BOOLEAN DEFAULT FALSE,
        processing_notes TEXT,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_validated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        INDEX idx_job_id (job_id),
        INDEX idx_unique_key (unique_key),
        INDEX idx_quality (quality),
        INDEX idx_is_processed (is_processed),
        INDEX idx_scraped_at (scraped_at),
        UNIQUE KEY unique_job_result (job_id, unique_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Results table created');
    
    // Create enhanced linkedin_accounts table with multi-account support
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS linkedin_accounts (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        username VARCHAR(255),
        session_cookie TEXT NOT NULL,
        account_uid VARCHAR(100) UNIQUE,
        proxy_url VARCHAR(500),
        proxy_type ENUM('http', 'https', 'socks4', 'socks5') DEFAULT 'http',
        proxy_username VARCHAR(255),
        proxy_password VARCHAR(255),
        status ENUM('active', 'inactive', 'blocked', 'cooldown') DEFAULT 'active',
        daily_request_limit INT DEFAULT 150,
        daily_request_count INT DEFAULT 0,
        total_requests INT DEFAULT 0,
        last_used DATETIME NULL,
        cooldown_until DATETIME NULL,
        min_delay_seconds INT DEFAULT 30,
        max_delay_seconds INT DEFAULT 90,
        success_rate DECIMAL(5,2) DEFAULT 100.00,
        last_error TEXT NULL,
        error_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_accounts (user_id),
        INDEX idx_account_status (status),
        INDEX idx_account_uid (account_uid),
        INDEX idx_last_used (last_used),
        INDEX idx_daily_usage (daily_request_count, daily_request_limit)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ LinkedIn accounts table created');
    
    console.log('🎉 Database setup completed successfully!');
    console.log('📊 Database structure:');
    console.log('   - users: User accounts and authentication');
    console.log('   - jobs: Scraping job management');
    console.log('   - results: Scraped LinkedIn data');
    console.log('   - linkedin_accounts: Multi-account management with rotation');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Please check your MySQL credentials in the .env file');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 Please make sure MySQL server is running');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the setup
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;