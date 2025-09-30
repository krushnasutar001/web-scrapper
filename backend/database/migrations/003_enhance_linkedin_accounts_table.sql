-- Migration: Enhance linkedin_accounts table for job queue system
-- Date: 2024-01-21
-- Description: Enhances LinkedIn accounts table with better status tracking, usage limits, and job queue integration

USE linkedin_automation_saas;

-- Check if linkedin_accounts table exists, create if not
CREATE TABLE IF NOT EXISTS linkedin_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'LinkedIn account unique identifier',
    user_id INT NOT NULL COMMENT 'Reference to user who owns this account',
    email VARCHAR(255) NULL COMMENT 'LinkedIn account email (nullable for cookie-based auth)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation time',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add new columns for enhanced functionality
ALTER TABLE linkedin_accounts 
-- Account Information
ADD COLUMN IF NOT EXISTS account_name VARCHAR(255) NULL COMMENT 'Display name for the account',
ADD COLUMN IF NOT EXISTS profile_url VARCHAR(500) NULL COMMENT 'LinkedIn profile URL',
ADD COLUMN IF NOT EXISTS connection_count INT NULL COMMENT 'Number of LinkedIn connections',

-- Cookie-based Authentication (existing columns from previous migration)
ADD COLUMN IF NOT EXISTS cookie_path VARCHAR(500) NULL COMMENT 'Path to JSON file containing LinkedIn cookies',
ADD COLUMN IF NOT EXISTS status ENUM('active', 'inactive', 'suspended', 'rate_limited', 'expired') DEFAULT 'inactive' COMMENT 'Account status based on validation',
ADD COLUMN IF NOT EXISTS last_validated DATETIME NULL COMMENT 'Last time cookies were validated against LinkedIn',

-- Usage Tracking and Limits
ADD COLUMN IF NOT EXISTS daily_requests INT DEFAULT 0 COMMENT 'Requests made today',
ADD COLUMN IF NOT EXISTS weekly_requests INT DEFAULT 0 COMMENT 'Requests made this week',
ADD COLUMN IF NOT EXISTS monthly_requests INT DEFAULT 0 COMMENT 'Requests made this month',
ADD COLUMN IF NOT EXISTS total_requests INT DEFAULT 0 COMMENT 'Total requests made with this account',

-- Rate Limiting
ADD COLUMN IF NOT EXISTS max_daily_requests INT DEFAULT 100 COMMENT 'Maximum requests per day',
ADD COLUMN IF NOT EXISTS max_weekly_requests INT DEFAULT 500 COMMENT 'Maximum requests per week',
ADD COLUMN IF NOT EXISTS max_monthly_requests INT DEFAULT 2000 COMMENT 'Maximum requests per month',
ADD COLUMN IF NOT EXISTS rate_limit_reset_at DATETIME NULL COMMENT 'When rate limits reset',

-- Job Queue Integration
ADD COLUMN IF NOT EXISTS current_job_id VARCHAR(36) NULL COMMENT 'Currently assigned job ID',
ADD COLUMN IF NOT EXISTS is_busy BOOLEAN DEFAULT FALSE COMMENT 'Whether account is currently processing a job',
ADD COLUMN IF NOT EXISTS last_used_at DATETIME NULL COMMENT 'Last time account was used for scraping',
ADD COLUMN IF NOT EXISTS jobs_completed INT DEFAULT 0 COMMENT 'Total jobs completed with this account',

-- Health and Performance
ADD COLUMN IF NOT EXISTS success_rate DECIMAL(5,2) DEFAULT 100.00 COMMENT 'Success rate percentage (0-100)',
ADD COLUMN IF NOT EXISTS avg_response_time INT NULL COMMENT 'Average response time in milliseconds',
ADD COLUMN IF NOT EXISTS last_error_message TEXT NULL COMMENT 'Last error encountered',
ADD COLUMN IF NOT EXISTS last_error_at DATETIME NULL COMMENT 'When last error occurred',
ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0 COMMENT 'Number of consecutive failures',

