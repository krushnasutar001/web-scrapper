-- Migration script to update job_urls table with new fields
-- Run this to add retry tracking and result linking capabilities

USE linkedin_automation_saas;

-- Add new columns to job_urls table (ignore errors if columns already exist)
ALTER TABLE job_urls ADD COLUMN retries INT DEFAULT 0;
ALTER TABLE job_urls ADD COLUMN max_retries INT DEFAULT 3;
ALTER TABLE job_urls ADD COLUMN result_id VARCHAR(36) NULL;
ALTER TABLE job_urls ADD COLUMN result_type ENUM('profile', 'company', 'search_result') NULL;
ALTER TABLE job_urls ADD COLUMN processing_time_ms INT NULL;
ALTER TABLE job_urls ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add index for performance (ignore error if exists)
CREATE INDEX idx_job_urls_status_retries ON job_urls(status, retries);

-- Update existing records to have updated_at timestamp
UPDATE job_urls SET updated_at = created_at WHERE updated_at IS NULL;

SELECT 'Job URLs table migration completed successfully!' as status;