-- Test Data for Scralytics Hub Multi-User Testing
-- Creates test users and LinkedIn accounts as specified in the testing plan

USE linkedin_automation;

-- Clear existing test data (optional - uncomment if needed)
-- DELETE FROM users WHERE id IN ('101', '202');

-- Create Test Users
-- User A (ID: 101)
INSERT INTO users (id, email, password_hash, name, credits, is_active, created_at, updated_at) 
VALUES (
    '101', 
    'user_a@scralytics.com', 
    '$2b$10$rOzJqZxNzNzNzNzNzNzNzOzJqZxNzNzNzNzNzNzNzOzJqZxNzNzNzN', -- password: 'testpass123'
    'Test User A', 
    5000, 
    TRUE, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    email = VALUES(email),
    name = VALUES(name),
    credits = VALUES(credits),
    updated_at = NOW();

-- User B (ID: 202)
INSERT INTO users (id, email, password_hash, name, credits, is_active, created_at, updated_at) 
VALUES (
    '202', 
    'user_b@scralytics.com', 
    '$2b$10$rOzJqZxNzNzNzNzNzNzNzOzJqZxNzNzNzNzNzNzNzOzJqZxNzNzNzN', -- password: 'testpass123'
    'Test User B', 
    3000, 
    TRUE, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    email = VALUES(email),
    name = VALUES(name),
    credits = VALUES(credits),
    updated_at = NOW();

-- LinkedIn Accounts for User A
-- Account 1: Recruiter A
INSERT INTO linkedin_accounts (
    id, user_id, account_name, email, is_active, validation_status, 
    daily_request_limit, requests_today, consecutive_failures, created_at, updated_at
) VALUES (
    'linkedin_101_1', 
    '101', 
    'Recruiter A Account', 
    'recruiter_a@company.com', 
    TRUE, 
    'ACTIVE', 
    150, 
    0, 
    0, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    account_name = VALUES(account_name),
    email = VALUES(email),
    validation_status = VALUES(validation_status),
    updated_at = NOW();

-- Account 2: Sales B
INSERT INTO linkedin_accounts (
    id, user_id, account_name, email, is_active, validation_status, 
    daily_request_limit, requests_today, consecutive_failures, created_at, updated_at
) VALUES (
    'linkedin_101_2', 
    '101', 
    'Sales B Account', 
    'sales_b@company.com', 
    TRUE, 
    'ACTIVE', 
    150, 
    0, 
    0, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    account_name = VALUES(account_name),
    email = VALUES(email),
    validation_status = VALUES(validation_status),
    updated_at = NOW();

-- LinkedIn Account for User B
-- Account 3: Marketing X
INSERT INTO linkedin_accounts (
    id, user_id, account_name, email, is_active, validation_status, 
    daily_request_limit, requests_today, consecutive_failures, created_at, updated_at
) VALUES (
    'linkedin_202_1', 
    '202', 
    'Marketing X Account', 
    'marketing_x@gmail.com', 
    TRUE, 
    'ACTIVE', 
    150, 
    0, 
    0, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    account_name = VALUES(account_name),
    email = VALUES(email),
    validation_status = VALUES(validation_status),
    updated_at = NOW();

-- Create Test Jobs
-- Job 1001: Profile scraping for User A with Recruiter A account
INSERT INTO jobs (
    id, user_id, job_name, job_type, status, max_results, 
    configuration, total_urls, processed_urls, successful_urls, 
    failed_urls, result_count, created_at, updated_at
) VALUES (
    '1001', 
    '101', 
    'Profile Scraping - Recruiter A', 
    'profile', 
    'pending', 
    50, 
    JSON_OBJECT('selectedAccountIds', JSON_ARRAY('linkedin_101_1'), 'scrapeFields', JSON_ARRAY('name', 'title', 'company', 'location')), 
    50, 
    0, 
    0, 
    0, 
    0, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    job_name = VALUES(job_name),
    status = 'pending',
    updated_at = NOW();

-- Job 1002: Company scraping for User A with Sales B account
INSERT INTO jobs (
    id, user_id, job_name, job_type, status, max_results, 
    configuration, total_urls, processed_urls, successful_urls, 
    failed_urls, result_count, created_at, updated_at
) VALUES (
    '1002', 
    '101', 
    'Company Scraping - Sales B', 
    'company', 
    'pending', 
    20, 
    JSON_OBJECT('selectedAccountIds', JSON_ARRAY('linkedin_101_2'), 'scrapeFields', JSON_ARRAY('name', 'industry', 'size', 'location')), 
    20, 
    0, 
    0, 
    0, 
    0, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    job_name = VALUES(job_name),
    status = 'pending',
    updated_at = NOW();

-- Job 1003: Job post scraping for User B with Marketing X account
INSERT INTO jobs (
    id, user_id, job_name, job_type, status, max_results, 
    configuration, total_urls, processed_urls, successful_urls, 
    failed_urls, result_count, created_at, updated_at
) VALUES (
    '1003', 
    '202', 
    'Job Post Scraping - Marketing X', 
    'job_post', 
    'pending', 
    30, 
    JSON_OBJECT('selectedAccountIds', JSON_ARRAY('linkedin_202_1'), 'scrapeFields', JSON_ARRAY('title', 'company', 'location', 'description')), 
    30, 
    0, 
    0, 
    0, 
    0, 
    NOW(), 
    NOW()
) ON DUPLICATE KEY UPDATE 
    job_name = VALUES(job_name),
    status = 'pending',
    updated_at = NOW();

-- Create Job Account Assignments
INSERT INTO job_account_assignments (id, job_id, linkedin_account_id, assigned_at) 
VALUES 
    ('assignment_1001', '1001', 'linkedin_101_1', NOW()),
    ('assignment_1002', '1002', 'linkedin_101_2', NOW()),
    ('assignment_1003', '1003', 'linkedin_202_1', NOW())
ON DUPLICATE KEY UPDATE assigned_at = NOW();

-- Create sample URLs for testing
-- URLs for Job 1001 (Profile scraping)
INSERT INTO job_urls (id, job_id, url, status, created_at) VALUES
    ('url_1001_1', '1001', 'https://linkedin.com/in/johndoe', 'pending', NOW()),
    ('url_1001_2', '1001', 'https://linkedin.com/in/janesmith', 'pending', NOW()),
    ('url_1001_3', '1001', 'https://linkedin.com/in/mikejohnson', 'pending', NOW()),
    ('url_1001_4', '1001', 'https://linkedin.com/in/sarahwilson', 'pending', NOW()),
    ('url_1001_5', '1001', 'https://linkedin.com/in/davidbrown', 'pending', NOW())
ON DUPLICATE KEY UPDATE status = 'pending';

-- URLs for Job 1002 (Company scraping)
INSERT INTO job_urls (id, job_id, url, status, created_at) VALUES
    ('url_1002_1', '1002', 'https://linkedin.com/company/techcorp', 'pending', NOW()),
    ('url_1002_2', '1002', 'https://linkedin.com/company/innovate-inc', 'pending', NOW()),
    ('url_1002_3', '1002', 'https://linkedin.com/company/startup-xyz', 'pending', NOW())
ON DUPLICATE KEY UPDATE status = 'pending';

-- URLs for Job 1003 (Job post scraping)
INSERT INTO job_urls (id, job_id, url, status, created_at) VALUES
    ('url_1003_1', '1003', 'https://linkedin.com/jobs/view/123456789', 'pending', NOW()),
    ('url_1003_2', '1003', 'https://linkedin.com/jobs/view/987654321', 'pending', NOW()),
    ('url_1003_3', '1003', 'https://linkedin.com/jobs/view/456789123', 'pending', NOW())
ON DUPLICATE KEY UPDATE status = 'pending';

-- Verify test data
SELECT 'Users Created:' as Info;
SELECT id, email, name, credits FROM users WHERE id IN ('101', '202');

SELECT 'LinkedIn Accounts Created:' as Info;
SELECT id, user_id, account_name, email, validation_status FROM linkedin_accounts WHERE user_id IN ('101', '202');

SELECT 'Jobs Created:' as Info;
SELECT id, user_id, job_name, job_type, status, total_urls FROM jobs WHERE id IN ('1001', '1002', '1003');

SELECT 'Job URLs Created:' as Info;
SELECT job_id, COUNT(*) as url_count FROM job_urls WHERE job_id IN ('1001', '1002', '1003') GROUP BY job_id;