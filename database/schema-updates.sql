-- Scralytics Hub Database Schema Updates for Multi-User Testing
-- This file contains schema updates for proper ENUM status and foreign key constraints

USE linkedin_automation;

-- Update jobs table to use proper ENUM status
ALTER TABLE jobs 
MODIFY COLUMN status ENUM('pending','running','completed','failed','paused') NOT NULL DEFAULT 'pending';

-- Create scraping_jobs table if it doesn't exist (for compatibility with test requirements)
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  job_name VARCHAR(255) NOT NULL,
  job_type ENUM('profile','company','job_post') NOT NULL,
  status ENUM('pending','running','completed','failed','paused') NOT NULL DEFAULT 'pending',
  linkedin_account_id VARCHAR(36),
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
  
  -- Foreign key constraints
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE SET NULL,
  
  -- Indexes for performance
  INDEX idx_scraping_jobs_user_id (user_id),
  INDEX idx_scraping_jobs_status (status),
  INDEX idx_scraping_jobs_linkedin_account (linkedin_account_id),
  INDEX idx_scraping_jobs_created_at (created_at)
);

-- Create scraping_profiles table for job results with proper foreign keys
CREATE TABLE IF NOT EXISTS scraping_profiles (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  linkedin_url VARCHAR(500) NOT NULL,
  profile_data JSON,
  status ENUM('pending','scraped','failed') DEFAULT 'pending',
  error_message TEXT,
  scraped_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraints with CASCADE delete
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  -- Indexes for performance
  INDEX idx_scraping_profiles_job_id (job_id),
  INDEX idx_scraping_profiles_user_id (user_id),
  INDEX idx_scraping_profiles_status (status)
);

-- Create job_queue table for managing job processing
CREATE TABLE IF NOT EXISTS job_queue (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  linkedin_account_id VARCHAR(36),
  priority INT DEFAULT 0,
  status ENUM('queued','processing','completed','failed') DEFAULT 'queued',
  worker_id VARCHAR(100),
  assigned_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign key constraints
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE SET NULL,
  
  -- Indexes for queue processing
  INDEX idx_job_queue_status (status),
  INDEX idx_job_queue_priority (priority),
  INDEX idx_job_queue_linkedin_account (linkedin_account_id),
  INDEX idx_job_queue_created_at (created_at)
);

-- Create user_credits table for credit management
CREATE TABLE IF NOT EXISTS user_credits (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  total_credits INT DEFAULT 0,
  used_credits INT DEFAULT 0,
  remaining_credits INT GENERATED ALWAYS AS (total_credits - used_credits) STORED,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign key constraint
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  -- Index for performance
  INDEX idx_user_credits_user_id (user_id)
);

-- Create scraping_logs table for comprehensive logging
CREATE TABLE IF NOT EXISTS scraping_logs (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36),
  user_id VARCHAR(36),
  linkedin_account_id VARCHAR(36),
  log_level ENUM('DEBUG','INFO','WARN','ERROR','FATAL') NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata JSON,
  error_stack TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraints (allow NULL for system-level logs)
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE SET NULL,
  
  -- Indexes for log querying
  INDEX idx_scraping_logs_job_id (job_id),
  INDEX idx_scraping_logs_user_id (user_id),
  INDEX idx_scraping_logs_level (log_level),
  INDEX idx_scraping_logs_event_type (event_type),
  INDEX idx_scraping_logs_created_at (created_at)
);

-- Add chrome_profile_path to linkedin_accounts for profile isolation
ALTER TABLE linkedin_accounts 
ADD COLUMN IF NOT EXISTS chrome_profile_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS extension_jwt TEXT,
ADD COLUMN IF NOT EXISTS last_cookie_refresh TIMESTAMP NULL;

-- Create indexes for better performance on existing tables
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_user_id ON linkedin_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_status ON linkedin_accounts(validation_status);

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON linkedin_automation.* TO 'appuser'@'%';
FLUSH PRIVILEGES;

-- Show updated table structure
SHOW TABLES;