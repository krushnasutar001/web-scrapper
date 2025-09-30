const { query, transaction } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

class Job {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.job_name = data.job_name;
    this.job_type = data.job_type;
    this.status = data.status;
    this.max_results = data.max_results;
    this.configuration = typeof data.configuration === 'string' ? JSON.parse(data.configuration) : data.configuration;
    this.total_urls = data.total_urls;
    this.processed_urls = data.processed_urls;
    this.successful_urls = data.successful_urls;
    this.failed_urls = data.failed_urls;
    this.result_count = data.result_count;
    this.error_message = data.error_message;
    this.created_at = data.created_at;
    this.started_at = data.started_at;
    this.completed_at = data.completed_at;
    this.paused_at = data.paused_at;
    this.resumed_at = data.resumed_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Create a new job
   */
  static async create({ user_id, job_name, job_type, max_results = 100, configuration = {}, urls = [] }) {
    try {
      console.log('🔍 Starting job creation transaction...');
      return await transaction(async (connection) => {
        try {
          const jobId = uuidv4();
          console.log('🔍 Generated job ID:', jobId);
        
        // Insert job
        const jobSql = `
          INSERT INTO jobs (
            id, user_id, job_name, job_type, status, max_results, 
            configuration, total_urls, processed_urls, successful_urls, 
            failed_urls, result_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, 0, 0, 0, 0, NOW(), NOW())
        `;
        
        await connection.execute(jobSql, [
          jobId, user_id, job_name, job_type, max_results, 
          JSON.stringify(configuration), urls.length
        ]);
        
        // Insert URLs
        if (urls.length > 0) {
          const urlSql = `
            INSERT INTO job_urls (id, job_id, url, status, created_at) 
            VALUES (?, ?, ?, 'pending', NOW())
          `;
          
          for (const url of urls) {
            const urlId = uuidv4();
            await connection.execute(urlSql, [urlId, jobId, url]);
          }
        }
        
        // Insert account assignments if specified
        if (configuration.selectedAccountIds && configuration.selectedAccountIds.length > 0) {
          const assignmentSql = `
            INSERT INTO job_account_assignments (id, job_id, linkedin_account_id, assigned_at)
            VALUES (?, ?, ?, NOW())
          `;
          
          for (const accountId of configuration.selectedAccountIds) {
            const assignmentId = uuidv4();
            await connection.execute(assignmentSql, [assignmentId, jobId, accountId]);
          }
        }
        
        console.log(`✅ Created job: ${job_name} (${job_type}) with ${urls.length} URLs`);
        
        // Add debugging for findById
        console.log('🔍 Looking for job with ID:', jobId);
        
        // First check with raw query within transaction
        const [rawResults] = await connection.execute('SELECT * FROM jobs WHERE id = ?', [jobId]);
        console.log('🔍 Raw query within transaction found:', rawResults.length, 'jobs');
        
        if (rawResults.length > 0) {
          console.log('🔍 Job exists in transaction, returning new Job instance');
          return new Job(rawResults[0]);
        } else {
          console.log('❌ Job not found even within transaction');
          return null;
        }
      } catch (error) {
          console.error('❌ Error creating job (inner):', error);
          throw error;
        }
      });
    } catch (error) {
      console.error('❌ Error creating job (outer):', error);
      throw error;
    }
  }

  /**
   * Find job by ID
   */
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM jobs WHERE id = ?';
      const results = await query(sql, [id]);
      
      if (results.length === 0) {
        return null;
      }
      
