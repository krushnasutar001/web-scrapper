-- Enhanced Job Management Database Schema
-- Creates tables for comprehensive job tracking and result management

-- Scraping Jobs Table
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    job_type ENUM('profile', 'profiles', 'company', 'companies', 'search') NOT NULL,
    status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    
    -- Account selection
    account_selection_mode ENUM('rotation', 'specific') DEFAULT 'rotation',
    selected_account_ids JSON,
    
    -- Search parameters
    search_query TEXT,
    
    -- Timing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    failed_at DATETIME NULL,
    
    -- Statistics
    total_urls INT DEFAULT 0,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    
    -- Indexes
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    
    -- Foreign key
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Job URLs Table
CREATE TABLE IF NOT EXISTS job_urls (
    id CHAR(36) PRIMARY KEY,
    job_id CHAR(36) NOT NULL,
    url TEXT NOT NULL,
    url_type ENUM('profile', 'company', 'search') NULL,
    status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') DEFAULT 'pending',
    
    -- Processing info
    processed_at DATETIME NULL,
    processing_duration INT NULL, -- in milliseconds
    
    -- Error handling
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Timing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_job_id (job_id),
    INDEX idx_status (status),
    INDEX idx_url_type (url_type),
    
    -- Foreign key
    FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE
);

-- Scraping Results Table
CREATE TABLE IF NOT EXISTS scraping_results (
    id CHAR(36) PRIMARY KEY,
    job_id CHAR(36) NOT NULL,
    url_id CHAR(36) NOT NULL,
    url TEXT NOT NULL,
    
    -- Result status
    status ENUM('success', 'failed', 'partial') NOT NULL,
    
    -- Extracted data (JSON format)
    data JSON,
    
    -- File references
    html_file VARCHAR(500),
    screenshot_file VARCHAR(500),
    
    -- Processing metadata
    account_used VARCHAR(255),
    processing_time INT, -- in milliseconds
    page_load_time INT, -- in milliseconds
    
    -- Error handling
    error_message TEXT,
    error_code VARCHAR(50),
    
    -- Timing
    scraped_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_job_id (job_id),
    INDEX idx_url_id (url_id),
    INDEX idx_status (status),
    INDEX idx_scraped_at (scraped_at),
    
    -- Foreign keys
    FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (url_id) REFERENCES job_urls(id) ON DELETE CASCADE
);

-- Profile Data Table (Structured profile information)
CREATE TABLE IF NOT EXISTS profile_data (
    id CHAR(36) PRIMARY KEY,
    result_id CHAR(36) NOT NULL,
    
    -- Basic info
    profile_url TEXT NOT NULL,
    full_name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    headline TEXT,
    about TEXT,
    
    -- Location
    location VARCHAR(255),
    country VARCHAR(100),
    city VARCHAR(100),
    
    -- Professional info
    industry VARCHAR(255),
    current_job_title VARCHAR(255),
    current_company VARCHAR(255),
    current_company_url TEXT,
    current_job_start DATE,
    current_job_end DATE,
    current_job_location VARCHAR(255),
    current_job_type VARCHAR(100),
    current_job_description TEXT,
    
    -- Contact info
    email VARCHAR(255),
    phone VARCHAR(50),
    website TEXT,
    
    -- Social metrics
    connections VARCHAR(50),
    follower_count VARCHAR(50),
    
    -- Activity
    last_activity VARCHAR(255),
    
    -- Metadata
    scraped_at DATETIME NOT NULL,
    scraper_version VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_result_id (result_id),
    INDEX idx_full_name (full_name),
    INDEX idx_company (current_company),
    INDEX idx_location (location),
    
    -- Foreign key
    FOREIGN KEY (result_id) REFERENCES scraping_results(id) ON DELETE CASCADE
);

