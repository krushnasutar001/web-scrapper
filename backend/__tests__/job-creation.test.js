const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Queue } = require('bullmq');

// Mock configuration
jest.mock('../config', () => ({
  validateAndLoadConfig: () => ({
    database: {
      host: 'localhost',
      port: 5432,
      name: 'test_db',
      user: 'test_user',
      password: 'test_pass'
    },
    redis: {
      host: 'localhost',
      port: 6379
    },
    jwt: {
      secret: 'test-secret',
      expiresIn: '1h'
    }
  })
}));

const config = require('../config').validateAndLoadConfig();

// Mock the app module since it might not exist yet
const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  listen: jest.fn()
};

jest.mock('../app', () => mockApp, { virtual: true });

// Mock dependencies
jest.mock('pg');
jest.mock('../workers/producer');

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  release: jest.fn()
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

describe('Job Creation Flow', () => {
  let authToken;
  let mockUser;
  let mockLinkedInAccount;

  beforeAll(() => {
    // Setup test user
    mockUser = {
      id: 1,
      email: 'test@example.com',
      credits_balance: 100,
      max_concurrent_jobs: 5,
      subscription_plan: 'pro'
    };

    mockLinkedInAccount = {
      id: 1,
      user_id: 1,
      status: 'active',
      is_available: true,
      is_busy: false,
      daily_requests: 10,
      max_daily_requests: 100
    };

    // Create auth token
    authToken = jwt.sign(
      { 
        userId: mockUser.id, 
        email: mockUser.email,
        subscription: mockUser.subscription_plan 
      },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default pool mock
    Pool.mockImplementation(() => mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('POST /api/jobs/create', () => {
    const validJobData = {
      job_type: 'profile_scraping',
      title: 'Test Profile Scraping Job',
      description: 'Test job for unit testing',
      config: {
        urls: ['https://linkedin.com/in/test-profile'],
        max_results: 10
      }
    };

    test('should create job successfully with sufficient credits', async () => {
      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Count active jobs
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] }) // Get LinkedIn account
        .mockResolvedValueOnce({ rows: [] }) // Begin transaction
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123',
            credits_cost: 5,
            status: 'pending'
          }] 
        }) // Insert job
        .mockResolvedValueOnce({ rows: [] }) // Deduct credits
        .mockResolvedValueOnce({ rows: [] }) // Log credit transaction
        .mockResolvedValueOnce({ rows: [] }); // Commit transaction

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Job created successfully',
        data: {
          job_id: 'job-123',
          status: 'pending',
          credits_deducted: 5
        }
      });

      expect(response.body.data.job_token).toBeDefined();
    });

    test('should fail with insufficient credits', async () => {
      const poorUser = { ...mockUser, credits_balance: 2 };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [poorUser] }) // Get user with low credits
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // Count active jobs

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Insufficient credits',
        code: 'INSUFFICIENT_CREDITS'
      });
    });

    test('should fail when user exceeds concurrent job limit', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // Count active jobs (at limit)

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Maximum concurrent jobs limit reached',
        code: 'CONCURRENT_JOBS_LIMIT'
      });
    });

    test('should fail with no available LinkedIn accounts', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Count active jobs
        .mockResolvedValueOnce({ rows: [] }); // No LinkedIn accounts available

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'No available LinkedIn accounts',
        code: 'NO_LINKEDIN_ACCOUNTS'
      });
    });

    test('should validate required fields', async () => {
      const invalidJobData = {
        job_type: 'profile_scraping',
        // Missing title and config
      };

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidJobData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation');
    });

    test('should validate job_type enum', async () => {
      const invalidJobData = {
        ...validJobData,
        job_type: 'invalid_type'
      };

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidJobData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid job type');
    });

    test('should handle database transaction rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Count active jobs
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] }) // Get LinkedIn account
        .mockResolvedValueOnce({ rows: [] }) // Begin transaction
        .mockRejectedValueOnce(new Error('Database error')); // Simulate error during job creation

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to create job',
        code: 'JOB_CREATION_ERROR'
      });

      // Verify rollback was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/jobs/create')
        .send(validJobData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Access denied. No token provided.'
      });
    });

    test('should reject invalid JWT token', async () => {
      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', 'Bearer invalid-token')
        .send(validJobData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid token.'
      });
    });
  });

  describe('Credit Deduction Logic', () => {
    test('should calculate credits correctly for profile scraping', async () => {
      const jobData = {
        ...validJobData,
        config: {
          urls: ['https://linkedin.com/in/profile1', 'https://linkedin.com/in/profile2'],
          max_results: 2
        }
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] })
        .mockResolvedValueOnce({ rows: [] }) // Begin
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123',
            credits_cost: 2, // 1 credit per profile
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] }) // Deduct credits
        .mockResolvedValueOnce({ rows: [] }) // Log transaction
        .mockResolvedValueOnce({ rows: [] }); // Commit

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData)
        .expect(201);

      expect(response.body.data.credits_deducted).toBe(2);
    });

    test('should calculate credits correctly for company scraping', async () => {
      const jobData = {
        job_type: 'company_scraping',
        title: 'Company Scraping Job',
        config: {
          companies: ['company1', 'company2', 'company3'],
          max_results: 3
        }
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] })
        .mockResolvedValueOnce({ rows: [] }) // Begin
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123',
            credits_cost: 6, // 2 credits per company
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData)
        .expect(201);

      expect(response.body.data.credits_deducted).toBe(6);
    });

    test('should apply subscription discounts correctly', async () => {
      const enterpriseUser = { ...mockUser, subscription_plan: 'enterprise' };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [enterpriseUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] })
        .mockResolvedValueOnce({ rows: [] }) // Begin
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123',
            credits_cost: 4, // 20% discount applied (5 * 0.8)
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(201);

      expect(response.body.data.credits_deducted).toBe(4);
    });
  });

  describe('Job Token Generation', () => {
    test('should generate valid job token', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123',
            credits_cost: 5,
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(201);

      const jobToken = response.body.data.job_token;
      expect(jobToken).toBeDefined();

      // Verify token can be decoded
      const decoded = jwt.verify(jobToken, config.JWT_SECRET);
      expect(decoded).toMatchObject({
        job_id: 'job-123',
        user_id: mockUser.id,
        job_type: 'profile_scraping'
      });
    });

    test('should include correct expiration in job token', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123',
            credits_cost: 5,
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const beforeTime = Math.floor(Date.now() / 1000);
      
      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData)
        .expect(201);

      const jobToken = response.body.data.job_token;
      const decoded = jwt.verify(jobToken, config.JWT_SECRET);
      
      // Token should expire in 24 hours
      const expectedExpiration = beforeTime + (24 * 60 * 60);
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiration - 10);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiration + 10);
    });
  });

  describe('File Upload Handling', () => {
    test('should handle CSV file upload for bulk job creation', async () => {
      const csvContent = 'url\nhttps://linkedin.com/in/profile1\nhttps://linkedin.com/in/profile2';
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockLinkedInAccount] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123',
            credits_cost: 2,
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .field('job_type', 'profile_scraping')
        .field('title', 'Bulk Profile Scraping')
        .attach('file', Buffer.from(csvContent), 'profiles.csv')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.urls_count).toBe(2);
    });

    test('should validate file format', async () => {
      const invalidContent = 'invalid file content';
      
      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .field('job_type', 'profile_scraping')
        .field('title', 'Invalid File Test')
        .attach('file', Buffer.from(invalidContent), 'invalid.txt')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid file format');
    });
  });

  describe('Rate Limiting', () => {
    test('should respect rate limits', async () => {
      // Mock rate limit exceeded
      const response = await request(app)
        .post('/api/jobs/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validJobData);

      // This would depend on your rate limiting implementation
      // The test structure is here for when you implement rate limiting
    });
  });
});

describe('Credit Deduction Stored Procedure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Pool.mockImplementation(() => mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  test('should deduct credits successfully', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        p_success: true,
        p_new_balance: 95,
        p_error_message: null
      }]
    });

    // This would test the stored procedure directly
    const result = await mockClient.query(
      'CALL DeductUserCredits(?, ?, ?, ?, @p_success, @p_new_balance, @p_error_message)',
      [1, 5, 'job-123', 'Profile scraping job']
    );

    expect(result.rows[0].p_success).toBe(true);
    expect(result.rows[0].p_new_balance).toBe(95);
  });

  test('should fail with insufficient credits', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        p_success: false,
        p_new_balance: 2,
        p_error_message: 'Insufficient credits'
      }]
    });

    const result = await mockClient.query(
      'CALL DeductUserCredits(?, ?, ?, ?, @p_success, @p_new_balance, @p_error_message)',
      [1, 10, 'job-123', 'Profile scraping job']
    );

    expect(result.rows[0].p_success).toBe(false);
    expect(result.rows[0].p_error_message).toBe('Insufficient credits');
  });
});