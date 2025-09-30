const { Queue } = require('bullmq');
const Redis = require('ioredis');
const config = require('../config');

/**
 * Redis connection for BullMQ
 */
const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  family: 4, // Force IPv4
});

/**
 * Job queue configuration
 */
const jobQueue = new Queue('scraping-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,           // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,         // Start with 2 second delay
    },
    delay: 0,              // No initial delay
  },
});

/**
 * Priority mapping
 */
const PRIORITY_MAP = {
  'low': 1,
  'normal': 5,
  'high': 10,
  'urgent': 20
};

/**
 * Job type configurations
 */
const JOB_TYPE_CONFIG = {
  'profile_scraping': {
    timeout: 300000,      // 5 minutes per profile
    concurrency: 3,       // Max 3 concurrent profile jobs
    priority: 'normal'
  },
  'company_scraping': {
    timeout: 600000,      // 10 minutes per company
    concurrency: 2,       // Max 2 concurrent company jobs
    priority: 'normal'
  },
  'search_result_scraping': {
    timeout: 900000,      // 15 minutes per search
    concurrency: 1,       // Max 1 concurrent search job
    priority: 'high'
  }
};

/**
 * Enqueue a job for processing
 * @param {Object} jobData - Job data to enqueue
 * @param {string} jobData.jobId - Unique job identifier
 * @param {string} jobData.userId - User ID who created the job
 * @param {string} jobData.jobType - Type of scraping job
 * @param {string} [jobData.priority='normal'] - Job priority (low, normal, high, urgent)
 * @param {number} [jobData.delay=0] - Delay before processing (milliseconds)
 * @param {Object} [jobData.options={}] - Additional job options
 * @returns {Promise<Object>} - BullMQ job object
 */
