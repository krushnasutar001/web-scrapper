-- LinkedIn Accounts table for multi-account management
CREATE TABLE IF NOT EXISTS linkedin_accounts (
    id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY,
    user_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    username VARCHAR(100),
    
    -- Session and authentication
    session_cookie TEXT NOT NULL, -- Encrypted li_at cookie
    cookie_expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    last_validated_at DATETIME,
    validation_status ENUM('ACTIVE', 'INVALID', 'expired', 'blocked', 'pending') DEFAULT 'pending',
    
    -- Proxy configuration
    proxy_url VARCHAR(500),
    proxy_type ENUM('http', 'https', 'socks5', 'rotating') DEFAULT 'http',
    proxy_username VARCHAR(100),
    proxy_password VARCHAR(100),
    proxy_status ENUM('active', 'failed', 'testing') DEFAULT 'active',
    
    -- Rate limiting and cooldowns
    daily_request_limit INT DEFAULT 150,
    requests_today INT DEFAULT 0,
    last_request_at DATETIME,
    cooldown_until DATETIME,
    min_delay_seconds INT DEFAULT 30,
    max_delay_seconds INT DEFAULT 90,
    
    -- Error tracking
    consecutive_failures INT DEFAULT 0,
    last_error_message TEXT,
    last_error_at DATETIME,
    blocked_until DATETIME,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_user_accounts (user_id),
    INDEX idx_active_accounts (user_id, is_active),
    INDEX idx_validation_status (validation_status),
    INDEX idx_cooldown (cooldown_until),
    INDEX idx_daily_requests (requests_today, last_request_at)
);

-- Account usage logs for tracking and analytics
CREATE TABLE IF NOT EXISTS account_usage_logs (
    id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY,
    account_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    job_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    
    -- Usage details
    action_type ENUM('scrape_profile', 'scrape_company', 'search', 'validation') NOT NULL,
    target_url VARCHAR(1000),
    success BOOLEAN DEFAULT FALSE,
    response_time_ms INT,
    
    -- Error details
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Timing
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    
    -- Indexes for analytics
    INDEX idx_account_usage (account_id, started_at),
    INDEX idx_job_usage (job_id),
    INDEX idx_action_type (action_type),
    INDEX idx_success_rate (account_id, success, started_at)
);

-- Job account assignments for multi-account job distribution
CREATE TABLE IF NOT EXISTS job_account_assignments (
    id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY,
    job_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    account_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    
    -- Assignment details
    assigned_urls_count INT DEFAULT 0,
    processed_urls_count INT DEFAULT 0,
    successful_urls_count INT DEFAULT 0,
    failed_urls_count INT DEFAULT 0,
    
    -- Status tracking
    status ENUM('assigned', 'processing', 'completed', 'failed', 'paused') DEFAULT 'assigned',
    started_at DATETIME,
    completed_at DATETIME,
    
    -- Error tracking
    last_error_message TEXT,
    last_error_at DATETIME,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate assignments
    UNIQUE KEY unique_job_account (job_id, account_id),
    
    -- Indexes
    INDEX idx_job_assignments (job_id),
    INDEX idx_account_assignments (account_id),
    INDEX idx_assignment_status (status)
);

-- Account cooldown schedules for advanced rate limiting
CREATE TABLE IF NOT EXISTS account_cooldown_schedules (
    id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY,
    account_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    
    -- Cooldown details
    cooldown_type ENUM('daily_limit', 'rate_limit', 'error_recovery', 'manual') NOT NULL,
    cooldown_start DATETIME NOT NULL,
    cooldown_end DATETIME NOT NULL,
    
    -- Reason and context
    reason TEXT,
    triggered_by_job_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (triggered_by_job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    
    -- Indexes
    INDEX idx_account_cooldowns (account_id, is_active),
    INDEX idx_cooldown_schedule (cooldown_start, cooldown_end),
    INDEX idx_cooldown_type (cooldown_type)
);

-- Jobs table already has multi-account columns, skipping ALTER TABLE statements