-- Migration: Enhance users table for job queue system
-- Date: 2024-01-21
-- Description: Adds credits system, API tokens, and enhanced user management for job queue operations

USE linkedin_automation_saas;

-- Check if users table exists, create if not
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'User unique identifier',
    email VARCHAR(255) NOT NULL UNIQUE COMMENT 'User email address',
    password_hash VARCHAR(255) NOT NULL COMMENT 'Hashed password',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation time',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add new columns for enhanced functionality
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NULL COMMENT 'User first name',
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) NULL COMMENT 'User last name',
ADD COLUMN IF NOT EXISTS company VARCHAR(255) NULL COMMENT 'User company name',
ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL COMMENT 'User phone number',

-- Credits System
ADD COLUMN IF NOT EXISTS credits_balance INT NOT NULL DEFAULT 0 COMMENT 'Current credits balance',
ADD COLUMN IF NOT EXISTS credits_used INT NOT NULL DEFAULT 0 COMMENT 'Total credits used',
ADD COLUMN IF NOT EXISTS credits_purchased INT NOT NULL DEFAULT 0 COMMENT 'Total credits purchased',

-- Account Status
ADD COLUMN IF NOT EXISTS status ENUM('active', 'inactive', 'suspended', 'pending_verification') NOT NULL DEFAULT 'active' COMMENT 'Account status',
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE COMMENT 'Whether email is verified',
ADD COLUMN IF NOT EXISTS email_verified_at DATETIME NULL COMMENT 'Email verification timestamp',

-- API Access
ADD COLUMN IF NOT EXISTS api_key VARCHAR(64) NULL UNIQUE COMMENT 'API key for programmatic access',
ADD COLUMN IF NOT EXISTS api_key_created_at DATETIME NULL COMMENT 'API key creation time',
ADD COLUMN IF NOT EXISTS api_requests_count INT DEFAULT 0 COMMENT 'Total API requests made',
ADD COLUMN IF NOT EXISTS api_rate_limit INT DEFAULT 1000 COMMENT 'API requests per hour limit',

-- Subscription and Billing
ADD COLUMN IF NOT EXISTS subscription_plan ENUM('free', 'basic', 'pro', 'enterprise') DEFAULT 'free' COMMENT 'Current subscription plan',
ADD COLUMN IF NOT EXISTS subscription_expires_at DATETIME NULL COMMENT 'Subscription expiration date',
ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255) NULL COMMENT 'Billing email if different from main email',

-- Usage Limits
ADD COLUMN IF NOT EXISTS max_concurrent_jobs INT DEFAULT 1 COMMENT 'Maximum concurrent jobs allowed',
ADD COLUMN IF NOT EXISTS max_monthly_jobs INT DEFAULT 10 COMMENT 'Maximum jobs per month',
ADD COLUMN IF NOT EXISTS jobs_this_month INT DEFAULT 0 COMMENT 'Jobs created this month',

-- Security and Preferences
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE COMMENT 'Whether 2FA is enabled',
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(32) NULL COMMENT 'TOTP secret for 2FA',
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC' COMMENT 'User timezone',
ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'en' COMMENT 'User preferred language',

-- Tracking
ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL COMMENT 'Last login timestamp',
ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45) NULL COMMENT 'Last login IP address',
ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0 COMMENT 'Total login count',

