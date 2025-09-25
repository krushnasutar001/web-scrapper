-- Company Results Table for company scraping jobs
CREATE TABLE IF NOT EXISTS company_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  company_url VARCHAR(2048) NOT NULL,
  company_name VARCHAR(255),
  company_industry VARCHAR(255),
  company_size VARCHAR(255),
  company_headquarters VARCHAR(255),
  company_founded VARCHAR(255),
  company_type VARCHAR(255),
  company_specialties TEXT,
  company_description TEXT,
  company_website VARCHAR(512),
  company_phone VARCHAR(255),
  company_email VARCHAR(255),
  company_followers VARCHAR(255),
  company_employees_count VARCHAR(255),
  company_logo_url VARCHAR(512),
  company_cover_image_url VARCHAR(512),
  company_locations JSON,
  company_funding_info JSON,
  company_recent_updates JSON,
  status ENUM('success', 'failed', 'partial') DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_company_url (company_url(255)),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Search Export Table for search result export jobs
CREATE TABLE IF NOT EXISTS search_export (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  search_url VARCHAR(2048) NOT NULL,
  result_type ENUM('profile', 'company', 'job_posting', 'post') NOT NULL,
  result_url VARCHAR(2048),
  title VARCHAR(500),
  subtitle VARCHAR(500),
  description TEXT,
  location VARCHAR(255),
  date_posted VARCHAR(255),
  result_position INT,
  search_query VARCHAR(500),
  search_filters JSON,
  additional_data JSON,
  status ENUM('success', 'failed', 'partial') DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_search_url (search_url(255)),
  INDEX idx_result_type (result_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Add indexes for better performance (MySQL doesn't support IF NOT EXISTS for indexes)
-- CREATE INDEX idx_company_results_company_name ON company_results(company_name);
-- CREATE INDEX idx_company_results_industry ON company_results(company_industry);
-- CREATE INDEX idx_search_export_title ON search_export(title);
-- CREATE INDEX idx_search_export_location ON search_export(location);