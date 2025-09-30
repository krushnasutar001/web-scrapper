const request = require('supertest');
const { Pool } = require('pg');
const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs').promises;

// Test configuration
const TEST_CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/linkedin_automation_test',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000'
};

describe('Job Queue Integration Tests', () => {
  let app;
  let pool;
  let redis;
  let queue;
  let worker;
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Wait for services to be ready
    await waitForServices();

    // Initialize database connection
    pool = new Pool({ connectionString: TEST_CONFIG.DATABASE_URL });

    // Initialize Redis connection
    redis = new Redis(TEST_CONFIG.REDIS_URL);

    // Initialize BullMQ queue
    queue = new Queue('scraping', { connection: redis });

    // Setup test database
    await setupTestDatabase();

    // Create test user
    testUser = await createTestUser();

    // Generate auth token
    authToken = jwt.sign(
      { user_id: testUser.id, email: testUser.email },
      TEST_CONFIG.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Import app after environment is set up
    app = require('../../src/app');
  });

  afterAll(async () => {
    // Cleanup
    if (worker) await worker.close();
    if (queue) await queue.close();
    if (redis) await redis.disconnect();
    if (pool) await pool.end();
  });

  beforeEach(async () => {
    // Clean up jobs between tests
    await queue.obliterate({ force: true });
    
    // Reset user credits
    await pool.query(
      'UPDATE users SET credits_balance = 1000, credits_used = 0 WHERE id = $1',
      [testUser.id]
    );
  });

  describe('End-to-End Job Processing', () => {
    test('should create and process a profile scraping job successfully', async () => {
      const jobData = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/test-profile'],
          max_results: 1
        }
      };

      // Create job via API
      const createResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.job_id).toBeDefined();
      expect(createResponse.body.job_token).toBeDefined();

      const jobId = createResponse.body.job_id;
      const jobToken = createResponse.body.job_token;

      // Verify job was created in database
      const jobResult = await pool.query(
        'SELECT * FROM jobs WHERE id = $1',
        [jobId]
      );

      expect(jobResult.rows).toHaveLength(1);
      expect(jobResult.rows[0].status).toBe('pending');
      expect(jobResult.rows[0].user_id).toBe(testUser.id);

      // Verify credits were deducted
      const userResult = await pool.query(
        'SELECT credits_balance, credits_used FROM users WHERE id = $1',
        [testUser.id]
      );

      expect(userResult.rows[0].credits_balance).toBe(999); // 1000 - 1
      expect(userResult.rows[0].credits_used).toBe(1);

      // Verify job was added to queue
      const queueJobs = await queue.getJobs(['waiting', 'active']);
      expect(queueJobs).toHaveLength(1);
      expect(queueJobs[0].data.job_id).toBe(jobId);

      // Start worker to process the job
      worker = new Worker('scraping', async (job) => {
        // Mock job processing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Update job status
        await pool.query(
          'UPDATE jobs SET status = $1, progress = $2 WHERE id = $3',
          ['completed', 100, job.data.job_id]
        );

        // Add mock results
        await pool.query(
          'INSERT INTO job_results (id, job_id, data) VALUES ($1, $2, $3)',
          [
            `result-${Date.now()}`,
            job.data.job_id,
            JSON.stringify({
              name: 'John Doe',
              headline: 'Software Engineer',
              location: 'San Francisco, CA'
            })
          ]
        );

        return { success: true, results_count: 1 };
      }, { connection: redis });

      // Wait for job to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify job completion
      const completedJobResult = await pool.query(
        'SELECT * FROM jobs WHERE id = $1',
        [jobId]
      );

      expect(completedJobResult.rows[0].status).toBe('completed');
      expect(completedJobResult.rows[0].progress).toBe(100);

      // Verify results were saved
      const resultsResult = await pool.query(
        'SELECT * FROM job_results WHERE job_id = $1',
        [jobId]
      );

      expect(resultsResult.rows).toHaveLength(1);
      expect(resultsResult.rows[0].data.name).toBe('John Doe');

      // Test results API
      const resultsResponse = await request(app)
        .get(`/api/results/${jobId}`)
        .set('Authorization', `Bearer ${jobToken}`);

      expect(resultsResponse.status).toBe(200);
      expect(resultsResponse.body.results).toHaveLength(1);
      expect(resultsResponse.body.results[0].data.name).toBe('John Doe');
    }, 30000);

    test('should handle insufficient credits', async () => {
      // Set user credits to 0
      await pool.query(
        'UPDATE users SET credits_balance = 0 WHERE id = $1',
        [testUser.id]
      );

      const jobData = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/test-profile'],
          max_results: 1
        }
      };

      const response = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Insufficient credits');

      // Verify no job was created
      const jobsResult = await pool.query(
        'SELECT * FROM jobs WHERE user_id = $1',
        [testUser.id]
      );

      expect(jobsResult.rows).toHaveLength(0);
    });

    test('should handle concurrent job limits', async () => {
      // Set user's max concurrent jobs to 1
      await pool.query(
        'UPDATE users SET max_concurrent_jobs = 1 WHERE id = $1',
        [testUser.id]
      );

      // Create first job
      const jobData1 = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/profile-1'],
          max_results: 1
        }
      };

      const response1 = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData1);

      expect(response1.status).toBe(201);

      // Try to create second job (should fail)
      const jobData2 = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/profile-2'],
          max_results: 1
        }
      };

      const response2 = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData2);

      expect(response2.status).toBe(400);
      expect(response2.body.error).toContain('concurrent job limit');
    });

    test('should handle bulk job creation with file upload', async () => {
      const csvData = 'url\nhttps://linkedin.com/in/profile-1\nhttps://linkedin.com/in/profile-2';
      const testFilePath = path.join(__dirname, '../temp/test-urls.csv');

      // Ensure temp directory exists
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, csvData);

      const response = await request(app)
        .post('/api/jobs/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('job_type', 'profile_scraping')
        .field('max_results', '2')
        .attach('file', testFilePath);

      expect(response.status).toBe(201);
      expect(response.body.job_id).toBeDefined();

      // Verify job URLs were created
      const urlsResult = await pool.query(
        'SELECT * FROM job_urls WHERE job_id = $1',
        [response.body.job_id]
      );

      expect(urlsResult.rows).toHaveLength(2);
      expect(urlsResult.rows[0].url).toBe('https://linkedin.com/in/profile-1');
      expect(urlsResult.rows[1].url).toBe('https://linkedin.com/in/profile-2');

      // Cleanup
      await fs.unlink(testFilePath);
    });
  });

  describe('Job Status and Progress Tracking', () => {
    test('should track job progress correctly', async () => {
      const jobData = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/test-profile'],
          max_results: 1
        }
      };

      const createResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData);

      const jobId = createResponse.body.job_id;
      const jobToken = createResponse.body.job_token;

      // Update progress via results API
      const progressResponse = await request(app)
        .post('/api/results/progress')
        .set('Authorization', `Bearer ${jobToken}`)
        .send({
          progress: 50,
          message: 'Processing 1 of 2 profiles',
          processed_count: 1,
          total_count: 2
        });

      expect(progressResponse.status).toBe(200);

      // Verify progress was updated
      const jobResult = await pool.query(
        'SELECT progress, status_message FROM jobs WHERE id = $1',
        [jobId]
      );

      expect(jobResult.rows[0].progress).toBe(50);
      expect(jobResult.rows[0].status_message).toBe('Processing 1 of 2 profiles');
    });

    test('should handle job errors correctly', async () => {
      const jobData = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/test-profile'],
          max_results: 1
        }
      };

      const createResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData);

      const jobToken = createResponse.body.job_token;

      // Report error via results API
      const errorResponse = await request(app)
        .post('/api/results/error')
        .set('Authorization', `Bearer ${jobToken}`)
        .send({
          error: 'LinkedIn account suspended',
          error_type: 'account_suspended',
          recoverable: false
        });

      expect(errorResponse.status).toBe(200);

      // Verify job was marked as failed
      const jobResult = await pool.query(
        'SELECT status, error_message FROM jobs WHERE id = $1',
        [createResponse.body.job_id]
      );

      expect(jobResult.rows[0].status).toBe('failed');
      expect(jobResult.rows[0].error_message).toContain('LinkedIn account suspended');
    });
  });

  describe('File Upload and Results Management', () => {
    test('should handle result file uploads', async () => {
      const jobData = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/test-profile'],
          max_results: 1
        }
      };

      const createResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData);

      const jobToken = createResponse.body.job_token;

      // Create test result file
      const resultData = [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' }
      ];

      const testFilePath = path.join(__dirname, '../temp/results.json');
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, JSON.stringify(resultData));

      // Upload result file
      const uploadResponse = await request(app)
        .post('/api/results/upload')
        .set('Authorization', `Bearer ${jobToken}`)
        .attach('files', testFilePath);

      expect(uploadResponse.status).toBe(200);
      expect(uploadResponse.body.files).toHaveLength(1);

      // Verify file record was created
      const filesResult = await pool.query(
        'SELECT * FROM job_result_files WHERE job_id = $1',
        [createResponse.body.job_id]
      );

      expect(filesResult.rows).toHaveLength(1);
      expect(filesResult.rows[0].original_name).toBe('results.json');

      // Test file retrieval
      const filesResponse = await request(app)
        .get(`/api/results/${createResponse.body.job_id}/files`)
        .set('Authorization', `Bearer ${jobToken}`);

      expect(filesResponse.status).toBe(200);
      expect(filesResponse.body.files).toHaveLength(1);

      // Cleanup
      await fs.unlink(testFilePath);
    });
  });

  describe('Queue Management and Monitoring', () => {
    test('should provide queue statistics', async () => {
      // Create multiple jobs
      const jobs = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            job_type: 'profile_scraping',
            config: {
              urls: [`https://linkedin.com/in/profile-${i}`],
              max_results: 1
            }
          });
        jobs.push(response.body.job_id);
      }

      // Get queue stats
      const statsResponse = await request(app)
        .get('/api/jobs/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.total_jobs).toBeGreaterThanOrEqual(3);
      expect(statsResponse.body.pending_jobs).toBeGreaterThanOrEqual(3);
    });

    test('should handle job cancellation', async () => {
      const jobData = {
        job_type: 'profile_scraping',
        config: {
          urls: ['https://linkedin.com/in/test-profile'],
          max_results: 1
        }
      };

      const createResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData);

      const jobId = createResponse.body.job_id;

      // Cancel job
      const cancelResponse = await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(cancelResponse.status).toBe(200);

      // Verify job was cancelled
      const jobResult = await pool.query(
        'SELECT status FROM jobs WHERE id = $1',
        [jobId]
      );

      expect(jobResult.rows[0].status).toBe('cancelled');

      // Verify job was removed from queue
      const queueJobs = await queue.getJobs(['waiting', 'active']);
      const jobInQueue = queueJobs.find(job => job.data.job_id === jobId);
      expect(jobInQueue).toBeUndefined();
    });
  });

  // Helper functions
  async function waitForServices() {
    const maxRetries = 30;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Test database connection
        const testPool = new Pool({ connectionString: TEST_CONFIG.DATABASE_URL });
        await testPool.query('SELECT 1');
        await testPool.end();

        // Test Redis connection
        const testRedis = new Redis(TEST_CONFIG.REDIS_URL);
        await testRedis.ping();
        await testRedis.disconnect();

        console.log('✅ All services are ready');
        return;
      } catch (error) {
        retries++;
        console.log(`⏳ Waiting for services... (${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('Services failed to start within timeout');
  }

  async function setupTestDatabase() {
    // Run migrations if needed
    try {
      const migrationFiles = [
        '001_create_job_queue_tables.sql',
        '002_enhance_users_table.sql',
        '003_enhance_linkedin_accounts_table.sql'
      ];

      for (const file of migrationFiles) {
        const migrationPath = path.join(__dirname, '../../database/migrations', file);
        try {
          const migration = await fs.readFile(migrationPath, 'utf8');
          await pool.query(migration);
          console.log(`✅ Applied migration: ${file}`);
        } catch (error) {
          if (!error.message.includes('already exists')) {
            console.log(`⚠️ Migration ${file} failed:`, error.message);
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Migration setup failed:', error.message);
    }
  }

  async function createTestUser() {
    const userResult = await pool.query(`
      INSERT INTO users (
        id, email, password_hash, first_name, last_name, 
        credits_balance, credits_used, status, email_verified,
        max_concurrent_jobs, max_monthly_jobs
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) 
      ON CONFLICT (email) DO UPDATE SET
        credits_balance = EXCLUDED.credits_balance,
        credits_used = EXCLUDED.credits_used
      RETURNING *
    `, [
      'test-user-' + Date.now(),
      'test@example.com',
      'hashed-password',
      'Test',
      'User',
      1000, // credits_balance
      0,    // credits_used
      'active',
      true,
      5,    // max_concurrent_jobs
      1000  // max_monthly_jobs
    ]);

    return userResult.rows[0];
  }
});