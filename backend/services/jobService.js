// Enhanced Job Service for Scralytics Hub Multi-User Testing
const { query, transaction } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const Job = require('../models/Job');
const User = require('../models/User');
const LinkedInAccount = require('../models/LinkedInAccount');
const { logActivity, logError } = require('./loggingService');

class JobService {
  /**
   * Create a new job with comprehensive validation and error handling
   */
  static async createJob({ userId, jobName, jobType, maxResults = 100, urls = [], selectedAccountIds = [] }) {
    try {
      console.log(`🔍 Creating job for user ${userId}: ${jobName} (${jobType})`);
      
      return await transaction(async (connection) => {
        // 1. Validate user exists and has sufficient credits
        const user = await User.findById(userId);
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }
        
        if (!user.is_active) {
          throw new Error(`User ${userId} is not active`);
        }
        
        // Calculate required credits (1 credit per URL)
        const requiredCredits = urls.length;
        if (user.credits < requiredCredits) {
          throw new Error(`Insufficient credits. Required: ${requiredCredits}, Available: ${user.credits}`);
        }
        
        // 2. Validate LinkedIn accounts belong to user and are active
        if (selectedAccountIds.length === 0) {
          throw new Error('At least one LinkedIn account must be selected');
        }
        
        const accounts = await LinkedInAccount.findByUserId(userId);
        const activeAccountIds = accounts
          .filter(acc => acc.is_active && acc.validation_status === 'ACTIVE')
          .map(acc => acc.id);
        
        const invalidAccountIds = selectedAccountIds.filter(id => !activeAccountIds.includes(id));
        if (invalidAccountIds.length > 0) {
          throw new Error(`Invalid or inactive LinkedIn accounts: ${invalidAccountIds.join(', ')}`);
        }
        
        // 3. Create job with proper configuration
        const jobId = uuidv4();
        const configuration = {
          selectedAccountIds,
          scrapeFields: JobService.getDefaultScrapeFields(jobType),
          maxRetries: 3,
          retryDelay: 5000,
          timeout: 30000
        };
        
        const jobSql = `
          INSERT INTO jobs (
            id, user_id, job_name, job_type, status, max_results, 
            configuration, total_urls, processed_urls, 
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, 0, NOW(), NOW())
        `;
        
        await connection.execute(jobSql, [
          jobId, userId, jobName, jobType, maxResults, 
          JSON.stringify(configuration), urls.length
        ]);
        
        // 4. Insert URLs with validation
        if (urls.length > 0) {
          const urlSql = `
            INSERT INTO job_urls (id, job_id, url, url_type, status, created_at) 
            VALUES (?, ?, ?, ?, 'pending', NOW())
          `;
          
          for (const url of urls) {
            if (!JobService.validateUrl(url, jobType)) {
              throw new Error(`Invalid URL for job type ${jobType}: ${url}`);
            }
            
            const urlId = uuidv4();
            await connection.execute(urlSql, [urlId, jobId, url, jobType]);
          }
        }
        
        // 5. Create job account assignments
        const assignmentSql = `
          INSERT INTO job_account_assignments (id, job_id, linkedin_account_id, assigned_at)
          VALUES (?, ?, ?, NOW())
        `;
        
        for (const accountId of selectedAccountIds) {
          const assignmentId = uuidv4();
          await connection.execute(assignmentSql, [assignmentId, jobId, accountId]);
        }
        
        // 6. Add job to queue for processing
        await JobService.addToQueue(jobId, selectedAccountIds, connection);
        
        // 7. Reserve credits (don't deduct until job completion)
        const updateCreditsSql = `
          UPDATE users SET credits = credits - ?, updated_at = NOW() 
          WHERE id = ? AND credits >= ?
        `;
        
        const [creditResult] = await connection.execute(updateCreditsSql, [
          requiredCredits, userId, requiredCredits
        ]);
        
        if (creditResult.affectedRows === 0) {
          throw new Error('Failed to reserve credits - insufficient balance or concurrent modification');
        }
        
        // 8. Log activity
        await logActivity({
          userId,
          jobId,
          action: 'JOB_CREATED',
          details: {
            jobName,
            jobType,
            urlCount: urls.length,
            accountIds: selectedAccountIds,
            creditsReserved: requiredCredits
          }
        });
        
        console.log(`✅ Job created successfully: ${jobId}`);
        
        // Return the created job
        const [jobResults] = await connection.execute('SELECT * FROM jobs WHERE id = ?', [jobId]);
        return new Job(jobResults[0]);
      });
      
    } catch (error) {
      console.error('❌ Error creating job:', error);
      
      // Log error for debugging
      await logError({
        jobId: null,
        linkedinAccountId: null,
        errorType: 'DB_ERROR',
        errorMessage: error.message,
        errorDetails: {
          userId,
          jobName,
          jobType,
          urlCount: urls.length
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Add job to processing queue with round-robin assignment
   */
  static async addToQueue(jobId, accountIds, connection = null) {
    try {
      const executeQuery = connection ? 
        (sql, params) => connection.execute(sql, params) : 
        (sql, params) => query(sql, params);
      
      // Round-robin assignment: distribute across available accounts
      for (let i = 0; i < accountIds.length; i++) {
        const queueId = uuidv4();
        const priority = i; // First account gets highest priority (0)
        
        const queueSql = `
          INSERT INTO job_queue (
            id, job_id, linkedin_account_id, priority, status, 
            retry_count, max_retries, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'queued', 0, 3, NOW(), NOW())
        `;
        
        await executeQuery(queueSql, [queueId, jobId, accountIds[i], priority]);
      }
      
      console.log(`✅ Added job ${jobId} to queue with ${accountIds.length} account assignments`);
      
    } catch (error) {
      console.error('❌ Error adding job to queue:', error);
      throw error;
    }
  }
  
  /**
   * Get next job from queue for processing
   */
  static async getNextJobFromQueue(workerId) {
    try {
      return await transaction(async (connection) => {
        // Find highest priority queued job
        const queueSql = `
          SELECT jq.*, j.job_name, j.job_type, j.user_id, la.email as account_email
          FROM job_queue jq
          JOIN jobs j ON jq.job_id = j.id
          JOIN linkedin_accounts la ON jq.linkedin_account_id = la.id
          WHERE jq.status = 'queued' 
            AND la.is_active = TRUE 
            AND la.validation_status = 'ACTIVE'
            AND (la.cooldown_until IS NULL OR la.cooldown_until < NOW())
            AND (la.blocked_until IS NULL OR la.blocked_until < NOW())
          ORDER BY jq.priority ASC, jq.created_at ASC
          LIMIT 1
          FOR UPDATE
        `;
        
        const [queueResults] = await connection.execute(queueSql);
        
        if (queueResults.length === 0) {
          return null; // No jobs available
        }
        
        const queueItem = queueResults[0];
        
        // Assign job to worker
        const updateSql = `
          UPDATE job_queue 
          SET status = 'assigned', worker_id = ?, assigned_at = NOW(), updated_at = NOW()
          WHERE id = ?
        `;
        
        await connection.execute(updateSql, [workerId, queueItem.id]);
        
        // Update job status to running
        const updateJobSql = `
          UPDATE jobs 
          SET status = 'running', started_at = NOW(), updated_at = NOW()
          WHERE id = ? AND status = 'pending'
        `;
        
        await connection.execute(updateJobSql, [queueItem.job_id]);
        
        console.log(`✅ Assigned job ${queueItem.job_id} to worker ${workerId}`);
        
        return queueItem;
      });
      
    } catch (error) {
      console.error('❌ Error getting next job from queue:', error);
      throw error;
    }
  }
  
  /**
   * Update job progress and handle completion
   */
  static async updateJobProgress(jobId, updates) {
    try {
      const { processedUrls, successfulUrls, failedUrls, status, errorMessage } = updates;
      
      return await transaction(async (connection) => {
        // Update job statistics
        let updateSql = `
          UPDATE jobs 
          SET processed_urls = ?, successful_urls = ?, failed_urls = ?, updated_at = NOW()
        `;
        let params = [processedUrls, successfulUrls, failedUrls];
        
        if (status) {
          updateSql += `, status = ?`;
          params.push(status);
          
          if (status === 'completed') {
            updateSql += `, completed_at = NOW()`;
          } else if (status === 'failed' && errorMessage) {
            updateSql += `, error_message = ?`;
            params.push(errorMessage);
          }
        }
        
        updateSql += ` WHERE id = ?`;
        params.push(jobId);
        
        await connection.execute(updateSql, params);
        
        // Update queue status if job is completed or failed
        if (status === 'completed' || status === 'failed') {
          const queueUpdateSql = `
            UPDATE job_queue 
            SET status = ?, completed_at = NOW(), updated_at = NOW()
            WHERE job_id = ?
          `;
          
          await connection.execute(queueUpdateSql, [status, jobId]);
        }
        
        console.log(`✅ Updated job ${jobId} progress: ${processedUrls}/${processedUrls + failedUrls} processed`);
      });
      
    } catch (error) {
      console.error('❌ Error updating job progress:', error);
      throw error;
    }
  }
  
  /**
   * Get default scrape fields for job type
   */
  static getDefaultScrapeFields(jobType) {
    const fieldMap = {
      'profile': ['name', 'title', 'company', 'location', 'summary', 'experience'],
      'company': ['name', 'industry', 'size', 'location', 'description', 'website'],
      'job_post': ['title', 'company', 'location', 'description', 'requirements', 'posted_date'],
      'search': ['name', 'title', 'company', 'location']
    };
    
    return fieldMap[jobType] || [];
  }
  
  /**
   * Validate URL format for job type
   */
  static validateUrl(url, jobType) {
    const patterns = {
      'profile': /^https:\/\/(www\.)?linkedin\.com\/in\/[^\/]+\/?$/,
      'company': /^https:\/\/(www\.)?linkedin\.com\/company\/[^\/]+\/?$/,
      'job_post': /^https:\/\/(www\.)?linkedin\.com\/jobs\/view\/\d+\/?$/,
      'search': /^https:\/\/(www\.)?linkedin\.com\/(search|jobs\/search)/
    };
    
    const pattern = patterns[jobType];
    return pattern ? pattern.test(url) : true; // Allow all URLs for unknown types
  }
  
  /**
   * Get jobs for a user with pagination
   */
  static async getUserJobs(userId, { page = 1, limit = 20, status = null } = {}) {
    try {
      const offset = (page - 1) * limit;
      
      let sql = `
        SELECT j.*, 
               COUNT(ju.id) as total_urls,
               COUNT(CASE WHEN ju.status = 'completed' THEN 1 END) as completed_urls,
               COUNT(CASE WHEN ju.status = 'failed' THEN 1 END) as failed_urls
        FROM jobs j
        LEFT JOIN job_urls ju ON j.id = ju.job_id
        WHERE j.user_id = ?
      `;
      
      const params = [userId];
      
      if (status) {
        sql += ` AND j.status = ?`;
        params.push(status);
      }
      
      sql += ` GROUP BY j.id ORDER BY j.created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);
      
      const results = await query(sql, params);
      
      return results.map(job => new Job(job));
      
    } catch (error) {
      console.error('❌ Error getting user jobs:', error);
      throw error;
    }
  }
}

module.exports = JobService;