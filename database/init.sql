-- LinkedIn Automation SaaS Database Initialization
-- This file is automatically executed when MySQL container starts

USE linkedin_automation;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(userId);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(createdAt);
CREATE INDEX IF NOT EXISTS idx_results_job_id ON results(jobId);
CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(createdAt);

-- Insert sample data for testing (optional)
-- You can uncomment these lines for development/testing

/*
-- Sample user (password: 'password123' hashed with bcrypt)
INSERT INTO users (id, email, passwordHash, createdAt, updatedAt) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'demo@example.com', '$2b$10$rOzJqZxNzNzNzNzNzNzNzOzJqZxNzNzNzNzNzNzNzOzJqZxNzNzNzN', NOW(), NOW());

-- Sample job
INSERT INTO jobs (id, userId, type, query, status, createdAt, updatedAt) VALUES 
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'profile', 'software engineer', 'completed', NOW(), NOW());

-- Sample result
INSERT INTO results (id, jobId, data, createdAt) VALUES 
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 
'{"name": "John Doe", "title": "Software Engineer", "company": "Tech Corp", "location": "San Francisco, CA", "url": "https://linkedin.com/in/johndoe"}', 
NOW());
*/

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON linkedin_automation.* TO 'appuser'@'%';
FLUSH PRIVILEGES;

-- Show tables for verification
SHOW TABLES;