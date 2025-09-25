-- Add missing tables that the code expects
-- These tables are referenced in Job.js but don't exist in the schema

-- Profile results table for profile scraping jobs
CREATE TABLE IF NOT EXISTS profile_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    job_url_id VARCHAR(36),
    source_url TEXT,
    full_name VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    headline TEXT,
    about TEXT,
    country VARCHAR(255),
    city VARCHAR(255),
    industry VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(255),
    website VARCHAR(255),
    current_job_title VARCHAR(255),
    current_company_url TEXT,
    company_name VARCHAR(255),
    profile_url TEXT,
    linkedin_url TEXT,
    skills JSON,
    education JSON,
    experience JSON,
    status ENUM('pending', 'processing', 'completed', 'failed', 'partial') DEFAULT 'completed',
    scraped_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (job_url_id) REFERENCES job_urls(id) ON DELETE SET NULL
);

-- Company results table for company scraping jobs
CREATE TABLE IF NOT EXISTS company_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    job_url_id VARCHAR(36),
    source_url TEXT,
    company_name VARCHAR(255),
    company_url TEXT,
    company_industry VARCHAR(255),
    company_size VARCHAR(255),
    company_location VARCHAR(255),
    company_description TEXT,
    company_website VARCHAR(255),
    company_specialties TEXT,
    status ENUM('pending', 'processing', 'completed', 'failed', 'partial') DEFAULT 'completed',
    scraped_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (job_url_id) REFERENCES job_urls(id) ON DELETE SET NULL
);

-- Search results table for search result scraping jobs
CREATE TABLE IF NOT EXISTS search_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    job_url_id VARCHAR(36),
    source_url TEXT,
    title VARCHAR(255),
    subtitle VARCHAR(255),
    description TEXT,
    result_url TEXT,
    location VARCHAR(255),
    search_query VARCHAR(255),
    posted_date VARCHAR(255),
    salary_range VARCHAR(255),
    employment_type VARCHAR(255),
    experience_level VARCHAR(255),
    additional_data JSON,
    status ENUM('pending', 'processing', 'completed', 'failed', 'partial') DEFAULT 'completed',
    scraped_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (job_url_id) REFERENCES job_urls(id) ON DELETE SET NULL
);

-- Add indexes for performance
ALTER TABLE profile_results ADD INDEX idx_profile_results_job_id (job_id);
ALTER TABLE profile_results ADD INDEX idx_profile_results_status (status);
ALTER TABLE profile_results ADD INDEX idx_profile_results_created_at (created_at);

ALTER TABLE company_results ADD INDEX idx_company_results_job_id (job_id);
ALTER TABLE company_results ADD INDEX idx_company_results_status (status);
ALTER TABLE company_results ADD INDEX idx_company_results_created_at (created_at);

ALTER TABLE search_results ADD INDEX idx_search_results_job_id (job_id);
ALTER TABLE search_results ADD INDEX idx_search_results_status (status);
ALTER TABLE search_results ADD INDEX idx_search_results_created_at (created_at);