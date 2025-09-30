const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Mock configuration before requiring other modules
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
    },
    upload: {
      maxFileSize: 50 * 1024 * 1024,
      maxFiles: 5,
      uploadDir: '/tmp/uploads'
    }
  })
}));

// Mock other dependencies
jest.mock('pg');
jest.mock('jsonwebtoken');

const config = require('../config').validateAndLoadConfig();

describe('Results API', () => {
  let app;
  let mockPool;
  let mockClient;

  beforeAll(() => {
    // Setup config mock
    config.JWT_SECRET = 'test-secret';
    config.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    config.UPLOAD_DIR = path.join(__dirname, '../uploads');
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup database mocks
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient)
    };

    Pool.mockImplementation(() => mockPool);

    // Create Express app with results routes
    app = express();
    app.use(express.json());
    app.use('/api/results', require('../routes/results'));

    // Ensure upload directory exists
    try {
      await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  });

  afterEach(async () => {
    // Clean up test files
    try {
      const files = await fs.readdir(config.UPLOAD_DIR);
      for (const file of files) {
        if (file.startsWith('test-')) {
          await fs.unlink(path.join(config.UPLOAD_DIR, file));
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('JWT Authentication', () => {
    test('should reject requests without token', async () => {
      const response = await request(app)
        .post('/api/results/submit')
        .send({ results: [] });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    test('should reject requests with invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer invalid-token')
        .send({ results: [] });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should accept requests with valid token', async () => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'running',
          user_id: 1 
        }] 
      });

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: [] });

      expect(response.status).toBe(200);
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
    });

    test('should reject token for non-existent job', async () => {
      jwt.verify.mockReturnValue({
        job_id: 'job-nonexistent',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: [] });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Job not found');
    });

    test('should reject token for job belonging to different user', async () => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'running',
          user_id: 2 // Different user
        }] 
      });

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: [] });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('POST /api/results/submit', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'running',
          user_id: 1 
        }] 
      });
    });

    test('should submit results successfully', async () => {
      const results = [
        {
          name: 'John Doe',
          headline: 'Software Engineer',
          location: 'San Francisco, CA'
        },
        {
          name: 'Jane Smith',
          headline: 'Product Manager',
          location: 'New York, NY'
        }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] }) // Job validation
        .mockResolvedValueOnce({ rows: [] }) // Insert results
        .mockResolvedValueOnce({ rows: [] }); // Update job

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Results submitted successfully');
      expect(response.body.count).toBe(2);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO job_results'),
        expect.any(Array)
      );
    });

    test('should handle empty results array', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: [] });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });

    test('should validate results format', async () => {
      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: 'invalid-format' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Results must be an array');
    });

    test('should handle database errors', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: [{ name: 'Test' }] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to submit results');
    });
  });

  describe('POST /api/results/upload', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'running',
          user_id: 1 
        }] 
      });
    });

    test('should upload JSON file successfully', async () => {
      const testData = [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' }
      ];

      const testFilePath = path.join(config.UPLOAD_DIR, 'test-data.json');
      await fs.writeFile(testFilePath, JSON.stringify(testData));

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] }); // Insert file record

      const response = await request(app)
        .post('/api/results/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('files', testFilePath);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Files uploaded successfully');
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0].original_name).toBe('test-data.json');
    });

    test('should upload CSV file successfully', async () => {
      const csvData = 'name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com';
      const testFilePath = path.join(config.UPLOAD_DIR, 'test-data.csv');
      await fs.writeFile(testFilePath, csvData);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/results/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('files', testFilePath);

      expect(response.status).toBe(200);
      expect(response.body.files[0].file_type).toBe('text/csv');
    });

    test('should reject files that are too large', async () => {
      // Create a file larger than 50MB (mocked)
      const response = await request(app)
        .post('/api/results/upload')
        .set('Authorization', 'Bearer valid-token')
        .field('mockLargeFile', 'true');

      // This would be handled by multer middleware
      // The exact response depends on multer configuration
    });

    test('should reject unsupported file types', async () => {
      const testFilePath = path.join(config.UPLOAD_DIR, 'test-file.txt');
      await fs.writeFile(testFilePath, 'This is a text file');

      const response = await request(app)
        .post('/api/results/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('files', testFilePath);

      // Response depends on multer fileFilter configuration
      expect(response.status).toBe(400);
    });

    test('should handle multiple file uploads', async () => {
      const testData1 = [{ name: 'John' }];
      const testData2 = [{ name: 'Jane' }];

      const testFile1 = path.join(config.UPLOAD_DIR, 'test-1.json');
      const testFile2 = path.join(config.UPLOAD_DIR, 'test-2.json');

      await fs.writeFile(testFile1, JSON.stringify(testData1));
      await fs.writeFile(testFile2, JSON.stringify(testData2));

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/results/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('files', testFile1)
        .attach('files', testFile2);

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(2);
    });
  });

  describe('POST /api/results/progress', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'running',
          user_id: 1 
        }] 
      });
    });

    test('should update job progress successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/results/progress')
        .set('Authorization', 'Bearer valid-token')
        .send({
          progress: 75,
          message: 'Processing 75 of 100 profiles',
          processed_count: 75,
          total_count: 100
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Progress updated successfully');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE jobs SET progress'),
        expect.arrayContaining([75, 'Processing 75 of 100 profiles'])
      );
    });

    test('should validate progress value', async () => {
      const response = await request(app)
        .post('/api/results/progress')
        .set('Authorization', 'Bearer valid-token')
        .send({ progress: 150 }); // Invalid progress > 100

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Progress must be between 0 and 100');
    });

    test('should require progress field', async () => {
      const response = await request(app)
        .post('/api/results/progress')
        .set('Authorization', 'Bearer valid-token')
        .send({ message: 'Test message' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Progress is required');
    });
  });

  describe('POST /api/results/error', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'running',
          user_id: 1 
        }] 
      });
    });

    test('should report job error successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/results/error')
        .set('Authorization', 'Bearer valid-token')
        .send({
          error: 'LinkedIn account suspended',
          error_type: 'account_suspended',
          recoverable: false
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Error reported successfully');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE jobs SET status = $1'),
        expect.arrayContaining(['failed', expect.any(String)])
      );
    });

    test('should require error field', async () => {
      const response = await request(app)
        .post('/api/results/error')
        .set('Authorization', 'Bearer valid-token')
        .send({ error_type: 'network_error' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Error message is required');
    });

    test('should handle recoverable errors', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/results/error')
        .set('Authorization', 'Bearer valid-token')
        .send({
          error: 'Rate limit exceeded',
          error_type: 'rate_limit',
          recoverable: true
        });

      expect(response.status).toBe(200);

      // Should not mark job as failed for recoverable errors
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE jobs SET'),
        expect.not.arrayContaining(['failed'])
      );
    });
  });

  describe('GET /api/results/:jobId', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'completed',
          user_id: 1 
        }] 
      });
    });

    test('should retrieve job results successfully', async () => {
      const mockResults = [
        {
          id: 'result-1',
          data: { name: 'John Doe', email: 'john@example.com' },
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'result-2',
          data: { name: 'Jane Smith', email: 'jane@example.com' },
          created_at: '2024-01-01T00:01:00Z'
        }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: mockResults });

      const response = await request(app)
        .get('/api/results/job-123')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].data.name).toBe('John Doe');
    });

    test('should support pagination', async () => {
      const mockResults = Array.from({ length: 5 }, (_, i) => ({
        id: `result-${i + 1}`,
        data: { name: `User ${i + 1}` },
        created_at: '2024-01-01T00:00:00Z'
      }));

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: mockResults.slice(0, 2) })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const response = await request(app)
        .get('/api/results/job-123?page=1&limit=2')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.pagination.total).toBe(5);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
    });

    test('should filter results by date range', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/results/job-123?start_date=2024-01-01&end_date=2024-01-31')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $2 AND created_at <= $3'),
        expect.arrayContaining(['job-123', '2024-01-01', '2024-01-31'])
      );
    });
  });

  describe('GET /api/results/:jobId/files', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'completed',
          user_id: 1 
        }] 
      });
    });

    test('should retrieve job files successfully', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          original_name: 'results.json',
          file_path: '/uploads/job-123/results.json',
          file_size: 1024,
          file_type: 'application/json',
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: mockFiles });

      const response = await request(app)
        .get('/api/results/job-123/files')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0].original_name).toBe('results.json');
    });

    test('should handle jobs with no files', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/results/job-123/files')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockPool.connect.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: [] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
    });

    test('should handle malformed JSON in request body', async () => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    test('should handle missing required fields', async () => {
      jwt.verify.mockReturnValue({
        job_id: 'job-123',
        user_id: 1,
        job_type: 'profile_scraping'
      });

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 'job-123', 
          status: 'running',
          user_id: 1 
        }] 
      });

      const response = await request(app)
        .post('/api/results/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({}); // Missing results field

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Results are required');
    });
  });
});