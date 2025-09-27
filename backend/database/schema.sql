-- LinkedIn Automation SaaS Database Schema
-- MySQL Database Setup

-- Create database
CREATE DATABASE IF NOT EXISTS linkedin_automation_saas;
USE linkedin_automation_saas;

-- Users table
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL
);

-- LinkedIn accounts table
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
);

-- Jobs table
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Job URLs table
CREATE TABLE job_urls (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    url TEXT NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    error_message TEXT NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Job results table
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
);

-- Job account assignments (many-to-many)
CREATE TABLE job_account_assignments (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    linkedin_account_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_job_account (job_id, linkedin_account_id)
);

-- Scraping jobs table (for tracking active scraping operations)
CREATE TABLE scraping_jobs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    job_type ENUM('profile_scraping', 'company_scraping', 'search_result_scraping') NOT NULL,
    status ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance (using ALTER TABLE to avoid MySQL compatibility issues)
ALTER TABLE users ADD INDEX idx_users_email (email);
ALTER TABLE linkedin_accounts ADD INDEX idx_linkedin_accounts_user_id (user_id);
ALTER TABLE linkedin_accounts ADD INDEX idx_linkedin_accounts_status (validation_status);
ALTER TABLE jobs ADD INDEX idx_jobs_user_id (user_id);
ALTER TABLE jobs ADD INDEX idx_jobs_status (status);
ALTER TABLE jobs ADD INDEX idx_jobs_created_at (created_at);
ALTER TABLE job_urls ADD INDEX idx_job_urls_job_id (job_id);
ALTER TABLE job_urls ADD INDEX idx_job_urls_status (status);
ALTER TABLE job_results ADD INDEX idx_job_results_job_id (job_id);
ALTER TABLE job_account_assignments ADD INDEX idx_job_account_assignments_job_id (job_id);
ALTER TABLE scraping_jobs ADD INDEX idx_scraping_jobs_user_id (user_id);
ALTER TABLE scraping_jobs ADD INDEX idx_scraping_jobs_status (status);

-- Insert default admin user for testing
INSERT INTO users (id, email, password_hash, name) VALUES 
('mock-user-id', 'test@example.com', '$2b$10$dummy.hash.for.testing', 'Test User');