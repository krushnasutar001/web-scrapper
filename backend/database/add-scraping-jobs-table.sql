-- Add missing scraping_jobs table
USE linkedin_automation_saas;

-- Create scraping_jobs table if it doesn't exist
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    job_type ENUM('profile_scraping', 'company_scraping', 'search_result_scraping') NOT NULL,
    status ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add indexes for performance (check if they exist first)
SET @sql = 'ALTER TABLE scraping_jobs ADD INDEX idx_scraping_jobs_user_id (user_id)';
SET @sql_check = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema = 'linkedin_automation_saas' AND table_name = 'scraping_jobs' AND index_name = 'idx_scraping_jobs_user_id');
SET @sql = IF(@sql_check = 0, @sql, 'SELECT "Index idx_scraping_jobs_user_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = 'ALTER TABLE scraping_jobs ADD INDEX idx_scraping_jobs_status (status)';
SET @sql_check = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema = 'linkedin_automation_saas' AND table_name = 'scraping_jobs' AND index_name = 'idx_scraping_jobs_status');
SET @sql = IF(@sql_check = 0, @sql, 'SELECT "Index idx_scraping_jobs_status already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;