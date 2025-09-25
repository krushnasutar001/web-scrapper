-- Create comprehensive profile_results table for LinkedIn profile scraping
CREATE TABLE IF NOT EXISTS profile_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    snapshot_id VARCHAR(36),
    profile_url TEXT NOT NULL,
    
    -- Basic Profile Information
    full_name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    headline TEXT,
    about TEXT,
    last_activity VARCHAR(100),
    
    -- Location Information
    country VARCHAR(100),
    city VARCHAR(100),
    industry VARCHAR(150),
    
    -- Contact Information
    email VARCHAR(255),
    phone VARCHAR(50),
    website TEXT,
    
    -- Current Job Information
    current_job_title VARCHAR(255),
    current_job_start DATE,
    current_job_end DATE,
    current_job_location VARCHAR(255),
    current_job_type VARCHAR(100),
    current_job_description TEXT,
    
    -- Company Information
    current_company_url TEXT,
    company_name VARCHAR(255),
    company_industry VARCHAR(150),
    company_hq VARCHAR(255),
    company_size VARCHAR(100),
    company_followers VARCHAR(50),
    company_website TEXT,
    company_type VARCHAR(100),
    company_specialties TEXT,
    
    -- Additional Profile Data
    skills JSON,
    education JSON,
    experience JSON,
    licenses_certificates JSON,
    
    -- Status and Error Handling
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_job_id (job_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_profile_url (profile_url(255)),
    
    -- Foreign key constraint
    FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE
);