-- Account Metadata
ADD COLUMN IF NOT EXISTS account_type ENUM('personal', 'premium', 'sales_navigator', 'recruiter') DEFAULT 'personal' COMMENT 'LinkedIn account type',
ADD COLUMN IF NOT EXISTS proxy_config JSON NULL COMMENT 'Proxy configuration for this account',
ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500) NULL COMMENT 'User agent string to use',
ADD COLUMN IF NOT EXISTS browser_fingerprint JSON NULL COMMENT 'Browser fingerprint data',

-- Scheduling and Availability
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC' COMMENT 'Account timezone for scheduling',
ADD COLUMN IF NOT EXISTS working_hours JSON NULL COMMENT 'Working hours configuration {"start": "09:00", "end": "17:00"}',
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE COMMENT 'Whether account is available for new jobs',

-- Security and Compliance
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE COMMENT 'Whether 2FA is enabled on LinkedIn',
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE COMMENT 'Whether phone is verified on LinkedIn',
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE COMMENT 'Whether email is verified on LinkedIn',
ADD COLUMN IF NOT EXISTS compliance_score DECIMAL(3,2) DEFAULT 1.00 COMMENT 'Compliance score (0-1)',

-- Notes and Tags
ADD COLUMN IF NOT EXISTS tags JSON NULL COMMENT 'Tags for categorizing accounts',
ADD COLUMN IF NOT EXISTS notes TEXT NULL COMMENT 'Admin notes about the account',
ADD COLUMN IF NOT EXISTS metadata JSON NULL COMMENT 'Additional account metadata';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_user_id ON linkedin_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_status ON linkedin_accounts(status);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_email ON linkedin_accounts(email);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_last_validated ON linkedin_accounts(last_validated);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_is_busy ON linkedin_accounts(is_busy);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_current_job_id ON linkedin_accounts(current_job_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_last_used_at ON linkedin_accounts(last_used_at);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_success_rate ON linkedin_accounts(success_rate);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_account_type ON linkedin_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_is_available ON linkedin_accounts(is_available);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_status_available ON linkedin_accounts(status, is_available);

-- Create trigger for automatic timestamp updates and usage tracking
DROP TRIGGER IF EXISTS tr_linkedin_accounts_updated_at;

DELIMITER //
CREATE TRIGGER tr_linkedin_accounts_updated_at 
    BEFORE UPDATE ON linkedin_accounts 
    FOR EACH ROW 
BEGIN 
    SET NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Reset daily counters if it's a new day
    IF DATE(NEW.updated_at) != DATE(OLD.updated_at) THEN
        SET NEW.daily_requests = 0;
    END IF;
    
    -- Reset weekly counters if it's a new week
    IF WEEK(NEW.updated_at) != WEEK(OLD.updated_at) OR YEAR(NEW.updated_at) != YEAR(OLD.updated_at) THEN
        SET NEW.weekly_requests = 0;
    END IF;
    
    -- Reset monthly counters if it's a new month
    IF MONTH(NEW.updated_at) != MONTH(OLD.updated_at) OR YEAR(NEW.updated_at) != YEAR(OLD.updated_at) THEN
        SET NEW.monthly_requests = 0;
    END IF;
    
    -- Update success rate if total requests changed
    IF NEW.total_requests != OLD.total_requests THEN
        SET NEW.success_rate = CASE 
            WHEN NEW.total_requests = 0 THEN 100.00
            ELSE ((NEW.total_requests - NEW.consecutive_failures) / NEW.total_requests) * 100
        END;
    END IF;
END//
DELIMITER ;

-- Create LinkedIn account usage log table
CREATE TABLE IF NOT EXISTS linkedin_account_usage_log (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Usage log ID',
    linkedin_account_id INT NOT NULL COMMENT 'Reference to LinkedIn account',
    job_id VARCHAR(36) NULL COMMENT 'Related job ID',
    
    -- Usage Details
    action_type ENUM('login', 'scrape_profile', 'scrape_company', 'search', 'connection_request', 'message', 'other') NOT NULL COMMENT 'Type of action performed',
    url VARCHAR(1000) NULL COMMENT 'URL that was accessed',
    success BOOLEAN NOT NULL COMMENT 'Whether the action was successful',
    
    -- Performance Metrics
    response_time INT NULL COMMENT 'Response time in milliseconds',
    data_extracted BOOLEAN DEFAULT FALSE COMMENT 'Whether data was successfully extracted',
    
    -- Error Information
    error_message TEXT NULL COMMENT 'Error message if action failed',
    error_code VARCHAR(50) NULL COMMENT 'Error code for categorization',
    
    -- Context
    user_agent VARCHAR(500) NULL COMMENT 'User agent used for the request',
    ip_address VARCHAR(45) NULL COMMENT 'IP address used',
    
    -- Timestamps
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When action started',
    completed_at DATETIME NULL COMMENT 'When action completed',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Log entry creation time',
    
    -- Foreign Keys
    FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_linkedin_account_usage_log_account_id (linkedin_account_id),
    INDEX idx_linkedin_account_usage_log_job_id (job_id),
    INDEX idx_linkedin_account_usage_log_action_type (action_type),
    INDEX idx_linkedin_account_usage_log_success (success),
    INDEX idx_linkedin_account_usage_log_started_at (started_at),
    INDEX idx_linkedin_account_usage_log_account_success (linkedin_account_id, success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Usage log for LinkedIn accounts';

-- Insert sample LinkedIn accounts for testing (optional)
INSERT IGNORE INTO linkedin_accounts (
    id, user_id, account_name, email, status, 
    max_daily_requests, max_weekly_requests, max_monthly_requests,
    account_type, is_available, created_at
) VALUES 
(1, 1, 'Admin Test Account', 'admin.test@example.com', 'active', 
 200, 1000, 4000, 'premium', TRUE, CURRENT_TIMESTAMP),
(2, 2, 'User Test Account', 'user.test@example.com', 'active',
 100, 500, 2000, 'personal', TRUE, CURRENT_TIMESTAMP);

-- Add comments to tables
ALTER TABLE linkedin_accounts COMMENT = 'Enhanced LinkedIn accounts with usage tracking, rate limiting, and job queue integration';
ALTER TABLE linkedin_account_usage_log COMMENT = 'Detailed usage log for LinkedIn account actions and performance tracking';

-- Create stored procedure for account selection
DELIMITER //

DROP PROCEDURE IF EXISTS GetAvailableLinkedInAccount//

CREATE PROCEDURE GetAvailableLinkedInAccount(
    IN p_user_id INT,
    IN p_job_type VARCHAR(50),
    OUT p_account_id INT,
    OUT p_success BOOLEAN,
    OUT p_error_message TEXT
)
BEGIN
    DECLARE v_account_id INT DEFAULT NULL;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET p_success = FALSE;
        SET p_error_message = 'Database error during account selection';
        SET p_account_id = NULL;
    END;
    
    -- Find the best available account for the user
    SELECT id INTO v_account_id
    FROM linkedin_accounts 
    WHERE user_id = p_user_id
      AND status = 'active'
      AND is_available = TRUE
      AND is_busy = FALSE
      AND daily_requests < max_daily_requests
      AND weekly_requests < max_weekly_requests
      AND monthly_requests < max_monthly_requests
      AND consecutive_failures < 3
    ORDER BY 
        success_rate DESC,
        last_used_at ASC,
        daily_requests ASC
    LIMIT 1;
    
    IF v_account_id IS NOT NULL THEN
        -- Mark account as busy
        UPDATE linkedin_accounts 
        SET is_busy = TRUE,
            last_used_at = CURRENT_TIMESTAMP
        WHERE id = v_account_id;
        
        SET p_account_id = v_account_id;
        SET p_success = TRUE;
        SET p_error_message = NULL;
    ELSE
        SET p_account_id = NULL;
        SET p_success = FALSE;
        SET p_error_message = 'No available LinkedIn accounts found';
    END IF;
END//

DELIMITER ;