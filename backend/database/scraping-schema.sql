-- Enhanced Scraping Jobs Table with Two-Stage Architecture
-- Stage A: Fetcher (Browser Automation) + Stage B: Parser (Data Extraction)

-- HTML Snapshots Table - Store raw HTML from fetcher stage
CREATE TABLE IF NOT EXISTS html_snapshots (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  url VARCHAR(2048) NOT NULL,
  html_content LONGTEXT NOT NULL,
  fetch_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  page_type ENUM('profile', 'company', 'search_results') NOT NULL,
  status ENUM('fetched', 'parsed', 'failed') DEFAULT 'fetched',
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_url (url(255)),
  INDEX idx_status (status),
  INDEX idx_page_type (page_type)
);

-- Enhanced Scraping Jobs Table
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_name VARCHAR(255) NOT NULL,
  job_type ENUM('profiles', 'companies', 'sales_navigator') NOT NULL,
  status ENUM('pending', 'fetching', 'parsing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  stage ENUM('fetcher', 'parser', 'completed') DEFAULT 'fetcher',
  progress INT DEFAULT 0,
  total_items INT DEFAULT 0,
  fetched_items INT DEFAULT 0,
  parsed_items INT DEFAULT 0,
  failed_items INT DEFAULT 0,
  account_id VARCHAR(36),
  proxy_url VARCHAR(512),
  input_data JSON,
  job_config JSON,
  results_summary JSON,
  error_message TEXT,
  scheduled_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  worker_id VARCHAR(255),
  priority INT DEFAULT 5,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  INDEX idx_status (status),
  INDEX idx_stage (stage),
  INDEX idx_job_type (job_type),
  INDEX idx_account_id (account_id),
  INDEX idx_created_at (created_at),
  INDEX idx_priority_scheduled (priority, scheduled_at),
  INDEX idx_worker_id (worker_id)
);

-- Enhanced Profile Scraping Results Table
CREATE TABLE IF NOT EXISTS profile_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  snapshot_id VARCHAR(36),
  profile_url VARCHAR(2048) NOT NULL,
  full_name VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  headline TEXT,
  about TEXT,
  last_activity VARCHAR(255),
  country VARCHAR(255),
  city VARCHAR(255),
  industry VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  website VARCHAR(512),
  current_job_title VARCHAR(255),
  current_job_start VARCHAR(255),
  current_job_end VARCHAR(255),
  current_job_location VARCHAR(255),
  current_job_type VARCHAR(255),
  current_job_description TEXT,
  current_company_url VARCHAR(512),
  company_name VARCHAR(255),
  company_industry VARCHAR(255),
  company_hq VARCHAR(255),
  company_size VARCHAR(255),
  company_followers VARCHAR(255),
  company_website VARCHAR(512),
  company_type VARCHAR(255),
  company_specialties TEXT,
  skills JSON,
  education JSON,
  experience JSON,
  licenses_certificates JSON,
  status ENUM('success', 'failed', 'partial') DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_snapshot_id (snapshot_id),
  INDEX idx_status (status),
  INDEX idx_profile_url (profile_url(255)),
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES html_snapshots(id) ON DELETE SET NULL
);

-- Company Scraping Results Table
CREATE TABLE IF NOT EXISTS company_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  snapshot_id VARCHAR(36),
  company_url VARCHAR(2048) NOT NULL,
  company_id VARCHAR(255),
  company_name VARCHAR(255),
  company_industry VARCHAR(255),
  company_hq VARCHAR(255),
  company_followers VARCHAR(255),
  company_employee_size VARCHAR(255),
  company_website VARCHAR(512),
  company_type VARCHAR(255),
  company_specialties TEXT,
  company_associated_members JSON,
  status ENUM('success', 'failed', 'partial') DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_snapshot_id (snapshot_id),
  INDEX idx_status (status),
  INDEX idx_company_url (company_url(255)),
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES html_snapshots(id) ON DELETE SET NULL
);

-- Sales Navigator Search Results Table
CREATE TABLE IF NOT EXISTS sales_navigator_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  snapshot_id VARCHAR(36),
  search_url VARCHAR(2048) NOT NULL,
  profile_url VARCHAR(2048),
  full_name VARCHAR(255),
  headline TEXT,
  current_title VARCHAR(255),
  current_company VARCHAR(255),
  location VARCHAR(255),
  industry VARCHAR(255),
  page_number INT,
  result_position INT,
  status ENUM('success', 'failed', 'partial') DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_snapshot_id (snapshot_id),
  INDEX idx_status (status),
  INDEX idx_search_url (search_url(255)),
  INDEX idx_profile_url (profile_url(255)),
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES html_snapshots(id) ON DELETE SET NULL
);

-- Legacy Results Table (for backward compatibility)
CREATE TABLE IF NOT EXISTS scraping_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  job_type ENUM('profiles', 'companies', 'sales_navigator') NOT NULL,
  url VARCHAR(500),
  status ENUM('success', 'error', 'skipped') NOT NULL,
  data JSON, -- Extracted data
  error_message TEXT,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  account_used VARCHAR(255),
  processing_time_ms INT,
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  INDEX idx_job_id (job_id),
  INDEX idx_status (status),
  INDEX idx_scraped_at (scraped_at)
);

-- Job Queue Table for managing concurrent jobs
CREATE TABLE IF NOT EXISTS job_queue (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  priority INT DEFAULT 5,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  worker_id VARCHAR(255),
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  FOREIGN KEY (job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  INDEX idx_priority_scheduled (priority, scheduled_at),
  INDEX idx_worker_id (worker_id)
);

-- Add last_used_at column to linkedin_accounts if it doesn't exist
ALTER TABLE linkedin_accounts 
ADD COLUMN last_used_at TIMESTAMP NULL;

-- Update existing accounts to have a last_used_at value
UPDATE linkedin_accounts 
SET last_used_at = created_at 
WHERE last_used_at IS NULL;

-- Job Statistics View
CREATE OR REPLACE VIEW job_statistics AS
SELECT 
  j.id,
  j.job_name,
  j.job_type,
  j.status,
  j.progress,
  j.created_at,
  j.started_at,
  j.completed_at,
  TIMESTAMPDIFF(SECOND, j.started_at, COALESCE(j.completed_at, NOW())) as duration_seconds,
  COUNT(r.id) as total_results,
  SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) as successful_results,
  SUM(CASE WHEN r.status = 'error' THEN 1 ELSE 0 END) as failed_results,
  AVG(r.processing_time_ms) as avg_processing_time_ms
FROM scraping_jobs j
LEFT JOIN scraping_results r ON j.id = r.job_id
GROUP BY j.id;

-- Account Usage Statistics View
CREATE OR REPLACE VIEW account_usage_stats AS
SELECT 
  la.id,
  la.account_name,
  la.validation_status,
  la.last_used_at,
  COUNT(sr.id) as total_scrapes,
  COUNT(CASE WHEN sr.status = 'success' THEN 1 END) as successful_scrapes,
  COUNT(CASE WHEN sr.status = 'error' THEN 1 END) as failed_scrapes,
  MAX(sr.scraped_at) as last_scrape_at
FROM linkedin_accounts la
LEFT JOIN scraping_results sr ON la.account_name = sr.account_used
GROUP BY la.id;