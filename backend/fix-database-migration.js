const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabaseMigration() {
  console.log('🔧 Starting database migration fix...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connection successful');
    
    // First, check what tables exist
    console.log('📋 Checking existing tables...');
    const [tables] = await connection.execute("SHOW TABLES");
    console.log('Existing tables:', tables.map(t => Object.values(t)[0]));
    
    // Check if we need to migrate from scraping_jobs to jobs
    const hasScrapingJobs = tables.some(t => Object.values(t)[0] === 'scraping_jobs');
    const hasJobs = tables.some(t => Object.values(t)[0] === 'jobs');
    
    console.log(`Has scraping_jobs table: ${hasScrapingJobs}`);
    console.log(`Has jobs table: ${hasJobs}`);
    
    if (hasScrapingJobs && !hasJobs) {
      console.log('🔄 Migrating from scraping_jobs to jobs table...');
      
      // Create the jobs table with proper schema
      await connection.execute(`
        CREATE TABLE jobs (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          user_id VARCHAR(36) NOT NULL,
          job_name VARCHAR(255) NOT NULL,
          job_type ENUM('profile_scraping', 'company_scraping', 'search_result_scraping') NOT NULL,
          status ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
          max_results INT DEFAULT 100,
          configuration JSON,
          total_urls INT DEFAULT 0,
          processed_urls INT DEFAULT 0,
          successful_urls INT DEFAULT 0,
          failed_urls INT DEFAULT 0,
          result_count INT DEFAULT 0,
          error_message TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          paused_at TIMESTAMP NULL,
          resumed_at TIMESTAMP NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      
      console.log('✅ Created jobs table');
      
      // Migrate data from scraping_jobs to jobs (if any exists)
      try {
        await connection.execute(`
          INSERT INTO jobs (id, user_id, job_name, job_type, status, created_at, updated_at)
          SELECT 
            id, 
            COALESCE(created_by, 'mock-user-id') as user_id,
            job_name,
            CASE 
              WHEN job_type = 'profiles' THEN 'profile_scraping'
              WHEN job_type = 'companies' THEN 'company_scraping'
              ELSE 'profile_scraping'
            END as job_type,
            CASE 
              WHEN status = 'pending' THEN 'pending'
              WHEN status = 'fetching' THEN 'running'
              WHEN status = 'parsing' THEN 'running'
              WHEN status = 'completed' THEN 'completed'
              WHEN status = 'failed' THEN 'failed'
              WHEN status = 'cancelled' THEN 'cancelled'
              ELSE 'pending'
            END as status,
            created_at,
            updated_at
          FROM scraping_jobs
        `);
        console.log('✅ Migrated data from scraping_jobs to jobs');
      } catch (migrateError) {
        console.log('⚠️ No data to migrate or migration not needed:', migrateError.message);
      }
    }
    
    // Ensure we have the other required tables
    if (!tables.some(t => Object.values(t)[0] === 'users')) {
      console.log('🔄 Creating users table...');
      await connection.execute(`
        CREATE TABLE users (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP NULL
        )
      `);
      
      // Insert default test user
      await connection.execute(`
        INSERT INTO users (id, email, password_hash, name) VALUES 
        ('mock-user-id', 'test@example.com', '$2b$10$dummy.hash.for.testing', 'Test User')
      `);
      
      console.log('✅ Created users table with test user');
    }
    
    if (!tables.some(t => Object.values(t)[0] === 'linkedin_accounts')) {
      console.log('🔄 Creating linkedin_accounts table...');
      await connection.execute(`
        CREATE TABLE linkedin_accounts (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          user_id VARCHAR(36) NOT NULL,
          account_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          username VARCHAR(255),
          is_active BOOLEAN DEFAULT TRUE,
          validation_status ENUM('ACTIVE', 'PENDING', 'BLOCKED', 'FAILED') DEFAULT 'ACTIVE',
          daily_request_limit INT DEFAULT 150,
          requests_today INT DEFAULT 0,
          last_request_at TIMESTAMP NULL,
          cooldown_until TIMESTAMP NULL,
          blocked_until TIMESTAMP NULL,
          consecutive_failures INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_user_email (user_id, email)
        )
      `);
      console.log('✅ Created linkedin_accounts table');
    }
    
    if (!tables.some(t => Object.values(t)[0] === 'job_urls')) {
      console.log('🔄 Creating job_urls table...');
      await connection.execute(`
        CREATE TABLE job_urls (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          job_id VARCHAR(36) NOT NULL,
          url TEXT NOT NULL,
          status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
          error_message TEXT NULL,
          processed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )
      `);
      console.log('✅ Created job_urls table');
    }
    
    if (!tables.some(t => Object.values(t)[0] === 'job_results')) {
      console.log('🔄 Creating job_results table...');
      await connection.execute(`
        CREATE TABLE job_results (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          job_id VARCHAR(36) NOT NULL,
          job_url_id VARCHAR(36) NOT NULL,
          source_url TEXT NOT NULL,
          scraped_data JSON NOT NULL,
          name VARCHAR(255),
          title VARCHAR(255),
          company VARCHAR(255),
          location VARCHAR(255),
          email VARCHAR(255),
          linkedin_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
          FOREIGN KEY (job_url_id) REFERENCES job_urls(id) ON DELETE CASCADE
        )
      `);
      console.log('✅ Created job_results table');
    }
    
    if (!tables.some(t => Object.values(t)[0] === 'job_account_assignments')) {
      console.log('🔄 Creating job_account_assignments table...');
      await connection.execute(`
        CREATE TABLE job_account_assignments (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          job_id VARCHAR(36) NOT NULL,
          linkedin_account_id VARCHAR(36) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
          FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
          UNIQUE KEY unique_job_account (job_id, linkedin_account_id)
        )
      `);
      console.log('✅ Created job_account_assignments table');
    }
    
    // Test the schema
    console.log('🧪 Testing schema...');
    const testJobId = 'test-' + Date.now();
    
    try {
      await connection.execute(`
        INSERT INTO jobs (id, user_id, job_name, job_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())
      `, [testJobId, 'mock-user-id', 'Test Job', 'profile_scraping']);
      
      console.log('✅ Test job insertion successful');
      
      // Clean up
      await connection.execute('DELETE FROM jobs WHERE id = ?', [testJobId]);
      console.log('✅ Test job cleaned up');
      
    } catch (testError) {
      console.error('❌ Schema test failed:', testError.message);
    }
    
    console.log('🎉 Database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Database migration failed:', error.message);
    console.error('Error code:', error.code);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  fixDatabaseMigration().catch(console.error);
}

module.exports = { fixDatabaseMigration };