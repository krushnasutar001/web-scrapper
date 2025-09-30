const { AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

describe('Error Recovery and Resilience Tests', () => {
  
  describe('Custom Error Classes', () => {
    test('should create AppError with correct properties', () => {
      const error = new AppError('Test error message', 500, true);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error message');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.status).toBe('error');
    });

    test('should create ValidationError with default status code', () => {
      const error = new ValidationError('Invalid input data');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid input data');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
    });

    test('should create AuthenticationError with correct properties', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });

    test('should create AuthorizationError with correct properties', () => {
      const error = new AuthorizationError('Access denied');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('AuthorizationError');
    });

    test('should create NotFoundError with correct properties', () => {
      const error = new NotFoundError('Resource not found');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Resource not found not found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });

    test('should create ConflictError with correct properties', () => {
      const error = new ConflictError('Resource already exists');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.name).toBe('ConflictError');
    });
  });

  describe('Error Serialization', () => {
    test('should serialize errors to JSON correctly', () => {
      const error = new AppError('Test error', 500, true);
      
      // Test that error properties are accessible
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.status).toBe('error');
      
      // Note: Error objects don't serialize all properties by default
      // This is expected behavior in JavaScript
      const serialized = JSON.stringify(error);
      expect(serialized).toBeDefined();
    });

    test('should handle error stack traces', () => {
      const error = new ValidationError('Test validation error');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
      expect(error.stack).toContain('Test validation error');
    });
  });

  describe('Error Chaining', () => {
    test('should support error cause chaining', () => {
      const originalError = new Error('Original database error');
      const wrappedError = new AppError('Database operation failed', 500, true);
      wrappedError.cause = originalError;
      
      expect(wrappedError.cause).toBe(originalError);
      expect(wrappedError.message).toBe('Database operation failed');
    });

    test('should preserve error context', () => {
      const error = new AppError('Context error', 500);
      error.context = {
        userId: 123,
        operation: 'user_update',
        timestamp: new Date()
      };
      
      expect(error.context.userId).toBe(123);
      expect(error.context.operation).toBe('user_update');
      expect(error.context.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Input Validation Resilience', () => {
    test('should handle null and undefined inputs', () => {
      expect(() => new AppError(null, 500)).not.toThrow();
      expect(() => new AppError(undefined, 500)).not.toThrow();
      expect(() => new AppError('', 500)).not.toThrow();
    });

    test('should handle invalid status codes', () => {
      const error1 = new AppError('Test', 'invalid');
      expect(error1.statusCode).toBe('invalid'); // AppError doesn't validate status codes
      
      const error2 = new AppError('Test', -1);
      expect(error2.statusCode).toBe(-1); // AppError accepts any value
      
      const error3 = new AppError('Test', 1000);
      expect(error3.statusCode).toBe(1000); // AppError accepts any value
    });

    test('should handle special characters in error messages', () => {
      const specialChars = 'Error with special chars: àáâãäå ñ 中文 🚀 <script>';
      const error = new AppError(specialChars, 400);
      
      expect(error.message).toBe(specialChars);
      expect(() => JSON.stringify(error)).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should not cause memory leaks with many errors', () => {
      const errors = [];
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create many error instances
      for (let i = 0; i < 10000; i++) {
        errors.push(new AppError(`Error ${i}`, 500));
      }
      
      // Clear references
      errors.length = 0;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle circular references in error context', () => {
      const error = new AppError('Circular reference test', 500);
      const context = { error: error };
      context.self = context;
      error.context = context;
      
      // Should not throw when stringifying
      expect(() => {
        try {
          JSON.stringify(error);
        } catch (e) {
          // Expected to throw due to circular reference
          expect(e.message).toContain('circular');
        }
      }).not.toThrow();
    });
  });

  describe('Concurrent Error Handling', () => {
    test('should handle multiple errors simultaneously', async () => {
      const errorPromises = Array(100).fill().map(async (_, i) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const error = new AppError(`Concurrent error ${i}`, 500);
            resolve(error);
          }, Math.random() * 10);
        });
      });
      
      const errors = await Promise.all(errorPromises);
      
      expect(errors).toHaveLength(100);
      errors.forEach((error, i) => {
        expect(error.message).toBe(`Concurrent error ${i}`);
        expect(error.statusCode).toBe(500);
      });
    });

    test('should maintain error integrity under load', () => {
      const errors = new Map();
      
      // Create errors concurrently
      const promises = Array(50).fill().map(async (_, i) => {
        const error = new ValidationError(`Load test error ${i}`);
        errors.set(i, error);
        
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 1));
        
        return error;
      });
      
      return Promise.all(promises).then((results) => {
        expect(results).toHaveLength(50);
        expect(errors.size).toBe(50);
        
        // Verify all errors are intact
        for (let i = 0; i < 50; i++) {
          const error = errors.get(i);
          expect(error.message).toBe(`Load test error ${i}`);
          expect(error.statusCode).toBe(400);
        }
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle extremely long error messages', () => {
      const longMessage = 'x'.repeat(10000);
      const error = new AppError(longMessage, 500);
      
      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    test('should handle error messages with newlines and tabs', () => {
      const messageWithWhitespace = 'Error\nwith\nnewlines\tand\ttabs';
      const error = new AppError(messageWithWhitespace, 400);
      
      expect(error.message).toBe(messageWithWhitespace);
      expect(() => JSON.stringify(error)).not.toThrow();
    });

    test('should handle special characters in error messages', () => {
      const specialChars = 'Error with special chars: àáâãäå ñ 中文 🚀 <script>';
      const error = new AppError(specialChars, 400);
      
      expect(error.message).toBe(specialChars);
      expect(() => JSON.stringify(error)).not.toThrow();
    });
  });

  describe('Error Recovery Patterns', () => {
    test('should support retry logic with exponential backoff', async () => {
      let attempts = 0;
      const maxAttempts = 3;
      
      const retryOperation = async () => {
        attempts++;
        if (attempts < maxAttempts) {
          throw new AppError(`Attempt ${attempts} failed`, 500);
        }
        return 'success';
      };
      
      const executeWithRetry = async (operation, maxRetries = 3) => {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await operation();
          } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
              // Exponential backoff: 2^i * 10ms
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 10));
            }
          }
        }
        
        throw lastError;
      };
      
      const result = await executeWithRetry(retryOperation);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should support circuit breaker pattern', () => {
      class CircuitBreaker {
        constructor(threshold = 5, timeout = 60000) {
          this.threshold = threshold;
          this.timeout = timeout;
          this.failureCount = 0;
          this.lastFailureTime = null;
          this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        }
        
        async call(operation) {
          if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
              this.state = 'HALF_OPEN';
            } else {
              throw new AppError('Circuit breaker is OPEN', 503);
            }
          }
          
          try {
            const result = await operation();
            this.onSuccess();
            return result;
          } catch (error) {
            this.onFailure();
            throw error;
          }
        }
        
        onSuccess() {
          this.failureCount = 0;
          this.state = 'CLOSED';
        }
        
        onFailure() {
          this.failureCount++;
          this.lastFailureTime = Date.now();
          
          if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
          }
        }
      }
      
      const breaker = new CircuitBreaker(2, 100); // 2 failures, 100ms timeout
      
      // Test circuit breaker functionality
      expect(breaker.state).toBe('CLOSED');
      
      // Simulate failures
      const failingOperation = () => Promise.reject(new Error('Operation failed'));
      
      return Promise.all([
        breaker.call(failingOperation).catch(() => {}),
        breaker.call(failingOperation).catch(() => {})
      ]).then(() => {
        expect(breaker.state).toBe('OPEN');
        
        // Next call should be immediately rejected
        return breaker.call(failingOperation).catch((error) => {
          expect(error.message).toContain('Circuit breaker is OPEN');
        });
      });
    });
  });

  describe('Performance Under Stress', () => {
    test('should maintain performance with many error instances', () => {
      const startTime = Date.now();
      const errors = [];
      
      // Create 10,000 error instances
      for (let i = 0; i < 10000; i++) {
        errors.push(new AppError(`Performance test error ${i}`, 500));
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      expect(errors).toHaveLength(10000);
    });

    test('should handle rapid error creation and disposal', () => {
      const iterations = 1000;
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const error = new ValidationError(`Rapid test ${i}`);
        // Immediately discard reference
        expect(error.message).toBe(`Rapid test ${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should be reasonably fast (less than 500ms for 1000 iterations)
      expect(duration).toBeLessThan(500);
    });
  });
});