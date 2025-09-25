-- Add new tables for enhanced LinkedIn scraping system
USE linkedin_automation_saas;

-- Profiles table for storing scraped LinkedIn profiles
CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    linkedin_url TEXT NOT NULL,
    full_name VARCHAR(255),
    headline TEXT,
    about TEXT,
    location VARCHAR(255),
    industry VARCHAR(255),
    current_job_title VARCHAR(255),
    current_company VARCHAR(255),
    connections VARCHAR(100),
    profile_image_url TEXT,
    background_image_url TEXT,
    experience JSON,
    education JSON,
    skills JSON,
    languages JSON,
    certifications JSON,
    contact_info JSON,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    INDEX idx_profiles_job_id (job_id),
    INDEX idx_profiles_linkedin_url (linkedin_url(255))
);

-- Companies table for storing scraped company profiles
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    linkedin_url TEXT NOT NULL,
    company_name VARCHAR(255),
    tagline TEXT,
    description TEXT,
    website VARCHAR(255),
    industry VARCHAR(255),
    company_size VARCHAR(100),
    headquarters VARCHAR(255),
    founded_year INT,
    specialties TEXT,
    employee_count VARCHAR(100),
    follower_count VARCHAR(100),
    logo_url TEXT,
    cover_image_url TEXT,
    locations JSON,
    recent_updates JSON,
    affiliated_companies JSON,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    INDEX idx_companies_job_id (job_id),
    INDEX idx_companies_linkedin_url (linkedin_url(255))
);

-- Search results table for storing bulk search results
CREATE TABLE IF NOT EXISTS search_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    search_query TEXT NOT NULL,
    result_type ENUM('profile', 'company', 'job', 'post') NOT NULL,
    linkedin_url TEXT NOT NULL,
    title VARCHAR(255),
    subtitle VARCHAR(255),
    description TEXT,
    location VARCHAR(255),
    additional_info JSON,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    INDEX idx_search_results_job_id (job_id),
    INDEX idx_search_results_type (result_type),
    INDEX idx_search_results_linkedin_url (linkedin_url(255))
);

-- Job logs table for tracking job execution details
CREATE TABLE IF NOT EXISTS job_logs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    job_id VARCHAR(36) NOT NULL,
    level ENUM('info', 'warning', 'error', 'debug') NOT NULL,
    message TEXT NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    INDEX idx_job_logs_job_id (job_id),
    INDEX idx_job_logs_level (level),
    INDEX idx_job_logs_created_at (created_at)
);

SELECT 'New tables created successfully!' as status;