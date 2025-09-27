-- Scralytics Hub Database Schema
-- Multi-user testing environment with proper constraints and error handling

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS linkedin_automation;
USE linkedin_automation;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    credits INT DEFAULT 1000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    INDEX idx_users_email (email),
    INDEX idx_users_active (is_active)
);

-- LinkedIn accounts table
CREATE TABLE IF NOT EXISTS linkedin_accounts (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    cookies_json TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    validation_status ENUM('ACTIVE', 'INACTIVE', 'BLOCKED', 'PENDING') DEFAULT 'PENDING',
    daily_request_limit INT DEFAULT 150,
    requests_today INT DEFAULT 0,
    last_request_at TIMESTAMP NULL,
    cooldown_until TIMESTAMP NULL,
    blocked_until TIMESTAMP NULL,
    consecutive_failures INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_email (user_id, email),
    INDEX idx_linkedin_accounts_user_id (user_id),
    INDEX idx_linkedin_accounts_status (validation_status),
    INDEX idx_linkedin_accounts_active (is_active)
);

-- Jobs table with proper ENUM status
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    job_type ENUM('profile', 'company', 'job_post', 'search') NOT NULL,
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
    INDEX idx_jobs_created_at (created_at),
    INDEX idx_jobs_type (job_type)
);

-- Job URLs table
CREATE TABLE IF NOT EXISTS job_urls (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    url TEXT NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    error_message TEXT,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    INDEX idx_job_urls_job_id (job_id),
    INDEX idx_job_urls_status (status)
);

-- Job account assignments table
CREATE TABLE IF NOT EXISTS job_account_assignments (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    linkedin_account_id VARCHAR(36) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_job_account (job_id, linkedin_account_id),
    INDEX idx_job_assignments_job_id (job_id),
    INDEX idx_job_assignments_account_id (linkedin_account_id)
);

-- Scraping profiles/results table with proper foreign keys
CREATE TABLE IF NOT EXISTS scraping_profiles (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    url TEXT NOT NULL,
    profile_data JSON,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    INDEX idx_scraping_profiles_job_id (job_id),
    INDEX idx_scraping_profiles_scraped_at (scraped_at)
);

-- Results table (generic for all job types)
CREATE TABLE IF NOT EXISTS results (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    url TEXT NOT NULL,
    data JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    INDEX idx_results_job_id (job_id),
    INDEX idx_results_created_at (created_at)
);

-- Job queue table for worker management
CREATE TABLE IF NOT EXISTS job_queue (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    linkedin_account_id VARCHAR(36) NOT NULL,
    priority INT DEFAULT 0,
    worker_id VARCHAR(255),
    status ENUM('queued', 'assigned', 'processing', 'completed', 'failed') DEFAULT 'queued',
    assigned_at TIMESTAMP NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    INDEX idx_job_queue_status (status),
    INDEX idx_job_queue_priority (priority),
    INDEX idx_job_queue_job_id (job_id),
    INDEX idx_job_queue_account_id (linkedin_account_id)
);

-- Error logs table for comprehensive logging
CREATE TABLE IF NOT EXISTS error_logs (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36),
    linkedin_account_id VARCHAR(36),
    error_type ENUM('COOKIE_ERROR', 'LOGIN_ERROR', 'DB_ERROR', 'SCRAPING_ERROR', 'NETWORK_ERROR') NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSON,
    retry_count INT DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE SET NULL,
    INDEX idx_error_logs_job_id (job_id),
    INDEX idx_error_logs_account_id (linkedin_account_id),
    INDEX idx_error_logs_type (error_type),
    INDEX idx_error_logs_resolved (resolved),
    INDEX idx_error_logs_created_at (created_at)
);

-- Activity logs table for audit trail
CREATE TABLE IF NOT EXISTS activity_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    job_id VARCHAR(36),
    action VARCHAR(255) NOT NULL,
    details JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    INDEX idx_activity_logs_user_id (user_id),
    INDEX idx_activity_logs_job_id (job_id),
    INDEX idx_activity_logs_action (action),
    INDEX idx_activity_logs_created_at (created_at)
);