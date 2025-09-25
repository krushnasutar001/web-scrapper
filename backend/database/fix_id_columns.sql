-- Fix id columns in result tables to accept UUIDs instead of integers
USE linkedin_automation_saas;

-- Fix profile_results table
ALTER TABLE profile_results 
MODIFY COLUMN id VARCHAR(36) NOT NULL,
DROP PRIMARY KEY,
ADD PRIMARY KEY (id);

-- Fix company_results table  
ALTER TABLE company_results 
MODIFY COLUMN id VARCHAR(36) NOT NULL,
DROP PRIMARY KEY,
ADD PRIMARY KEY (id);

-- Fix search_results table
ALTER TABLE search_results 
MODIFY COLUMN id VARCHAR(36) NOT NULL,
DROP PRIMARY KEY,
ADD PRIMARY KEY (id);

-- Show updated table structures
DESCRIBE profile_results;
DESCRIBE company_results;
DESCRIBE search_results;