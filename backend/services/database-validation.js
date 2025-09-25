const { query } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

class DatabaseValidationService {
  
  /**
   * Validate that a job exists before inserting related records
   */
  static async validateJobExists(jobId, tableName = 'scraping_jobs') {
    try {
      console.log(`🔍 Validating job exists: ${jobId} in table ${tableName}`);
      
      const sql = `SELECT id FROM ${tableName} WHERE id = ? LIMIT 1`;
      const results = await query(sql, [jobId]);
      
      if (!results || results.length === 0) {
        console.error(`❌ Job validation failed: ${jobId} not found in ${tableName}`);
        return false;
      }
      
      console.log(`✅ Job validation passed: ${jobId} exists in ${tableName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error validating job existence:`, error);
      return false;
    }
  }

  /**
   * Validate that a user exists before creating jobs
   */
  static async validateUserExists(userId) {
    try {
      console.log(`🔍 Validating user exists: ${userId}`);
      
      const sql = 'SELECT id FROM users WHERE id = ? LIMIT 1';
      const results = await query(sql, [userId]);
      
      if (!results || results.length === 0) {
        console.error(`❌ User validation failed: ${userId} not found`);
        return false;
      }
      
      console.log(`✅ User validation passed: ${userId} exists`);
      return true;
    } catch (error) {
      console.error(`❌ Error validating user existence:`, error);
      return false;
    }
  }

  /**
   * Validate that a LinkedIn account exists before assignment
   */
  static async validateLinkedInAccountExists(accountId) {
    try {
      console.log(`🔍 Validating LinkedIn account exists: ${accountId}`);
      
      const sql = 'SELECT id FROM linkedin_accounts WHERE id = ? LIMIT 1';
      const results = await query(sql, [accountId]);
      
      if (!results || results.length === 0) {
        console.error(`❌ LinkedIn account validation failed: ${accountId} not found`);
        return false;
      }
      
      console.log(`✅ LinkedIn account validation passed: ${accountId} exists`);
      return true;
    } catch (error) {
      console.error(`❌ Error validating LinkedIn account existence:`, error);
      return false;
    }
  }

  /**
   * Ensure scraping job exists before inserting profile/company results
   */
  static async ensureScrapingJobExists(jobId, jobData = null) {
    try {
      // First check if job exists in scraping_jobs table
      const exists = await this.validateJobExists(jobId, 'scraping_jobs');
      
      if (exists) {
        return true;
      }
      
      // If job doesn't exist and we have job data, create it
      if (jobData) {
        console.log(`🔧 Creating missing scraping job: ${jobId}`);
        
        const sql = `
          INSERT INTO scraping_jobs (
            id, user_id, job_name, job_type, status, 
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'running', NOW(), NOW())
        `;
        
        await query(sql, [
          jobId,
          jobData.user_id || 'system',
          jobData.job_name || 'Auto-created scraping job',
          jobData.job_type || 'profile_scraping'
        ]);
        
        console.log(`✅ Created scraping job: ${jobId}`);
        return true;
      }
      
      console.error(`❌ Cannot create scraping job without job data`);
      return false;
      
    } catch (error) {
      console.error(`❌ Error ensuring scraping job exists:`, error);
      return false;
    }
  }

  /**
   * Safe insert for profile results with validation
   */
  static async safeInsertProfileResult(profileData, jobId, jobData = null) {
    try {
      console.log(`🔍 Safe insert profile result for job: ${jobId}`);
      
      // Ensure the scraping job exists
      const jobExists = await this.ensureScrapingJobExists(jobId, jobData);
      if (!jobExists) {
        throw new Error(`Cannot insert profile result: job ${jobId} does not exist and cannot be created`);
      }
      
      const resultId = uuidv4();
      
      const sql = `
        INSERT INTO profile_results (
          id, job_id, profile_url, full_name, first_name, last_name,
          headline, about, country, city, industry, email, phone, website,
          current_job_title, current_company_url, company_name,
          skills, education, experience, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      
      // Safely extract and validate data
      const values = [
        resultId,
        jobId,
        profileData.url || profileData.profile_url || null,
        profileData.full_name || null,
        profileData.first_name || null,
        profileData.last_name || null,
        profileData.headline || null,
        profileData.about ? profileData.about.substring(0, 1000) : null, // Limit length
        profileData.country || null,
        profileData.city || null,
        profileData.industry || null,
        profileData.email || null,
        profileData.phone || null,
        profileData.website || null,
        profileData.current_job_title || profileData.current_position || null,
        profileData.current_company_url || null,
        profileData.current_company || profileData.company_name || null,
        JSON.stringify(profileData.skills || []),
        JSON.stringify(profileData.education || []),
        JSON.stringify(profileData.experience || []),
        profileData.content_validation === 'valid' ? 'success' : 'partial'
      ];
      
      await query(sql, values);
      
      console.log(`✅ Successfully inserted profile result: ${resultId}`);
      return resultId;
      
    } catch (error) {
      console.error(`❌ Error in safe profile insert:`, error);
      throw error;
    }
  }

  /**
   * Safe insert for company results with validation
   */
  static async safeInsertCompanyResult(companyData, jobId, jobData = null) {
    try {
      console.log(`🔍 Safe insert company result for job: ${jobId}`);
      
      // Ensure the scraping job exists
      const jobExists = await this.ensureScrapingJobExists(jobId, jobData);
      if (!jobExists) {
        throw new Error(`Cannot insert company result: job ${jobId} does not exist and cannot be created`);
      }
      
      const resultId = uuidv4();
      
      const sql = `
        INSERT INTO company_results (
          id, job_id, company_url, company_name, company_industry,
          company_hq, company_followers, company_employee_size,
          company_website, company_type, company_specialties,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      
      // Safely extract and validate data
      const values = [
        resultId,
        jobId,
        companyData.url || companyData.company_url || null,
        companyData.name || companyData.company_name || null,
        companyData.industry || companyData.company_industry || null,
        companyData.location || companyData.company_hq || null,
        companyData.follower_count || companyData.company_followers || null,
        companyData.company_size || companyData.company_employee_size || null,
        companyData.website || companyData.company_website || null,
        companyData.company_type || null,
        companyData.description ? companyData.description.substring(0, 1000) : null, // Limit length
        companyData.content_validation === 'valid' ? 'success' : 'partial'
      ];
      
      await query(sql, values);
      
      console.log(`✅ Successfully inserted company result: ${resultId}`);
      return resultId;
      
    } catch (error) {
      console.error(`❌ Error in safe company insert:`, error);
      throw error;
    }
  }

  /**
   * Validate and clean data before database operations
   */
  static validateAndCleanData(data, maxLength = 255) {
    if (!data) return null;
    
    if (typeof data === 'string') {
      return data.length > maxLength ? data.substring(0, maxLength) : data;
    }
    
    if (typeof data === 'object') {
      return JSON.stringify(data);
    }
    
    return String(data).substring(0, maxLength);
  }

  /**
   * Check if a record already exists to prevent duplicates
   */
  static async checkRecordExists(table, conditions) {
    try {
      const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
      const values = Object.values(conditions);
      
      const sql = `SELECT id FROM ${table} WHERE ${whereClause} LIMIT 1`;
      const results = await query(sql, values);
      
      return results && results.length > 0;
    } catch (error) {
      console.error(`❌ Error checking record existence:`, error);
      return false;
    }
  }
}

module.exports = DatabaseValidationService;