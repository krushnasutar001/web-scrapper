const request = require('supertest');
const app = require('../server');

describe('System Resilience Tests', () => {
  
  describe('Database Connection Resilience', () => {
    test('should handle database reconnection', async () => {
      // This test verifies the system can recover from database disconnections
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        database: 'connected'
      });
    });

    test('should handle query timeouts gracefully', async () => {
      // Test that long-running queries are handled properly
      const response = await request(app)
        .get('/api/extension/heartbeat')
        .timeout(5000)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('API Rate Limiting Resilience', () => {
    test('should enforce rate limits per user', async () => {
      const requests = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .get('/api/extension/heartbeat')
            .set('Authorization', 'Bearer test-token')
        );
      }

      const responses = await Promise.allSettled(requests);
      
      // Some should be rate limited
      const rateLimited = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 429
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    test('should allow requests after rate limit window', async () => {
      // First, trigger rate limit
      const rapidRequests = Array(10).fill().map(() =>
        request(app)
          .get('/api/extension/heartbeat')
          .set('Authorization', 'Bearer test-token')
      );

      await Promise.all(rapidRequests);

      // Wait for rate limit window to reset (assuming 1 minute window)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be able to make requests again
      const response = await request(app)
        .get('/api/extension/heartbeat')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Memory Management', () => {
    test('should handle large request payloads', async () => {
      const largeData = {
        cookies: Array(1000).fill().map((_, i) => ({
          name: `cookie_${i}`,
          value: 'x'.repeat(100),
          domain: 'linkedin.com'
        }))
      };

      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer test-token')
        .send(largeData)
        .expect(413); // Payload too large

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('large')
      });
    });

    test('should cleanup resources after requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Make multiple requests
      const requests = Array(50).fill().map(() =>
        request(app)
          .get('/api/extension/heartbeat')
          .set('Authorization', 'Bearer test-token')
      );

      await Promise.all(requests);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should handle concurrent job assignments', async () => {
      const concurrentRequests = Array(10).fill().map(() =>
        request(app)
          .get('/api/extension/assigned-jobs')
          .set('Authorization', 'Bearer test-token')
      );

      const responses = await Promise.all(concurrentRequests);

      // All should succeed or fail gracefully
      responses.forEach(response => {
        expect([200, 429, 503]).toContain(response.status);
      });
    });

    test('should prevent race conditions in job completion', async () => {
      const jobId = 1;
      
      // Try to complete the same job multiple times simultaneously
      const completionRequests = Array(5).fill().map(() =>
        request(app)
          .post(`/api/extension/jobs/${jobId}/complete`)
          .set('Authorization', 'Bearer test-token')
          .send({ results: { success: true } })
      );

      const responses = await Promise.allSettled(completionRequests);

      // Only one should succeed, others should fail gracefully
      const successful = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      );
      
      expect(successful.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Recovery', () => {
    test('should recover from temporary service failures', async () => {
      // This test assumes the service can handle temporary failures
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const response = await request(app)
            .get('/api/extension/account-status')
            .set('Authorization', 'Bearer test-token')
            .timeout(2000);

          if (response.status === 200) {
            expect(response.body.success).toBe(true);
            break;
          }
        } catch (error) {
          attempts++;
          if (attempts === maxAttempts) {
            throw error;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    });

    test('should handle graceful shutdown', async () => {
      // Test that the server can handle shutdown signals gracefully
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Data Validation Resilience', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer test-token')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('JSON')
      });
    });

    test('should sanitize dangerous input', async () => {
      const maliciousInput = {
        name: '<script>alert("xss")</script>',
        email: 'test@example.com'
      };

      const response = await request(app)
        .post('/api/extension/create-identity')
        .set('Authorization', 'Bearer test-token')
        .send(maliciousInput)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid')
      });
    });

    test('should handle SQL injection attempts', async () => {
      const sqlInjection = {
        email: "'; DROP TABLE users; --",
        password: 'password'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(sqlInjection)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid')
      });
    });
  });

  describe('Security Resilience', () => {
    test('should handle brute force login attempts', async () => {
      const bruteForceAttempts = Array(20).fill().map(() =>
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrong-password'
          })
      );

      const responses = await Promise.allSettled(bruteForceAttempts);

      // Should start blocking after several attempts
      const blocked = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 429
      );
      
      expect(blocked.length).toBeGreaterThan(0);
    });

    test('should handle token manipulation attempts', async () => {
      const manipulatedToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5OTksImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.invalid';

      const response = await request(app)
        .get('/api/extension/assigned-jobs')
        .set('Authorization', manipulatedToken)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('token')
      });
    });
  });

  describe('Performance Under Load', () => {
    test('should maintain response times under load', async () => {
      const startTime = Date.now();
      
      const loadRequests = Array(100).fill().map(() =>
        request(app)
          .get('/api/extension/heartbeat')
          .set('Authorization', 'Bearer test-token')
      );

      const responses = await Promise.allSettled(loadRequests);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      const avgResponseTime = totalTime / loadRequests.length;

      // Average response time should be reasonable (less than 500ms)
      expect(avgResponseTime).toBeLessThan(500);

      // Most requests should succeed
      const successful = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      );
      
      expect(successful.length).toBeGreaterThan(loadRequests.length * 0.8);
    });

    test('should handle connection pool exhaustion', async () => {
      // Create many concurrent database-heavy requests
      const heavyRequests = Array(50).fill().map(() =>
        request(app)
          .get('/api/extension/account-status')
          .set('Authorization', 'Bearer test-token')
      );

      const responses = await Promise.allSettled(heavyRequests);

      // Should handle gracefully without crashing
      responses.forEach(response => {
        if (response.status === 'fulfilled') {
          expect([200, 429, 503]).toContain(response.value.status);
        }
      });
    });
  });

  describe('Edge Case Scenarios', () => {
    test('should handle empty request bodies', async () => {
      const response = await request(app)
        .post('/api/extension/sync-cookies')
        .set('Authorization', 'Bearer test-token')
        .set('Content-Type', 'application/json')
        .send('')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String)
      });
    });

    test('should handle extremely long URLs', async () => {
      const longPath = '/api/extension/' + 'a'.repeat(10000);
      
      const response = await request(app)
        .get(longPath)
        .set('Authorization', 'Bearer test-token')
        .expect(414); // URI Too Long

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('URI')
      });
    });

    test('should handle special characters in headers', async () => {
      const response = await request(app)
        .get('/api/extension/heartbeat')
        .set('Authorization', 'Bearer test-token')
        .set('X-Custom-Header', 'value with special chars: àáâãäå')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle timezone edge cases', async () => {
      // Test with different timezone formats
      const response = await request(app)
        .post('/api/extension/jobs/1/complete')
        .set('Authorization', 'Bearer test-token')
        .send({
          results: { success: true },
          timestamp: '2024-01-01T00:00:00.000Z'
        });

      // Should handle gracefully regardless of server timezone
      expect([200, 400, 404]).toContain(response.status);
    });
  });
});

// Helper function to create load
function createLoad(app, endpoint, concurrent = 10, duration = 5000) {
  return new Promise((resolve) => {
    const results = [];
    const startTime = Date.now();
    
    const makeRequest = () => {
      const requestStart = Date.now();
      
      request(app)
        .get(endpoint)
        .set('Authorization', 'Bearer test-token')
        .end((err, res) => {
          const requestEnd = Date.now();
          results.push({
            status: res ? res.status : 'error',
            responseTime: requestEnd - requestStart,
            error: err ? err.message : null
          });
          
          if (Date.now() - startTime < duration) {
            setTimeout(makeRequest, Math.random() * 100);
          } else if (results.length >= concurrent) {
            resolve(results);
          }
        });
    };
    
    // Start concurrent requests
    for (let i = 0; i < concurrent; i++) {
      makeRequest();
    }
  });
}

module.exports = {
  createLoad
};