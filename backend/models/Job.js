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
    return await transaction(async (connection) => {
      try {
        const jobId = uuidv4();
        
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
            INSERT INTO job_account_assignments (id, job_id, linkedin_account_id, created_at)
            VALUES (?, ?, ?, NOW())
          `;
          
          for (const accountId of configuration.selectedAccountIds) {
            const assignmentId = uuidv4();
            await connection.execute(assignmentSql, [assignmentId, jobId, accountId]);
          }
        }
        
        console.log(`✅ Created job: ${job_name} (${job_type}) with ${urls.length} URLs`);
        return await Job.findById(jobId);
      } catch (error) {
        console.error('❌ Error creating job:', error);
        throw error;
      }
    });
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
      
      // Add pagination
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
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
      const sql = `
        SELECT * FROM jobs 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      const results = await query(sql, [user_id, limit]);
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
   * Get job results
   */
  async getResults(limit = null, offset = 0) {
    try {
      let sql = `
        SELECT jr.*, ju.url as source_url 
        FROM job_results jr
        JOIN job_urls ju ON jr.job_url_id = ju.id
        WHERE jr.job_id = ?
        ORDER BY jr.created_at DESC
      `;
      const params = [this.id];
      
      if (limit) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }
      
      const results = await query(sql, params);
      return results.map(result => ({
        ...result,
        scraped_data: typeof result.scraped_data === 'string' 
          ? JSON.parse(result.scraped_data) 
          : result.scraped_data
      }));
    } catch (error) {
      console.error('❌ Error getting job results:', error);
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
      return results;
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
   * Check if job can be resumed
   */
  canBeResumed() {
    return this.status === 'paused';
  }

  /**
   * Convert to JSON with additional computed fields
   */
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      job_name: this.job_name,
      job_type: this.job_type,
      status: this.status,
      max_results: this.max_results,
      configuration: this.configuration,
      total_urls: this.total_urls,
      processed_urls: this.processed_urls,
      successful_urls: this.successful_urls,
      failed_urls: this.failed_urls,
      result_count: this.result_count,
      error_message: this.error_message,
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