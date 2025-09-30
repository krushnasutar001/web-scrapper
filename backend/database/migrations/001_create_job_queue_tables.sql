-- Migration: Create job queue system tables
-- Date: 2024-01-21
-- Description: Creates enhanced job queue system with BullMQ integration, transactional job creation, and result management

USE linkedin_automation_saas;

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS job_result_files;
DROP TABLE IF EXISTS job_results;
DROP TABLE IF EXISTS job_account_assignments;
DROP TABLE IF EXISTS job_urls;

-- Enhanced jobs table with job queue support
DROP TABLE IF EXISTS jobs;
CREATE TABLE jobs (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID for job identification',
    user_id INT NOT NULL COMMENT 'Reference to user who created the job',
    job_type ENUM('profile_scraping', 'company_scraping', 'search_scraping', 'connection_requests') NOT NULL COMMENT 'Type of scraping job',
    
    -- Job Configuration
    title VARCHAR(255) NOT NULL COMMENT 'Human-readable job title',
    description TEXT NULL COMMENT 'Optional job description',
    config JSON NOT NULL COMMENT 'Job configuration parameters (URLs, search terms, etc.)',
    
    -- Queue Management
    queue_name VARCHAR(100) NOT NULL DEFAULT 'scraping' COMMENT 'BullMQ queue name',
    priority INT NOT NULL DEFAULT 0 COMMENT 'Job priority (higher = more priority)',
    delay_until DATETIME NULL COMMENT 'Delay job execution until this time',
    
    -- Status and Progress
    status ENUM('pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'paused') NOT NULL DEFAULT 'pending' COMMENT 'Current job status',
    progress DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Job progress percentage (0-100)',
    status_message TEXT NULL COMMENT 'Current status message or error details',
    current_url VARCHAR(1000) NULL COMMENT 'Currently processing URL',
    
    -- Results and Metrics
    results_count INT DEFAULT 0 COMMENT 'Number of results scraped',
    urls_total INT DEFAULT 0 COMMENT 'Total URLs to process',
    urls_completed INT DEFAULT 0 COMMENT 'URLs successfully processed',
    urls_failed INT DEFAULT 0 COMMENT 'URLs that failed processing',
    
    -- Error Handling
    error_message TEXT NULL COMMENT 'Last error message',
    error_code VARCHAR(50) NULL COMMENT 'Error code for categorization',
    retry_count INT DEFAULT 0 COMMENT 'Number of retry attempts',
    max_retries INT DEFAULT 3 COMMENT 'Maximum retry attempts allowed',
    
    -- Timing
    estimated_duration INT NULL COMMENT 'Estimated duration in seconds',
    actual_duration INT NULL COMMENT 'Actual duration in seconds',
    
    -- Credits and Billing
    credits_cost INT NOT NULL DEFAULT 0 COMMENT 'Credits required for this job',
    credits_deducted INT DEFAULT 0 COMMENT 'Credits actually deducted',
    
    -- File Management
    input_file_path VARCHAR(500) NULL COMMENT 'Path to uploaded input file (CSV/Excel)',
    output_file_path VARCHAR(500) NULL COMMENT 'Path to generated output file',
    
    -- Timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Job creation time',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
    queued_at DATETIME NULL COMMENT 'Time when job was queued',
    started_at DATETIME NULL COMMENT 'Job execution start time',
    completed_at DATETIME NULL COMMENT 'Job completion time',
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_jobs_user_id (user_id),
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_job_type (job_type),
    INDEX idx_jobs_queue_name (queue_name),
    INDEX idx_jobs_priority (priority),
    INDEX idx_jobs_created_at (created_at),
    INDEX idx_jobs_status_priority (status, priority),
    INDEX idx_jobs_user_status (user_id, status),
    INDEX idx_jobs_delay_until (delay_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Enhanced job queue system with BullMQ integration';

-- Job results table for storing scraped data
CREATE TABLE job_results (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID for result identification',
    job_id VARCHAR(36) NOT NULL COMMENT 'Reference to parent job',
    
    -- Result Data
    profile_data JSON NOT NULL COMMENT 'Scraped profile/company data in JSON format',
    source_url VARCHAR(1000) NULL COMMENT 'Original URL that was scraped',
    
    -- Metadata
    scraping_duration INT NULL COMMENT 'Time taken to scrape this result (seconds)',
    data_quality_score DECIMAL(3,2) NULL COMMENT 'Quality score of scraped data (0-1)',
    
    -- Timestamps
    scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When this data was scraped',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When this record was created',
    
    -- Foreign Keys
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_job_results_job_id (job_id),
    INDEX idx_job_results_scraped_at (scraped_at),
    INDEX idx_job_results_source_url (source_url(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Individual results from scraping jobs';

-- Job result files table for file uploads
CREATE TABLE job_result_files (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID for file identification',
    job_id VARCHAR(36) NOT NULL COMMENT 'Reference to parent job',
    
    -- File Information
    filename VARCHAR(255) NOT NULL COMMENT 'Generated filename on disk',
    original_name VARCHAR(255) NOT NULL COMMENT 'Original filename from upload',
    file_path VARCHAR(500) NOT NULL COMMENT 'Full path to file on disk',
    file_size BIGINT NOT NULL COMMENT 'File size in bytes',
    mime_type VARCHAR(100) NOT NULL COMMENT 'MIME type of the file',
    
    -- File Metadata
    file_hash VARCHAR(64) NULL COMMENT 'SHA-256 hash of file content',
    is_processed BOOLEAN DEFAULT FALSE COMMENT 'Whether file has been processed',
    
    -- Timestamps
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When file was uploaded',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When record was created',
    
    -- Foreign Keys
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_job_result_files_job_id (job_id),
    INDEX idx_job_result_files_uploaded_at (uploaded_at),
    INDEX idx_job_result_files_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Files uploaded as job results';

-- Job URLs table for tracking individual URL processing
CREATE TABLE job_urls (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID for URL identification',
    job_id VARCHAR(36) NOT NULL COMMENT 'Reference to parent job',
    
    -- URL Information
    url VARCHAR(1000) NOT NULL COMMENT 'URL to be processed',
    url_type ENUM('profile', 'company', 'search', 'other') NOT NULL COMMENT 'Type of URL',
    
    -- Processing Status
    status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') NOT NULL DEFAULT 'pending' COMMENT 'URL processing status',
    attempts INT DEFAULT 0 COMMENT 'Number of processing attempts',
    
    -- Results
    result_id VARCHAR(36) NULL COMMENT 'Reference to job_results if successful',
    error_message TEXT NULL COMMENT 'Error message if processing failed',
    
    -- Timing
    processing_duration INT NULL COMMENT 'Time taken to process this URL (seconds)',
    
    -- Timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When URL was added to job',
    started_at DATETIME NULL COMMENT 'When processing started',
    completed_at DATETIME NULL COMMENT 'When processing completed',
    
    -- Foreign Keys
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (result_id) REFERENCES job_results(id) ON DELETE SET NULL,
    
    -- Indexes
    INDEX idx_job_urls_job_id (job_id),
    INDEX idx_job_urls_status (status),
    INDEX idx_job_urls_url_type (url_type),
    INDEX idx_job_urls_job_status (job_id, status),
    INDEX idx_job_urls_url_hash (url(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Individual URLs to be processed in jobs';

-- Job account assignments table for LinkedIn account management
CREATE TABLE job_account_assignments (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID for assignment identification',
    job_id VARCHAR(36) NOT NULL COMMENT 'Reference to job',
    linkedin_account_id INT NOT NULL COMMENT 'Reference to LinkedIn account',
    
    -- Assignment Details
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When account was assigned',
    is_primary BOOLEAN DEFAULT FALSE COMMENT 'Whether this is the primary account for the job',
    
    -- Usage Tracking
    urls_processed INT DEFAULT 0 COMMENT 'Number of URLs processed with this account',
    last_used_at DATETIME NULL COMMENT 'Last time this account was used',
    
    -- Foreign Keys
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate assignments
    UNIQUE KEY unique_job_account (job_id, linkedin_account_id),
    
    -- Indexes
    INDEX idx_job_account_assignments_job_id (job_id),
    INDEX idx_job_account_assignments_account_id (linkedin_account_id),
    INDEX idx_job_account_assignments_assigned_at (assigned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LinkedIn account assignments for jobs';

-- Create triggers for automatic timestamp updates
DELIMITER //

CREATE TRIGGER tr_jobs_updated_at 
    BEFORE UPDATE ON jobs 
    FOR EACH ROW 
BEGIN 
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END//

DELIMITER ;

-- Insert sample data for testing (optional)
-- This can be removed in production
INSERT INTO jobs (
    id, user_id, job_type, title, description, config, 
    status, credits_cost, created_at
) VALUES (
    'sample-job-001', 1, 'profile_scraping', 'Sample Profile Scraping Job',
    'Test job for development and testing purposes',
    '{"urls": ["https://linkedin.com/in/sample"], "max_results": 10}',
    'pending', 5, CURRENT_TIMESTAMP
) ON DUPLICATE KEY UPDATE id = id;

-- Add comments to explain the schema
ALTER TABLE jobs COMMENT = 'Enhanced job queue system supporting BullMQ, transactional operations, and comprehensive result tracking';
ALTER TABLE job_results COMMENT = 'Individual scraped results with metadata and quality scoring';
ALTER TABLE job_result_files COMMENT = 'File uploads associated with job results';
ALTER TABLE job_urls COMMENT = 'Individual URL tracking within jobs for detailed progress monitoring';
ALTER TABLE job_account_assignments COMMENT = 'LinkedIn account assignments for distributed scraping across multiple accounts';