-- Company Data Table (Structured company information)
CREATE TABLE IF NOT EXISTS company_data (
    id CHAR(36) PRIMARY KEY,
    result_id CHAR(36) NOT NULL,
    
    -- Basic info
    company_url TEXT NOT NULL,
    company_name VARCHAR(255),
    company_industry VARCHAR(255),
    company_description TEXT,
    
    -- Details
    company_size VARCHAR(100),
    company_hq VARCHAR(255),
    company_type VARCHAR(100),
    company_specialties TEXT,
    
    -- Online presence
    company_website TEXT,
    company_followers VARCHAR(50),
    
    -- Metadata
    scraped_at DATETIME NOT NULL,
    scraper_version VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_result_id (result_id),
    INDEX idx_company_name (company_name),
    INDEX idx_industry (company_industry),
    
    -- Foreign key
    FOREIGN KEY (result_id) REFERENCES scraping_results(id) ON DELETE CASCADE
);

-- Job Downloads Table (Track result downloads)
CREATE TABLE IF NOT EXISTS job_downloads (
    id CHAR(36) PRIMARY KEY,
    job_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    
    -- File info
    filename VARCHAR(500) NOT NULL,
    file_format ENUM('csv', 'json', 'excel') NOT NULL,
    file_size BIGINT,
    file_path TEXT,
    
    -- Download info
    download_count INT DEFAULT 0,
    last_downloaded_at DATETIME,
    
    -- Timing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME, -- Optional expiration
    
    -- Indexes
    INDEX idx_job_id (job_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    
    -- Foreign keys
    FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Job Logs Table (Detailed logging)
CREATE TABLE IF NOT EXISTS job_logs (
    id CHAR(36) PRIMARY KEY,
    job_id CHAR(36) NOT NULL,
    
    -- Log details
    log_level ENUM('info', 'warning', 'error', 'debug') NOT NULL,
    message TEXT NOT NULL,
    details JSON,
    
    -- Context
    url TEXT,
    account_used VARCHAR(255),
    
    -- Timing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_job_id (job_id),
    INDEX idx_log_level (log_level),
    INDEX idx_created_at (created_at),
    
    -- Foreign key
    FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE
);

-- Update linkedin_accounts table to track usage
ALTER TABLE linkedin_accounts 
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS usage_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_job_id CHAR(36) NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_last_used ON linkedin_accounts(last_used_at);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_usage ON linkedin_accounts(usage_count);

-- Views for easier data access

-- Job Summary View
CREATE OR REPLACE VIEW job_summary AS
SELECT 
    j.id,
    j.job_name,
    j.job_type,
    j.status,
    j.created_at,
    j.started_at,
    j.completed_at,
    j.total_urls,
    j.success_count,
    j.failure_count,
    u.email as user_email,
    CASE 
        WHEN j.completed_at IS NOT NULL THEN 
            TIMESTAMPDIFF(SECOND, j.started_at, j.completed_at)
        WHEN j.started_at IS NOT NULL THEN 
            TIMESTAMPDIFF(SECOND, j.started_at, NOW())
        ELSE NULL
    END as duration_seconds
FROM scraping_jobs j
JOIN users u ON j.user_id = u.id;

-- Recent Results View
CREATE OR REPLACE VIEW recent_results AS
SELECT 
    sr.id,
    sr.job_id,
    sr.url,
    sr.status,
    sr.scraped_at,
    j.job_name,
    j.job_type,
    u.email as user_email
FROM scraping_results sr
JOIN scraping_jobs j ON sr.job_id = j.id
JOIN users u ON j.user_id = u.id
ORDER BY sr.scraped_at DESC;

-- Account Usage View
CREATE OR REPLACE VIEW account_usage AS
SELECT 
    la.id,
    la.account_name,
    la.validation_status,
    la.last_used_at,
    la.usage_count,
    COUNT(sr.id) as total_scrapes,
    COUNT(CASE WHEN sr.status = 'success' THEN 1 END) as successful_scrapes,
    u.email as user_email
FROM linkedin_accounts la
JOIN users u ON la.user_id = u.id
LEFT JOIN scraping_results sr ON sr.account_used = la.account_name
GROUP BY la.id, la.account_name, la.validation_status, la.last_used_at, la.usage_count, u.email;