-- Metadata
ADD COLUMN IF NOT EXISTS metadata JSON NULL COMMENT 'Additional user metadata',
ADD COLUMN IF NOT EXISTS notes TEXT NULL COMMENT 'Admin notes about the user';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_subscription_plan ON users(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_users_credits_balance ON users(credits_balance);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS tr_users_updated_at;

DELIMITER //
CREATE TRIGGER tr_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
BEGIN 
    SET NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Reset monthly job count if it's a new month
    IF MONTH(NEW.updated_at) != MONTH(OLD.updated_at) OR YEAR(NEW.updated_at) != YEAR(OLD.updated_at) THEN
        SET NEW.jobs_this_month = 0;
    END IF;
END//
DELIMITER ;

-- Create credits transaction log table
CREATE TABLE IF NOT EXISTS user_credits_log (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Transaction log ID',
    user_id INT NOT NULL COMMENT 'Reference to user',
    
    -- Transaction Details
    transaction_type ENUM('purchase', 'deduction', 'refund', 'bonus', 'adjustment') NOT NULL COMMENT 'Type of credit transaction',
    amount INT NOT NULL COMMENT 'Credit amount (positive for additions, negative for deductions)',
    balance_before INT NOT NULL COMMENT 'Credits balance before transaction',
    balance_after INT NOT NULL COMMENT 'Credits balance after transaction',
    
    -- Context
    job_id VARCHAR(36) NULL COMMENT 'Related job ID if applicable',
    description TEXT NULL COMMENT 'Transaction description',
    reference_id VARCHAR(100) NULL COMMENT 'External reference (payment ID, etc.)',
    
    -- Metadata
    metadata JSON NULL COMMENT 'Additional transaction metadata',
    
    -- Timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Transaction timestamp',
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_user_credits_log_user_id (user_id),
    INDEX idx_user_credits_log_transaction_type (transaction_type),
    INDEX idx_user_credits_log_created_at (created_at),
    INDEX idx_user_credits_log_job_id (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Credits transaction log for audit trail';

-- Create user sessions table for better session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(128) PRIMARY KEY COMMENT 'Session ID',
    user_id INT NOT NULL COMMENT 'Reference to user',
    
    -- Session Data
    session_data JSON NULL COMMENT 'Session data in JSON format',
    ip_address VARCHAR(45) NULL COMMENT 'Client IP address',
    user_agent TEXT NULL COMMENT 'Client user agent',
    
    -- Timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Session creation time',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last session update',
    expires_at DATETIME NOT NULL COMMENT 'Session expiration time',
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_user_sessions_user_id (user_id),
    INDEX idx_user_sessions_expires_at (expires_at),
    INDEX idx_user_sessions_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User session management';

-- Insert default admin user if not exists (for development)
INSERT IGNORE INTO users (
    id, email, password_hash, first_name, last_name, 
    credits_balance, status, email_verified, subscription_plan,
    max_concurrent_jobs, max_monthly_jobs, created_at
) VALUES (
    1, 'admin@example.com', '$2b$10$example.hash.for.development.only', 
    'Admin', 'User', 1000, 'active', TRUE, 'enterprise',
    10, 1000, CURRENT_TIMESTAMP
);

-- Insert test user for development
INSERT IGNORE INTO users (
    id, email, password_hash, first_name, last_name,
    credits_balance, status, email_verified, subscription_plan,
    max_concurrent_jobs, max_monthly_jobs, created_at
) VALUES (
    2, 'test@example.com', '$2b$10$example.hash.for.development.only',
    'Test', 'User', 100, 'active', TRUE, 'basic',
    2, 50, CURRENT_TIMESTAMP
);

-- Add comments to tables
ALTER TABLE users COMMENT = 'Enhanced users table with credits system, subscription management, and API access';
ALTER TABLE user_credits_log COMMENT = 'Audit trail for all credit transactions';
ALTER TABLE user_sessions COMMENT = 'Session management for enhanced security and tracking';

-- Create stored procedure for credit deduction with transaction safety
DELIMITER //

DROP PROCEDURE IF EXISTS DeductUserCredits//

CREATE PROCEDURE DeductUserCredits(
    IN p_user_id INT,
    IN p_amount INT,
    IN p_job_id VARCHAR(36),
    IN p_description TEXT,
    OUT p_success BOOLEAN,
    OUT p_new_balance INT,
    OUT p_error_message TEXT
)
BEGIN
    DECLARE v_current_balance INT DEFAULT 0;
    DECLARE v_new_balance INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_success = FALSE;
        SET p_error_message = 'Database error during credit deduction';
        SET p_new_balance = -1;
    END;
    
    START TRANSACTION;
    
    -- Get current balance with row lock
    SELECT credits_balance INTO v_current_balance
    FROM users 
    WHERE id = p_user_id 
    FOR UPDATE;
    
    -- Check if user exists
    IF v_current_balance IS NULL THEN
        SET p_success = FALSE;
        SET p_error_message = 'User not found';
        SET p_new_balance = -1;
        ROLLBACK;
    ELSEIF v_current_balance < p_amount THEN
        SET p_success = FALSE;
        SET p_error_message = 'Insufficient credits';
        SET p_new_balance = v_current_balance;
        ROLLBACK;
    ELSE
        -- Deduct credits
        SET v_new_balance = v_current_balance - p_amount;
        
        UPDATE users 
        SET credits_balance = v_new_balance,
            credits_used = credits_used + p_amount
        WHERE id = p_user_id;
        
        -- Log the transaction
        INSERT INTO user_credits_log (
            user_id, transaction_type, amount, balance_before, balance_after,
            job_id, description, created_at
        ) VALUES (
            p_user_id, 'deduction', -p_amount, v_current_balance, v_new_balance,
            p_job_id, p_description, CURRENT_TIMESTAMP
        );
        
        SET p_success = TRUE;
        SET p_new_balance = v_new_balance;
        SET p_error_message = NULL;
        
        COMMIT;
    END IF;
END//

DELIMITER ;