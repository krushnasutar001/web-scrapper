-- Migration: Add cookie-based authentication fields to linkedin_accounts table
-- Date: 2024-01-20
-- Description: Adds cookie_path, status, and last_validated columns for cookie-based LinkedIn account management

USE linkedin_automation_saas;

-- Add new columns to linkedin_accounts table
ALTER TABLE linkedin_accounts 
ADD COLUMN cookie_path VARCHAR(500) NULL COMMENT 'Path to JSON file containing LinkedIn cookies',
ADD COLUMN status ENUM('active', 'inactive') DEFAULT 'inactive' COMMENT 'Account status based on cookie validation',
ADD COLUMN last_validated DATETIME NULL COMMENT 'Last time cookies were validated against LinkedIn';

-- Add index for better performance on status queries
CREATE INDEX idx_linkedin_accounts_status_new ON linkedin_accounts(status);
CREATE INDEX idx_linkedin_accounts_last_validated ON linkedin_accounts(last_validated);

-- Update existing accounts to have 'inactive' status by default
UPDATE linkedin_accounts SET status = 'inactive' WHERE status IS NULL;

-- Make email field nullable since we're moving to cookie-based auth
ALTER TABLE linkedin_accounts MODIFY COLUMN email VARCHAR(255) NULL;

-- Add comment to table
ALTER TABLE linkedin_accounts COMMENT = 'LinkedIn accounts with cookie-based authentication support';