      return new Job(results[0]);
    } catch (error) {
      console.error('❌ Error finding job by ID:', error);
      throw error;
    }
  }

  /**
   * Find all jobs for a user
   */
  static async findByUserId(user_id, options = {}) {
    try {
      let sql = 'SELECT * FROM jobs WHERE user_id = ?';
      const params = [user_id];
      
      // Add status filter if provided
      if (options.status) {
        sql += ' AND status = ?';
        params.push(options.status);
      }
      
      // Add ordering
      sql += ' ORDER BY created_at DESC';
      
      // Add pagination with safe integer handling
      if (options.limit) {
        const safeLimit = Math.max(1, Math.min(1000, parseInt(options.limit) || 50));
        sql += ` LIMIT ${safeLimit}`;
        
        if (options.offset) {
          const safeOffset = Math.max(0, parseInt(options.offset) || 0);
          sql += ` OFFSET ${safeOffset}`;
        }
      }
      
      const results = await query(sql, params);
      return results.map(job => new Job(job));
    } catch (error) {
      console.error('❌ Error finding jobs by user ID:', error);
      throw error;
    }
  }

  /**
   * Get job statistics for a user
   */
  static async getStatsByUserId(user_id) {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN status = 'running' THEN 1 END) as running_jobs,
          COUNT(CASE WHEN status = 'paused' THEN 1 END) as paused_jobs,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
          SUM(result_count) as total_results,
          SUM(total_urls) as total_urls_processed
        FROM jobs 
        WHERE user_id = ?
      `;
      
      const results = await query(sql, [user_id]);
      const stats = results[0];
      
      // Calculate success rate
      const successRate = stats.total_jobs > 0 
        ? Math.round((stats.completed_jobs / stats.total_jobs) * 100) 
        : 0;
      
      return {
        ...stats,
        success_rate: successRate,
        active_jobs: (stats.running_jobs || 0) + (stats.paused_jobs || 0)
      };
    } catch (error) {
      console.error('❌ Error getting job statistics:', error);
      throw error;
    }
  }

  /**
   * Get recent jobs for dashboard
   */
  static async getRecentByUserId(user_id, limit = 5) {
    try {
      // Ensure limit is a safe integer
      const safeLimit = Math.max(1, Math.min(100, parseInt(limit) || 5));
      
      const sql = `
        SELECT * FROM jobs 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ${safeLimit}
      `;
      
      const results = await query(sql, [user_id]);
      return results.map(job => new Job(job));
    } catch (error) {
      console.error('❌ Error getting recent jobs:', error);
      throw error;
    }
  }

  /**
   * Update job status
   */
  async updateStatus(status, additionalData = {}) {
    try {
      const updates = { status, ...additionalData };
      const updateFields = [];
      const updateValues = [];
      
      // Handle status-specific timestamps
      if (status === 'running' && !this.started_at) {
        updates.started_at = new Date();
      } else if (['completed', 'failed', 'cancelled'].includes(status) && !this.completed_at) {
        updates.completed_at = new Date();
      } else if (status === 'paused') {
        updates.paused_at = new Date();
      }
      
      // Build update query
      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id') {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
      }
      
      updateFields.push('updated_at = NOW()');
      updateValues.push(this.id);
      
      const sql = `UPDATE jobs SET ${updateFields.join(', ')} WHERE id = ?`;
      await query(sql, updateValues);
      
      // Update local properties
      Object.assign(this, updates);
      
      console.log(`📊 Updated job ${this.id} status to: ${status}`);
      return this;
    } catch (error) {
      console.error('❌ Error updating job status:', error);
      throw error;
    }
  }

  /**
   * Update job progress
   */
  async updateProgress({ processed_urls, successful_urls, failed_urls, result_count }) {
    try {
      const sql = `
        UPDATE jobs 
        SET processed_urls = ?, successful_urls = ?, failed_urls = ?, 
            result_count = ?, updated_at = NOW()
        WHERE id = ?
      `;
      
      await query(sql, [processed_urls, successful_urls, failed_urls, result_count, this.id]);
      
      // Update local properties
      this.processed_urls = processed_urls;
      this.successful_urls = successful_urls;
      this.failed_urls = failed_urls;
      this.result_count = result_count;
      
      return this;
    } catch (error) {
      console.error('❌ Error updating job progress:', error);
      throw error;
    }
  }

  /**
   * Get job URLs
   */
  async getUrls(status = null) {
    try {
      let sql = 'SELECT * FROM job_urls WHERE job_id = ?';
      const params = [this.id];
      
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      
      sql += ' ORDER BY created_at ASC';
      
      const results = await query(sql, params);
      return results;
    } catch (error) {
      console.error('❌ Error getting job URLs:', error);
      throw error;
    }
  }

  /**
   * Get job results based on job type
   */
  async getResults(limit = null, offset = 0) {
    try {
      let sql, params;
      
      // Handle different job types with their specific tables
      if (this.job_type === 'profile_scraping') {
        sql = `
          SELECT pr.*
          FROM profile_results pr
          WHERE pr.job_id = ?
          ORDER BY pr.created_at DESC
        `;
        params = [this.id];
        
        if (limit) {
          sql += ' LIMIT ? OFFSET ?';
          params.push(limit, offset);
        }
        
        const results = await query(sql, params);
        console.log(`📊 Found ${results.length} profile results for job ${this.id}`);
        return results;
        
      } else if (this.job_type === 'company_scraping') {
        sql = `
          SELECT cr.*
          FROM company_results cr
          WHERE cr.job_id = ?
          ORDER BY cr.created_at DESC
        `;
        params = [this.id];
        
        if (limit) {
          sql += ' LIMIT ? OFFSET ?';
          params.push(limit, offset);
        }
        
        const results = await query(sql, params);
        return results;
        
      } else if (this.job_type === 'search_result_scraping') {
        sql = `
          SELECT sr.*
          FROM search_results sr
          WHERE sr.job_id = ?
          ORDER BY sr.created_at DESC
        `;
        params = [this.id];
        
        if (limit) {
          sql += ' LIMIT ? OFFSET ?';
          params.push(limit, offset);
        }
        
        const results = await query(sql, params);
        
        // Format search results for export
        return results.map(result => {
          let additionalData = {};
          
          try {
            additionalData = typeof result.additional_data === 'string' 
              ? JSON.parse(result.additional_data) 
              : result.additional_data || {};
          } catch (e) {
            console.warn('Failed to parse additional_data JSON:', e);
            additionalData = {};
          }
          
          return {
            ...result,
            ...additionalData,
            // Map fields for export compatibility
            full_name: result.title || '',
            company_name: result.subtitle || '',
            headline: result.description || '',
            profile_url: result.result_url || '',
            linkedin_url: result.result_url || '',
            location: result.location || '',
            search_query: result.search_query || ''
          };
        });
      } else {
        // Fallback to original logic for legacy job types
        sql = `
          SELECT jr.*, ju.url as source_url
          FROM job_results jr
          LEFT JOIN job_urls ju ON jr.job_url_id = ju.id
          WHERE jr.job_id = ?
          ORDER BY jr.created_at DESC
        `;
        
        params = [this.id];
        
        if (limit) {
          sql += ' LIMIT ? OFFSET ?';
          params.push(limit, offset);
        }
        
        const results = await query(sql, params);
        
        // Parse JSON fields and format data based on job type
        return results.map(result => {
          let parsedData = {};
          
          try {
            parsedData = typeof result.scraped_data === 'string' 
              ? JSON.parse(result.scraped_data) 
              : result.scraped_data || {};
          } catch (e) {
            console.warn('Failed to parse scraped_data JSON:', e);
            parsedData = {};
          }
          
          // Merge database fields with parsed JSON data
          return {
            ...result,
            ...parsedData,
            // Ensure these fields are available for export
            full_name: result.name || parsedData.full_name || '',
            first_name: parsedData.first_name || '',
            last_name: parsedData.last_name || '',
            headline: parsedData.headline || result.title || '',
            about: parsedData.about || '',
            country: parsedData.country || '',
            city: parsedData.city || '',
            industry: parsedData.industry || '',
            email: result.email || parsedData.email || '',
            phone: parsedData.phone || '',
            website: parsedData.website || '',
            current_job_title: parsedData.current_job_title || result.title || '',
            current_company_url: parsedData.current_company_url || '',
            company_name: result.company || parsedData.company_name || parsedData.current_company || '',
            skills: parsedData.skills || [],
            education: parsedData.education || [],
            experience: parsedData.experience || [],
            profile_url: result.linkedin_url || parsedData.profile_url || result.source_url || '',
            linkedin_url: result.linkedin_url || parsedData.linkedin_url || result.source_url || ''
          };
        });
      }
    } catch (error) {
      console.error('❌ Error getting job results:', error);
      throw error;
    }
  }

  /**
   * Add result to appropriate table based on job type
   */
  async addResult(resultData) {
    try {
      const resultId = uuidv4();
      let sql, params;
      
      switch (this.job_type) {
        case 'profile_scraping':
          // Check if we need to reference scraping_jobs instead of jobs table
          sql = `
            INSERT INTO profile_results (
              id, job_id, profile_url, full_name, first_name, last_name, headline, 
              about, country, city, industry, email, phone, website, 
              current_job_title, current_company_url, company_name, 
              skills, education, experience, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;
          params = [
            resultId, this.id, resultData.profile_url || null, resultData.full_name || null,
            resultData.first_name || null, resultData.last_name || null, resultData.headline || null,
            resultData.about || null, resultData.country || null, resultData.city || null,
            resultData.industry || null, resultData.email || null, resultData.phone || null,
            resultData.website || null, resultData.current_job_title || null,
            resultData.current_company_url || null, resultData.company_name || null,
            JSON.stringify(resultData.skills || []),
            JSON.stringify(resultData.education || []),
            JSON.stringify(resultData.experience || []),
            resultData.status || 'completed'
          ];
          break;
          
        case 'company_scraping':
          sql = `
            INSERT INTO company_results (
              id, job_id, company_name, company_url, company_industry, 
              company_size, company_location, company_description, 
              company_website, company_specialties, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;
          params = [
            resultId, this.id, resultData.company_name, resultData.company_url,
            resultData.company_industry, resultData.company_size,
            resultData.company_location, resultData.company_description,
            resultData.company_website, resultData.company_specialties
          ];
          break;
          
        case 'search_result_scraping':
          sql = `
            INSERT INTO search_results (
              id, job_id, search_url, result_type, result_url, 
              title, subtitle, description, location, search_query, 
              additional_data, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;
          params = [
            resultId, this.id, resultData.search_url || 'https://linkedin.com/search',
            resultData.result_type || 'profile', resultData.url || resultData.result_url,
            resultData.title, resultData.subtitle || resultData.company,
            resultData.description, resultData.location,
            resultData.search_query || 'General Search',
            JSON.stringify(resultData.additional_info || {})
          ];
          break;
          
        default:
          throw new Error(`Unknown job type: ${this.job_type}`);
      }
      
      await query(sql, params);
      console.log(`✅ Added ${this.job_type} result for job ${this.id}`);
      return resultId;
    } catch (error) {
      console.error('❌ Error adding job result:', error);
      throw error;
    }
  }

  /**
   * Get assigned LinkedIn accounts
   */
  async getAssignedAccounts() {
    try {
      const sql = `
        SELECT la.* 
        FROM linkedin_accounts la
        JOIN job_account_assignments jaa ON la.id = jaa.linkedin_account_id
        WHERE jaa.job_id = ?
      `;
      
      const results = await query(sql, [this.id]);
      const LinkedInAccount = require('./LinkedInAccount');
      return results.map(account => new LinkedInAccount(account));
    } catch (error) {
      console.error('❌ Error getting assigned accounts:', error);
      throw error;
    }
  }

  /**
   * Pause job
   */
  async pause() {
    if (this.status !== 'running') {
      throw new Error('Job is not running');
    }
    
    return await this.updateStatus('paused', { paused_at: new Date() });
  }

  /**
   * Resume job
   */
  async resume() {
    if (this.status !== 'paused') {
      throw new Error('Job is not paused');
    }
    
    return await this.updateStatus('running', { resumed_at: new Date() });
  }

  /**
   * Cancel job
   */
  async cancel() {
    if (['completed', 'failed', 'cancelled'].includes(this.status)) {
      throw new Error('Job is already finished');
    }
    
    return await this.updateStatus('cancelled', { completed_at: new Date() });
  }

  /**
   * Delete job and all related data
   */
  async delete() {
    try {
      const sql = 'DELETE FROM jobs WHERE id = ?';
      await query(sql, [this.id]);
      
      console.log(`✅ Deleted job: ${this.id}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting job:', error);
      throw error;
    }
  }

  /**
   * Get progress percentage
   */
  getProgressPercentage() {
    if (this.total_urls === 0) return 0;
    return Math.round((this.processed_urls / this.total_urls) * 100);
  }

  /**
   * Get progress object for frontend
   */
  getProgress() {
    return {
      totalUrls: this.total_urls,
      processed: this.processed_urls,
      successful: this.successful_urls,
      failed: this.failed_urls,
      pending: this.total_urls - this.processed_urls,
      percentage: this.getProgressPercentage()
    };
  }

  /**
   * Check if job is finished
   */
  isFinished() {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Check if job can be paused
   */
  canBePaused() {
    return this.status === 'running';
  }

  /**
   * Get job statistics
   */
  async getStats() {
    try {
      // Get basic job stats
      const basicStats = {
        id: this.id,
        job_name: this.job_name,
        job_type: this.job_type,
        status: this.status,
        total_urls: this.total_urls || 0,
        processed_urls: this.processed_urls || 0,
        successful_urls: this.successful_urls || 0,
        failed_urls: this.failed_urls || 0,
        result_count: this.result_count || 0,
        progress: this.getProgress(),
        created_at: this.created_at,
        started_at: this.started_at,
        completed_at: this.completed_at
      };

      // Get detailed results stats if job has results
      if (this.result_count > 0) {
        const resultsSql = `
          SELECT 
            COUNT(*) as total_results,
            COUNT(CASE WHEN name IS NOT NULL AND name != '' THEN 1 END) as results_with_name,
            COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as results_with_email,
            COUNT(CASE WHEN company IS NOT NULL AND company != '' THEN 1 END) as results_with_company,
            COUNT(CASE WHEN title IS NOT NULL AND title != '' THEN 1 END) as results_with_title
          FROM job_results 
          WHERE job_id = ?
        `;
        
        const resultsStats = await query(resultsSql, [this.id]);
        
        if (resultsStats.length > 0) {
          basicStats.results_breakdown = {
            total_results: resultsStats[0].total_results || 0,
            results_with_name: resultsStats[0].results_with_name || 0,
            results_with_email: resultsStats[0].results_with_email || 0,
            results_with_company: resultsStats[0].results_with_company || 0,
            results_with_title: resultsStats[0].results_with_title || 0
          };
        }
      }

      return basicStats;
    } catch (error) {
      console.error('❌ Error getting job stats:', error);
      throw error;
    }
  }

  /**
   * Check if job can be resumed
   */
  canBeResumed() {
    return this.status === 'paused';
  }

  /**
   * Convert to JSON with additional computed fields
   * Includes safe defaults to prevent frontend errors
   */
  toJSON() {
    // Ensure job_type has a safe default value
    const safeJobType = this.job_type && typeof this.job_type === 'string' 
      ? this.job_type.trim() 
      : 'unknown';
    
    // Ensure job_name has a safe default value
    const safeJobName = this.job_name && typeof this.job_name === 'string'
      ? this.job_name.trim()
      : `Job ${this.id ? this.id.toString().slice(0, 8) : 'Unknown'}`;
    
    return {
      id: this.id,
      user_id: this.user_id,
      job_name: safeJobName,
      job_type: safeJobType,
      // Include both field names for frontend compatibility
      type: safeJobType, // Frontend expects 'type'
      query: safeJobName, // Frontend expects 'query'
      status: this.status || 'unknown',
      max_results: this.max_results || 0,
      configuration: this.configuration || {},
      total_urls: this.total_urls || 0,
      processed_urls: this.processed_urls || 0,
      successful_urls: this.successful_urls || 0,
      failed_urls: this.failed_urls || 0,
      result_count: this.result_count || 0,
      error_message: this.error_message || null,
      created_at: this.created_at,
      started_at: this.started_at,
      completed_at: this.completed_at,
      paused_at: this.paused_at,
      resumed_at: this.resumed_at,
      updated_at: this.updated_at,
      progress: this.getProgress(),
      isFinished: this.isFinished(),
      canBePaused: this.canBePaused(),
      canBeResumed: this.canBeResumed()
    };
  }
}

module.exports = Job;
