const mysql = require('mysql2/promise');

async function createTables() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation_saas'
    });

    console.log('Creating users table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
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
    console.log('✅ Users table created');

    console.log('Creating linkedin_accounts table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS linkedin_accounts (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        user_id VARCHAR(36) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(255),
        cookies TEXT,
        proxy_url VARCHAR(500),
        user_agent TEXT,
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
        UNIQUE KEY unique_user_account_name (user_id, account_name)
      )
    `);
    console.log('✅ LinkedIn accounts table created');

    console.log('Creating jobs table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        job_name VARCHAR(255) NOT NULL,
        job_type ENUM('profile', 'company', 'search') NOT NULL,
        status ENUM('pending', 'running', 'completed', 'failed', 'paused') DEFAULT 'pending',
        max_results INT DEFAULT 100,
        configuration JSON,
        total_urls INT DEFAULT 0,
        processed_urls INT DEFAULT 0,
        successful_urls INT DEFAULT 0,
        failed_urls INT DEFAULT 0,
        result_count INT DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        paused_at TIMESTAMP NULL,
        resumed_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_jobs_user_id (user_id),
        INDEX idx_jobs_status (status),
        INDEX idx_jobs_type (job_type),
        INDEX idx_jobs_created_at (created_at)
      )
    `);
    console.log('✅ Jobs table created');

    console.log('Creating job_urls table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS job_urls (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        job_id VARCHAR(36) NOT NULL,
        url TEXT NOT NULL,
        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        retries INT DEFAULT 0,
        max_retries INT DEFAULT 3,
        error_message TEXT NULL,
        result_id VARCHAR(36) NULL,
        result_type ENUM('profile', 'company', 'search_result') NULL,
        processing_time_ms INT NULL,
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        INDEX idx_job_urls_status_retries (status, retries)
      )
    `);
    console.log('✅ Job URLs table created');

    console.log('Creating job_results table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS job_results (
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
        phone VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (job_url_id) REFERENCES job_urls(id) ON DELETE CASCADE,
        INDEX idx_job_results_job_id (job_id),
        INDEX idx_job_results_created_at (created_at)
      )
    `);
    console.log('✅ Job results table created');

    console.log('Creating job_account_assignments table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS job_account_assignments (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        job_id VARCHAR(36) NOT NULL,
        linkedin_account_id VARCHAR(36) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_job_account (job_id, linkedin_account_id),
        INDEX idx_job_account_assignments_job_id (job_id),
        INDEX idx_job_account_assignments_account_id (linkedin_account_id)
      )
    `);
    console.log('✅ Job account assignments table created');

    await connection.end();
    console.log('🎉 All tables created successfully!');
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    process.exit(1);
  }
}

createTables();