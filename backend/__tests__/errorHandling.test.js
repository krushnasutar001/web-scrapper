const request = require('supertest');
const app = require('../app');
const { AppError, ValidationError, AuthenticationError } = require('../middleware/errorHandler');

describe('Error Handling Tests', () => {
  
  describe('Authentication Errors', () => {
    test('should handle missing authorization header', async () => {
      const response = await request(app)
        .get('/api/extension/assigned-jobs')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('token'),
        code: 'NO_TOKEN'
      });
    });

    test('should handle invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/extension/assigned-jobs')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('token'),
        code: 'INVALID_TOKEN'
      });
    });

    test('should handle expired JWT token', async () => {
      // Create an expired token for testing
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAzNjAwfQ.invalid';
      
      const response = await request(app)
        .get('/api/extension/assigned-jobs')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('token')
      });
    });
  });

  describe('Validation Errors', () => {
    test('should handle invalid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('JSON')
      });
    });

    test('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('required')
      });
    });

    test('should handle invalid cookie structure', async () => {
      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer valid-token')
        .send({
          cookies: 'invalid-cookies-format'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('cookies')
      });
    });
  });

  describe('Database Errors', () => {
    test('should handle database connection errors', async () => {
      // Mock database connection failure
      const originalQuery = require('../utils/database').query;
      require('../utils/database').query = jest.fn().mockRejectedValue(
        new Error('Connection refused')
      );

      const response = await request(app)
        .get('/api/extension/account-status')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed')
      });

      // Restore original function
      require('../utils/database').query = originalQuery;
    });

    test('should handle SQL constraint violations', async () => {
      // Mock constraint violation
      const originalQuery = require('../utils/database').query;
      require('../utils/database').query = jest.fn().mockRejectedValue({
        code: 'ER_DUP_ENTRY',
        message: 'Duplicate entry'
      });

      const response = await request(app)
        .post('/api/extension/create-identity')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Test Identity',
          email: 'test@example.com'
        })
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('exists')
      });

      // Restore original function
      require('../utils/database').query = originalQuery;
    });
  });

  describe('Rate Limiting', () => {
    test('should handle rate limit exceeded', async () => {
      // Make multiple rapid requests to trigger rate limiting
      const requests = Array(10).fill().map(() =>
        request(app)
          .get('/api/extension/heartbeat')
          .set('Authorization', 'Bearer valid-token')
      );

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('File Upload Errors', () => {
    test('should handle file size exceeded', async () => {
      // Create a large buffer to simulate oversized file
      const largeBuffer = Buffer.alloc(20 * 1024 * 1024); // 20MB

      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', largeBuffer, 'large-file.txt')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('size')
      });
    });

    test('should handle invalid file types', async () => {
      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', Buffer.from('test'), 'test.exe')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('type')
      });
    });
  });

  describe('Network Errors', () => {
    test('should handle external API failures', async () => {
      // Mock external API failure
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(
        new Error('ECONNREFUSED')
      );

      const response = await request(app)
        .post('/api/external/linkedin-validate')
        .set('Authorization', 'Bearer valid-token')
        .send({ cookies: [] })
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('service')
      });

      // Restore original fetch
      global.fetch = originalFetch;
    });

    test('should handle timeout errors', async () => {
      // Mock timeout
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(() =>
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('ETIMEDOUT')), 100)
        )
      );

      const response = await request(app)
        .post('/api/external/linkedin-validate')
        .set('Authorization', 'Bearer valid-token')
        .send({ cookies: [] })
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('timeout')
      });

      // Restore original fetch
      global.fetch = originalFetch;
    });
  });

  describe('Job Processing Errors', () => {
    test('should handle job not found', async () => {
      const response = await request(app)
        .post('/api/extension/jobs/999999/complete')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: {} })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('not found')
      });
    });

    test('should handle invalid job status transitions', async () => {
      // Assuming job ID 1 exists but is already completed
      const response = await request(app)
        .post('/api/extension/jobs/1/complete')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: {} })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('state')
      });
    });

    test('should handle malformed job results', async () => {
      const response = await request(app)
        .post('/api/extension/jobs/1/complete')
        .set('Authorization', 'Bearer valid-token')
        .send({ results: 'invalid-results-format' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('results')
      });
    });
  });

  describe('Cookie Encryption Errors', () => {
    test('should handle encryption failures', async () => {
      // Mock encryption failure
      const originalEncrypt = require('../services/cookieEncryption').encryptCookies;
      require('../services/cookieEncryption').encryptCookies = jest.fn().mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer valid-token')
        .send({
          cookies: [{ name: 'test', value: 'test', domain: 'linkedin.com' }]
        })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('encrypt')
      });

      // Restore original function
      require('../services/cookieEncryption').encryptCookies = originalEncrypt;
    });

    test('should handle decryption failures', async () => {
      // Mock decryption failure
      const originalDecrypt = require('../services/cookieEncryption').decryptCookies;
      require('../services/cookieEncryption').decryptCookies = jest.fn().mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const response = await request(app)
        .get('/api/extension/cookies/1')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('decrypt')
      });

      // Restore original function
      require('../services/cookieEncryption').decryptCookies = originalDecrypt;
    });
  });

  describe('Memory and Resource Limits', () => {
    test('should handle memory exhaustion gracefully', async () => {
      // Simulate memory pressure by creating large objects
      const largeData = Array(1000000).fill().map((_, i) => ({
        id: i,
        data: 'x'.repeat(1000)
      }));

      const response = await request(app)
        .post('/api/extension/bulk-process')
        .set('Authorization', 'Bearer valid-token')
        .send({ data: largeData })
        .expect(413);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('large')
      });
    });

    test('should handle concurrent request limits', async () => {
      // Create many concurrent requests
      const concurrentRequests = Array(50).fill().map(() =>
        request(app)
          .get('/api/extension/assigned-jobs')
          .set('Authorization', 'Bearer valid-token')
      );

      const responses = await Promise.allSettled(concurrentRequests);
      
      // Some requests should be rejected due to limits
      const rejected = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status >= 500
      );
      
      expect(rejected.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty request bodies', async () => {
      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'application/json')
        .send('')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String)
      });
    });

    test('should handle special characters in input', async () => {
      const response = await request(app)
        .post('/api/extension/create-identity')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: '"><script>alert("xss")</script>',
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid')
      });
    });

    test('should handle very long input strings', async () => {
      const longString = 'x'.repeat(10000);
      
      const response = await request(app)
        .post('/api/extension/create-identity')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: longString,
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('length')
      });
    });

    test('should handle null and undefined values', async () => {
      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer valid-token')
        .send({
          cookies: null,
          userAgent: undefined
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('required')
      });
    });
  });

  describe('Recovery Mechanisms', () => {
    test('should retry failed operations', async () => {
      let attemptCount = 0;
      const originalQuery = require('../utils/database').query;
      
      require('../utils/database').query = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve([]);
      });

      const response = await request(app)
        .get('/api/extension/account-status')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(attemptCount).toBe(3);
      expect(response.body.success).toBe(true);

      // Restore original function
      require('../utils/database').query = originalQuery;
    });

    test('should handle circuit breaker activation', async () => {
      // Simulate multiple failures to trigger circuit breaker
      const originalQuery = require('../utils/database').query;
      require('../utils/database').query = jest.fn().mockRejectedValue(
        new Error('Service unavailable')
      );

      // Make multiple requests to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/api/extension/account-status')
          .set('Authorization', 'Bearer valid-token')
          .expect(500);
      }

      // Next request should be immediately rejected
      const response = await request(app)
        .get('/api/extension/account-status')
        .set('Authorization', 'Bearer valid-token')
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('circuit')
      });

      // Restore original function
      require('../utils/database').query = originalQuery;
    });
  });

  describe('Graceful Degradation', () => {
    test('should provide fallback when external services fail', async () => {
      // Mock external service failure
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Service down'));

      const response = await request(app)
        .get('/api/extension/account-status')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Should return cached or default data
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('fallback', true);

      // Restore original fetch
      global.fetch = originalFetch;
    });

    test('should continue operation with reduced functionality', async () => {
      // Mock partial service failure
      const originalEncrypt = require('../services/cookieEncryption').encryptCookies;
      require('../services/cookieEncryption').encryptCookies = jest.fn().mockImplementation(() => {
        throw new Error('Encryption service down');
      });

      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer valid-token')
        .send({
          cookies: [{ name: 'test', value: 'test', domain: 'linkedin.com' }]
        })
        .expect(200);

      // Should store unencrypted with warning
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('warning');

      // Restore original function
      require('../services/cookieEncryption').encryptCookies = originalEncrypt;
    });
  });
});

// Helper function to create valid JWT token for testing
function createValidToken(userId = 1, email = 'test@example.com') {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'linkedin-automation-jwt-secret-key';
  
  return jwt.sign(
    { 
      id: userId, 
      email: email,
      name: 'Test User',
      type: 'access'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

module.exports = {
  createValidToken
};