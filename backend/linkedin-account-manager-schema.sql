-- LinkedIn Account Manager Database Schema
-- Simple account management with validation status tracking

CREATE TABLE IF NOT EXISTS linkedin_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT 'Account name/identifier',
    cookies JSON NOT NULL COMMENT 'LinkedIn cookies as JSON array',
    proxy_url VARCHAR(500) NULL COMMENT 'Optional proxy URL',
    user_agent TEXT NULL COMMENT 'Optional custom user agent',
    status ENUM('pending', 'valid', 'invalid') DEFAULT 'pending' COMMENT 'Account validation status',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_validated_at TIMESTAMP NULL COMMENT 'Last validation attempt timestamp',
    validation_error TEXT NULL COMMENT 'Last validation error message',
    
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_last_validated_at (last_validated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample data for testing (optional)
INSERT INTO linkedin_accounts (name, cookies, status) VALUES 
('Sample Account 1', '[{"name":"li_at","value":"sample_cookie_value","domain":".linkedin.com"}]', 'pending'),
('Sample Account 2', '[{"name":"li_at","value":"another_sample_value","domain":".linkedin.com"}]', 'pending');

-- Create validation logs table for tracking validation history
CREATE TABLE IF NOT EXISTS validation_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    status ENUM('valid', 'invalid') NOT NULL,
    validation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT NULL,
    response_time_ms INT NULL COMMENT 'Validation response time in milliseconds',
    
    FOREIGN KEY (account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    INDEX idx_account_id (account_id),
    INDEX idx_validation_time (validation_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;