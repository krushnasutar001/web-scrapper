/**
 * Scralytics Hub - Job Queue Service
 * Manages job queue processing with round-robin worker assignment
 */

const { query, transaction } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class JobQueueService extends EventEmitter {
  constructor() {
    super();
    this.workers = new Map(); // workerId -> { accountId, status, lastAssigned }
    this.isProcessing = false;
    this.processingInterval = null;
    this.roundRobinIndex = 0;
  }

  /**
   * Add job to queue
   */
  async addJobToQueue(jobId, userId, linkedinAccountId, priority = 0) {
    try {
      console.log(`📋 Adding job ${jobId} to queue for user ${userId}`);
      
      const queueId = uuidv4();
      await query(`
        INSERT INTO job_queue (
          id, job_id, user_id, linkedin_account_id, 
          status, priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'queued', ?, NOW(), NOW())
      `, [queueId, jobId, userId, linkedinAccountId, priority]);
      
      console.log(`✅ Job ${jobId} added to queue with priority ${priority}`);
      
      // Trigger queue processing
      this.processQueue();
      
      return queueId;
    } catch (error) {
      console.error(`❌ Error adding job ${jobId} to queue:`, error);
      throw error;
    }
  }

  /**
   * Get next job from queue
   */
  async getNextJobFromQueue() {
    try {
      const queuedJobs = await query(`
        SELECT jq.*, sj.job_name, sj.job_type, sj.total_urls
        FROM job_queue jq
        JOIN scraping_jobs sj ON jq.job_id = sj.id
        WHERE jq.status = 'queued'
        ORDER BY jq.priority DESC, jq.created_at ASC
        LIMIT 1
      `);
      
      return queuedJobs.length > 0 ? queuedJobs[0] : null;
    } catch (error) {
      console.error('❌ Error getting next job from queue:', error);
      throw error;
    }
  }

  /**
   * Get available LinkedIn accounts for round-robin assignment
   */
  async getAvailableAccounts(userId = null) {
    try {
      let sql = `
        SELECT la.id, la.user_id, la.account_name, la.email, 
               la.validation_status, la.requests_today, la.daily_request_limit,
               la.cooldown_until, la.blocked_until
        FROM linkedin_accounts la
        WHERE la.is_active = TRUE 
          AND la.validation_status = 'ACTIVE'
          AND (la.blocked_until IS NULL OR la.blocked_until < NOW())
          AND (la.cooldown_until IS NULL OR la.cooldown_until < NOW())
          AND la.requests_today < la.daily_request_limit
      `;
      
      const params = [];
      if (userId) {
        sql += ' AND la.user_id = ?';
        params.push(userId);
      }
      
      sql += ' ORDER BY la.requests_today ASC, la.last_request_at ASC';
      
      const accounts = await query(sql, params);
      
      console.log(`🔍 Found ${accounts.length} available LinkedIn accounts${userId ? ` for user ${userId}` : ''}`);
      
      return accounts;
    } catch (error) {
      console.error('❌ Error getting available accounts:', error);
      throw error;
    }
  }

  /**
   * Assign job to worker using round-robin algorithm
   */
  async assignJobToWorker(queueItem) {
    try {
      console.log(`🎯 Assigning job ${queueItem.job_id} to worker...`);
      
      // Get available accounts for this user
      const availableAccounts = await this.getAvailableAccounts(queueItem.user_id);
      
      if (availableAccounts.length === 0) {
        console.log(`⚠️  No available accounts for user ${queueItem.user_id}, job ${queueItem.job_id} remains queued`);
        return null;
      }
      
      // Round-robin selection
      const selectedAccount = availableAccounts[this.roundRobinIndex % availableAccounts.length];
      this.roundRobinIndex = (this.roundRobinIndex + 1) % availableAccounts.length;
      
      const workerId = `worker_${selectedAccount.id}_${Date.now()}`;
      
      // Update queue item status
      await query(`
        UPDATE job_queue 
        SET status = 'assigned', worker_id = ?, assigned_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, [workerId, queueItem.id]);
      
      // Update job status
      await query(`
        UPDATE scraping_jobs 
        SET status = 'running', started_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, [queueItem.job_id]);
      
      console.log(`✅ Job ${queueItem.job_id} assigned to worker ${workerId} using account ${selectedAccount.email}`);
      
      // Register worker
      this.workers.set(workerId, {
        accountId: selectedAccount.id,
        jobId: queueItem.job_id,
        userId: queueItem.user_id,
        status: 'assigned',
        assignedAt: new Date(),
        account: selectedAccount
      });
      
      // Emit assignment event
      this.emit('jobAssigned', {
        workerId,
        jobId: queueItem.job_id,
        userId: queueItem.user_id,
        account: selectedAccount
      });
      
      return {
        workerId,
        account: selectedAccount,
        queueItem
      };
      
    } catch (error) {
      console.error(`❌ Error assigning job ${queueItem.job_id}:`, error);
      throw error;
    }
  }

  /**
   * Process job queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      console.log('🔄 Processing job queue...');
      
      // Get queued jobs ordered by priority and creation time
      const queuedJobs = await query(`
        SELECT jq.*, sj.job_name, sj.job_type, sj.total_urls
        FROM job_queue jq
        JOIN scraping_jobs sj ON jq.job_id = sj.id
        WHERE jq.status = 'queued'
        ORDER BY jq.priority DESC, jq.created_at ASC
        LIMIT 10
      `);
      
      console.log(`📋 Found ${queuedJobs.length} jobs in queue`);
      
      for (const queueItem of queuedJobs) {
        try {
          const assignment = await this.assignJobToWorker(queueItem);
          
          if (assignment) {
            // Start job processing
            await this.startJobProcessing(assignment);
          }
          
        } catch (error) {
          console.error(`❌ Error processing queue item ${queueItem.id}:`, error);
          
          // Mark as failed if too many retries
          if (queueItem.retry_count >= queueItem.max_retries) {
            await this.markJobAsFailed(queueItem.job_id, `Max retries exceeded: ${error.message}`);
          } else {
            await this.retryQueueItem(queueItem.id, error.message);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error processing job queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start job processing
   */
  async startJobProcessing(assignment) {
    try {
      const { workerId, account, queueItem } = assignment;
      
      console.log(`🚀 Starting job processing for ${queueItem.job_id} with worker ${workerId}`);
      
      // Update worker status
      const worker = this.workers.get(workerId);
      if (worker) {
        worker.status = 'processing';
        worker.startedAt = new Date();
      }
      
      // Update queue status
      await query(`
        UPDATE job_queue 
        SET status = 'processing', started_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, [queueItem.id]);
      
      // Emit processing event
      this.emit('jobStarted', {
        workerId,
        jobId: queueItem.job_id,
        userId: queueItem.user_id,
        account
      });
      
      // Here you would integrate with your scraping service
      // For now, we'll simulate processing
      console.log(`⚡ Job ${queueItem.job_id} is now being processed by worker ${workerId}`);
      
    } catch (error) {
      console.error(`❌ Error starting job processing:`, error);
      throw error;
    }
  }

  /**
   * Complete job processing
   */
  async completeJob(workerId, jobId, results = {}) {
    try {
      console.log(`✅ Completing job ${jobId} for worker ${workerId}`);
      
      const worker = this.workers.get(workerId);
      if (!worker) {
        throw new Error(`Worker ${workerId} not found`);
      }
      
      // Update job status
      await query(`
        UPDATE scraping_jobs 
        SET status = 'completed', completed_at = NOW(), 
            successful_urls = ?, result_count = ?, updated_at = NOW()
        WHERE id = ?
      `, [results.successful || 0, results.total || 0, jobId]);
      
      // Update queue status
      await query(`
        UPDATE job_queue 
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE job_id = ? AND worker_id = ?
      `, [jobId, workerId]);
      
      // Update account request count
      await query(`
        UPDATE linkedin_accounts 
        SET requests_today = requests_today + ?, last_request_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, [results.requests || 1, worker.accountId]);
      
      // Remove worker
      this.workers.delete(workerId);
      
      console.log(`🎉 Job ${jobId} completed successfully`);
      
      // Emit completion event
      this.emit('jobCompleted', {
        workerId,
        jobId,
        userId: worker.userId,
        results
      });
      
    } catch (error) {
      console.error(`❌ Error completing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Mark job as failed
   */
  async markJobAsFailed(jobId, errorMessage) {
    try {
      console.log(`❌ Marking job ${jobId} as failed: ${errorMessage}`);
      
      await query(`
        UPDATE scraping_jobs 
        SET status = 'failed', error_message = ?, completed_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, [errorMessage, jobId]);
      
      await query(`
        UPDATE job_queue 
        SET status = 'failed', error_message = ?, completed_at = NOW(), updated_at = NOW()
        WHERE job_id = ?
      `, [errorMessage, jobId]);
      
      // Emit failure event
      this.emit('jobFailed', {
        jobId,
        errorMessage
      });
      
    } catch (error) {
      console.error(`❌ Error marking job ${jobId} as failed:`, error);
      throw error;
    }
  }

  /**
   * Retry queue item
   */
  async retryQueueItem(queueId, errorMessage) {
    try {
      await query(`
        UPDATE job_queue 
        SET retry_count = retry_count + 1, error_message = ?, 
            status = 'queued', updated_at = NOW()
        WHERE id = ?
      `, [errorMessage, queueId]);
      
      console.log(`🔄 Queue item ${queueId} will be retried`);
      
    } catch (error) {
      console.error(`❌ Error retrying queue item ${queueId}:`, error);
      throw error;
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus() {
    try {
      const status = await query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM job_queue 
        GROUP BY status
      `);
      
      const workerCount = this.workers.size;
      
      return {
        queue: status.reduce((acc, item) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
        activeWorkers: workerCount,
        workers: Array.from(this.workers.entries()).map(([id, worker]) => ({
          id,
          jobId: worker.jobId,
          userId: worker.userId,
          status: worker.status,
          account: worker.account.email
        }))
      };
      
    } catch (error) {
      console.error('❌ Error getting queue status:', error);
      throw error;
    }
  }

  /**
   * Start queue processing interval
   */
  startQueueProcessor(intervalMs = 30000) {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    console.log(`🔄 Starting queue processor with ${intervalMs}ms interval`);
    
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(console.error);
    }, intervalMs);
    
    // Process immediately
    this.processQueue().catch(console.error);
  }

  /**
   * Stop queue processing
   */
  stopQueueProcessor() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('⏹️  Queue processor stopped');
    }
  }
}

module.exports = JobQueueService;