const enqueueJob = async (jobData) => {
  try {
    const {
      jobId,
      userId,
      jobType,
      priority = 'normal',
      delay = 0,
      options = {}
    } = jobData;

    // Validate required fields
    if (!jobId || !userId || !jobType) {
      throw new Error('Missing required job data: jobId, userId, and jobType are required');
    }

    // Validate job type
    if (!JOB_TYPE_CONFIG[jobType]) {
      throw new Error(`Invalid job type: ${jobType}. Valid types: ${Object.keys(JOB_TYPE_CONFIG).join(', ')}`);
    }

    // Get job type configuration
    const typeConfig = JOB_TYPE_CONFIG[jobType];
    
    // Prepare job options
    const jobOptions = {
      priority: PRIORITY_MAP[priority] || PRIORITY_MAP['normal'],
      delay: Math.max(0, delay),
      attempts: options.attempts || 3,
      backoff: options.backoff || {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: options.removeOnComplete || 100,
      removeOnFail: options.removeOnFail || 50,
      jobId: `job-${jobId}`, // Ensure unique job ID in queue
    };

    // Add timeout based on job type
    if (typeConfig.timeout) {
      jobOptions.timeout = typeConfig.timeout;
    }

    // Prepare job payload
    const jobPayload = {
      jobId,
      userId,
      jobType,
      priority,
      enqueuedAt: new Date().toISOString(),
      timeout: typeConfig.timeout,
      concurrency: typeConfig.concurrency,
      ...options
    };

    console.log(`📤 Enqueuing job ${jobId} (type: ${jobType}, priority: ${priority})`);

    // Add job to queue
    const job = await jobQueue.add(
      `${jobType}-job`,
      jobPayload,
      jobOptions
    );

    console.log(`✅ Job ${jobId} enqueued successfully with ID ${job.id}`);

    return {
      success: true,
      jobId: job.id,
      queueJobId: job.id,
      priority: jobOptions.priority,
      delay: jobOptions.delay,
      attempts: jobOptions.attempts,
      enqueuedAt: jobPayload.enqueuedAt
    };

  } catch (error) {
    console.error(`❌ Failed to enqueue job ${jobData?.jobId}:`, error);
    
    throw new Error(`Job enqueue failed: ${error.message}`);
  }
};

/**
 * Get job status from queue
 * @param {string} jobId - Job ID to check
 * @returns {Promise<Object>} - Job status information
 */
const getJobStatus = async (jobId) => {
  try {
    const queueJobId = `job-${jobId}`;
    const job = await jobQueue.getJob(queueJobId);
    
    if (!job) {
      return {
        found: false,
        status: 'not_found'
      };
    }

    const state = await job.getState();
    const progress = job.progress;
    
    return {
      found: true,
      id: job.id,
      status: state,
      progress: progress,
      data: job.data,
      opts: job.opts,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
      attemptsMade: job.attemptsMade,
      delay: job.delay,
      timestamp: job.timestamp
    };

  } catch (error) {
    console.error(`❌ Failed to get job status for ${jobId}:`, error);
    throw new Error(`Failed to get job status: ${error.message}`);
  }
};

/**
 * Cancel a job in the queue
 * @param {string} jobId - Job ID to cancel
 * @returns {Promise<boolean>} - Success status
 */
const cancelJob = async (jobId) => {
  try {
    const queueJobId = `job-${jobId}`;
    const job = await jobQueue.getJob(queueJobId);
    
    if (!job) {
      console.log(`⚠️ Job ${jobId} not found in queue`);
      return false;
    }

    const state = await job.getState();
    
    if (state === 'completed' || state === 'failed') {
      console.log(`⚠️ Job ${jobId} already ${state}, cannot cancel`);
      return false;
    }

    await job.remove();
    console.log(`✅ Job ${jobId} cancelled successfully`);
    
    return true;

  } catch (error) {
    console.error(`❌ Failed to cancel job ${jobId}:`, error);
    throw new Error(`Failed to cancel job: ${error.message}`);
  }
};

/**
 * Get queue statistics
 * @returns {Promise<Object>} - Queue statistics
 */
const getQueueStats = async () => {
  try {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused
    ] = await Promise.all([
      jobQueue.getWaiting(),
      jobQueue.getActive(),
      jobQueue.getCompleted(),
      jobQueue.getFailed(),
      jobQueue.getDelayed(),
      jobQueue.getPaused()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: paused.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length + paused.length
    };

  } catch (error) {
    console.error('❌ Failed to get queue stats:', error);
    throw new Error(`Failed to get queue stats: ${error.message}`);
  }
};

/**
 * Clean old jobs from queue
 * @param {Object} options - Cleanup options
 * @param {number} [options.grace=24*60*60*1000] - Grace period in milliseconds (default: 24 hours)
 * @param {number} [options.limit=100] - Maximum number of jobs to clean
 * @returns {Promise<Object>} - Cleanup results
 */
const cleanQueue = async (options = {}) => {
  try {
    const {
      grace = 24 * 60 * 60 * 1000, // 24 hours
      limit = 100
    } = options;

    console.log(`🧹 Cleaning queue (grace: ${grace}ms, limit: ${limit})`);

    const [completedCleaned, failedCleaned] = await Promise.all([
      jobQueue.clean(grace, limit, 'completed'),
      jobQueue.clean(grace, limit, 'failed')
    ]);

    const totalCleaned = completedCleaned.length + failedCleaned.length;
    
    console.log(`✅ Cleaned ${totalCleaned} jobs (${completedCleaned.length} completed, ${failedCleaned.length} failed)`);

    return {
      success: true,
      totalCleaned,
      completedCleaned: completedCleaned.length,
      failedCleaned: failedCleaned.length
    };

  } catch (error) {
    console.error('❌ Failed to clean queue:', error);
    throw new Error(`Failed to clean queue: ${error.message}`);
  }
};

/**
 * Pause the queue
 * @returns {Promise<boolean>} - Success status
 */
const pauseQueue = async () => {
  try {
    await jobQueue.pause();
    console.log('⏸️ Queue paused');
    return true;
  } catch (error) {
    console.error('❌ Failed to pause queue:', error);
    throw new Error(`Failed to pause queue: ${error.message}`);
  }
};

/**
 * Resume the queue
 * @returns {Promise<boolean>} - Success status
 */
const resumeQueue = async () => {
  try {
    await jobQueue.resume();
    console.log('▶️ Queue resumed');
    return true;
  } catch (error) {
    console.error('❌ Failed to resume queue:', error);
    throw new Error(`Failed to resume queue: ${error.message}`);
  }
};

/**
 * Check if queue is paused
 * @returns {Promise<boolean>} - Paused status
 */
const isQueuePaused = async () => {
  try {
    return await jobQueue.isPaused();
  } catch (error) {
    console.error('❌ Failed to check queue pause status:', error);
    return false;
  }
};

/**
 * Get queue health status
 * @returns {Promise<Object>} - Health status
 */
const getQueueHealth = async () => {
  try {
    const stats = await getQueueStats();
    const isPaused = await isQueuePaused();
    
    // Check Redis connection
    const redisStatus = redisConnection.status;
    
    return {
      healthy: redisStatus === 'ready' && !isPaused,
      redis: {
        status: redisStatus,
        connected: redisStatus === 'ready'
      },
      queue: {
        paused: isPaused,
        stats
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Failed to get queue health:', error);
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Initialize producer and setup event listeners
 */
const initializeProducer = async () => {
  try {
    console.log('🚀 Initializing job producer...');
    
    // Test Redis connection
    await redisConnection.ping();
    console.log('✅ Redis connection established');
    
    // Setup queue event listeners
    jobQueue.on('error', (error) => {
      console.error('❌ Queue error:', error);
    });
    
    jobQueue.on('waiting', (job) => {
      console.log(`⏳ Job ${job.id} is waiting`);
    });
    
    jobQueue.on('active', (job) => {
      console.log(`🔄 Job ${job.id} started processing`);
    });
    
    jobQueue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed:`, result);
    });
    
    jobQueue.on('failed', (job, error) => {
      console.error(`❌ Job ${job.id} failed:`, error);
    });
    
    jobQueue.on('stalled', (job) => {
      console.warn(`⚠️ Job ${job.id} stalled`);
    });
    
    console.log('✅ Job producer initialized successfully');
    
    return true;

  } catch (error) {
    console.error('❌ Failed to initialize producer:', error);
    throw error;
  }
};

/**
 * Gracefully close producer connections
 */
const closeProducer = async () => {
  try {
    console.log('🔄 Closing job producer...');
    
    await jobQueue.close();
    await redisConnection.quit();
    
    console.log('✅ Job producer closed successfully');
    
  } catch (error) {
    console.error('❌ Error closing producer:', error);
    throw error;
  }
};

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('📡 SIGTERM received, closing producer...');
  await closeProducer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📡 SIGINT received, closing producer...');
  await closeProducer();
  process.exit(0);
});

module.exports = {
  enqueueJob,
  getJobStatus,
  cancelJob,
  getQueueStats,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  isQueuePaused,
  getQueueHealth,
  initializeProducer,
  closeProducer,
  jobQueue,
  redisConnection,
  PRIORITY_MAP,
  JOB_TYPE_CONFIG
};