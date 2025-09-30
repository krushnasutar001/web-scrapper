// Extension Error Handling Tests
// These tests verify the extension's ability to handle various error scenarios

describe('Extension Error Handling Tests', () => {
  
  describe('Background Script Error Handling', () => {
    let mockChrome;
    
    beforeEach(() => {
      // Mock Chrome APIs
      mockChrome = {
        storage: {
          local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
          }
        },
        tabs: {
          create: jest.fn(),
          update: jest.fn(),
          remove: jest.fn(),
          query: jest.fn(),
          sendMessage: jest.fn()
        },
        runtime: {
          onMessage: {
            addListener: jest.fn()
          },
          sendMessage: jest.fn(),
          lastError: null
        },
        alarms: {
          create: jest.fn(),
          clear: jest.fn(),
          onAlarm: {
            addListener: jest.fn()
          }
        }
      };
      global.chrome = mockChrome;
    });

    test('should handle storage API failures gracefully', async () => {
      // Mock storage failure
      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        mockChrome.runtime.lastError = { message: 'Storage quota exceeded' };
        callback({});
      });

      // Load background script
      require('../background.js');

      // Verify error handling
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Storage error')
      );
    });

    test('should handle network request failures', async () => {
      // Mock fetch failure
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const { handleLogin } = require('../background.js');
      
      const result = await handleLogin({
        email: 'test@example.com',
        password: 'password'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network');
    });

    test('should handle tab creation failures', async () => {
      // Mock tab creation failure
      mockChrome.tabs.create.mockImplementation((createProperties, callback) => {
        mockChrome.runtime.lastError = { message: 'Could not create tab' };
        callback(null);
      });

      const { createJobTab } = require('../background.js');
      
      const result = await createJobTab('https://linkedin.com/profile');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('tab');
    });

    test('should handle job polling errors', async () => {
      // Mock API failure during job polling
      global.fetch = jest.fn().mockRejectedValue(new Error('API unavailable'));

      const { jobPoller } = require('../background.js');
      
      // Start polling
      jobPoller.startPolling();
      
      // Wait for polling attempt
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify error handling and retry mechanism
      expect(jobPoller.retryCount).toBeGreaterThan(0);
      expect(jobPoller.isPolling).toBe(true); // Should continue polling
    });

    test('should handle authentication token expiration', async () => {
      // Mock expired token response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Token expired' })
      });

      const { makeAuthenticatedRequest } = require('../background.js');
      
      const result = await makeAuthenticatedRequest('/api/test');
      
      expect(result.success).toBe(false);
      expect(result.requiresReauth).toBe(true);
    });

    test('should handle message passing failures', async () => {
      // Mock message sending failure
      mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        mockChrome.runtime.lastError = { message: 'Could not establish connection' };
        callback(null);
      });

      const { sendMessageToTab } = require('../background.js');
      
      const result = await sendMessageToTab(123, { action: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('connection');
    });

    test('should handle alarm creation failures', async () => {
      // Mock alarm failure
      mockChrome.alarms.create.mockImplementation((name, alarmInfo) => {
        mockChrome.runtime.lastError = { message: 'Alarm limit exceeded' };
      });

      const { scheduleJobCheck } = require('../background.js');
      
      const result = scheduleJobCheck();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('alarm');
    });
  });

  describe('Content Script Error Handling', () => {
    let mockChrome;
    let mockDocument;

    beforeEach(() => {
      // Mock Chrome APIs
      mockChrome = {
        runtime: {
          onMessage: {
            addListener: jest.fn()
          },
          sendMessage: jest.fn(),
          lastError: null
        }
      };
      global.chrome = mockChrome;

      // Mock DOM
      mockDocument = {
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(),
        createElement: jest.fn(),
        addEventListener: jest.fn(),
        readyState: 'complete'
      };
      global.document = mockDocument;
    });

    test('should handle DOM element not found errors', async () => {
      // Mock missing elements
      mockDocument.querySelector.mockReturnValue(null);
      mockDocument.querySelectorAll.mockReturnValue([]);

      const { scrapeProfile } = require('../content.js');
      
      const result = await scrapeProfile();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('element not found');
    });

    test('should handle LinkedIn page navigation errors', async () => {
      // Mock navigation failure
      const originalLocation = window.location;
      delete window.location;
      window.location = { href: 'about:blank' };

      const { navigateToProfile } = require('../content.js');
      
      const result = await navigateToProfile('https://linkedin.com/in/test');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('navigation');

      // Restore location
      window.location = originalLocation;
    });

    test('should handle connection request failures', async () => {
      // Mock missing connect button
      mockDocument.querySelector.mockImplementation(selector => {
        if (selector.includes('connect')) return null;
        return { click: jest.fn() };
      });

      const { sendConnectionRequest } = require('../content.js');
      
      const result = await sendConnectionRequest('Test message');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('connect button');
    });

    test('should handle message sending failures', async () => {
      // Mock message sending error
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        mockChrome.runtime.lastError = { message: 'Extension context invalidated' };
        callback(null);
      });

      const { reportJobResult } = require('../content.js');
      
      const result = await reportJobResult({ success: true });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('context');
    });

    test('should handle login detection failures', async () => {
      // Mock login detection error
      mockDocument.querySelector.mockImplementation(selector => {
        if (selector.includes('login')) throw new Error('DOM access denied');
        return null;
      });

      const { checkLoginStatus } = require('../content.js');
      
      const result = await checkLoginStatus();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('DOM access');
    });

    test('should handle script injection failures', async () => {
      // Mock script injection error
      mockDocument.createElement.mockImplementation(tag => {
        if (tag === 'script') {
          const script = {
            src: '',
            onload: null,
            onerror: null
          };
          setTimeout(() => script.onerror(new Error('Script load failed')), 10);
          return script;
        }
        return {};
      });

      const { injectHelperScript } = require('../content.js');
      
      const result = await injectHelperScript();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('script');
    });

    test('should handle rate limiting from LinkedIn', async () => {
      // Mock rate limiting response
      const mockResponse = {
        status: 429,
        headers: new Map([['retry-after', '60']])
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const { performLinkedInAction } = require('../content.js');
      
      const result = await performLinkedInAction('connect');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit');
      expect(result.retryAfter).toBe(60);
    });

    test('should handle CAPTCHA detection', async () => {
      // Mock CAPTCHA presence
      mockDocument.querySelector.mockImplementation(selector => {
        if (selector.includes('captcha') || selector.includes('challenge')) {
          return { style: { display: 'block' } };
        }
        return null;
      });

      const { detectCaptcha } = require('../content.js');
      
      const result = detectCaptcha();
      
      expect(result.hasCaptcha).toBe(true);
      expect(result.action).toBe('pause_automation');
    });

    test('should handle page load timeout', async () => {
      // Mock slow page load
      const { waitForPageLoad } = require('../content.js');
      
      const startTime = Date.now();
      const result = await waitForPageLoad(100); // 100ms timeout
      const endTime = Date.now();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Extension Communication Error Handling', () => {
    test('should handle background script unavailable', async () => {
      // Mock background script unavailable
      global.chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        global.chrome.runtime.lastError = { message: 'Extension context invalidated' };
        callback(null);
      });

      const { sendToBackground } = require('../content.js');
      
      const result = await sendToBackground({ action: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('background script');
    });

    test('should handle content script unavailable', async () => {
      // Mock content script unavailable
      global.chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        global.chrome.runtime.lastError = { message: 'Could not establish connection' };
        callback(null);
      });

      const { sendToContent } = require('../background.js');
      
      const result = await sendToContent(123, { action: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('content script');
    });

    test('should handle message serialization errors', async () => {
      // Create circular reference
      const circularObj = { a: 1 };
      circularObj.self = circularObj;

      const { sendMessage } = require('../background.js');
      
      const result = await sendMessage(circularObj);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('serialization');
    });
  });

  describe('Recovery and Retry Mechanisms', () => {
    test('should retry failed operations with exponential backoff', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ ok: true, json: () => ({}) });
      });

      const { retryOperation } = require('../background.js');
      
      const startTime = Date.now();
      const result = await retryOperation(() => fetch('/api/test'));
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
      expect(endTime - startTime).toBeGreaterThan(100); // Should have delays
    });

    test('should implement circuit breaker pattern', async () => {
      // Mock repeated failures
      global.fetch = jest.fn().mockRejectedValue(new Error('Service down'));

      const { CircuitBreaker } = require('../background.js');
      const breaker = new CircuitBreaker();
      
      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await breaker.call(() => fetch('/api/test'));
      }
      
      expect(breaker.state).toBe('OPEN');
      
      // Next call should be immediately rejected
      const result = await breaker.call(() => fetch('/api/test'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('circuit breaker');
    });

    test('should handle graceful degradation', async () => {
      // Mock partial service failure
      global.fetch = jest.fn().mockImplementation(url => {
        if (url.includes('/premium-feature')) {
          return Promise.reject(new Error('Premium service down'));
        }
        return Promise.resolve({ ok: true, json: () => ({}) });
      });

      const { executeJobWithFallback } = require('../background.js');
      
      const result = await executeJobWithFallback({
        type: 'profile_scrape',
        premium: true
      });
      
      expect(result.success).toBe(true);
      expect(result.usedFallback).toBe(true);
      expect(result.warning).toContain('premium features');
    });

    test('should recover from extension reload', async () => {
      // Mock extension reload scenario
      const { restoreState } = require('../background.js');
      
      // Simulate stored state
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({
          authToken: 'test-token',
          activeJobs: [{ id: 1, status: 'in_progress' }],
          lastHeartbeat: Date.now() - 30000 // 30 seconds ago
        });
      });

      const result = await restoreState();
      
      expect(result.success).toBe(true);
      expect(result.restoredJobs).toBe(1);
      expect(result.requiresSync).toBe(true);
    });
  });

  describe('Edge Case Handling', () => {
    test('should handle extension disabled/enabled cycles', async () => {
      const { handleExtensionStateChange } = require('../background.js');
      
      // Simulate disable
      await handleExtensionStateChange('disabled');
      
      // Verify cleanup
      expect(global.chrome.alarms.clear).toHaveBeenCalled();
      
      // Simulate re-enable
      const result = await handleExtensionStateChange('enabled');
      
      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);
    });

    test('should handle browser restart scenarios', async () => {
      const { initializeAfterRestart } = require('../background.js');
      
      // Mock persistent storage
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({
          persistentState: {
            authToken: 'test-token',
            lastActivity: Date.now() - 3600000 // 1 hour ago
          }
        });
      });

      const result = await initializeAfterRestart();
      
      expect(result.success).toBe(true);
      expect(result.requiresReauth).toBe(true);
    });

    test('should handle memory pressure scenarios', async () => {
      const { handleMemoryPressure } = require('../background.js');
      
      // Simulate memory pressure
      const result = await handleMemoryPressure();
      
      expect(result.success).toBe(true);
      expect(result.clearedCache).toBe(true);
      expect(result.pausedNonEssential).toBe(true);
    });

    test('should handle concurrent job execution conflicts', async () => {
      const { JobManager } = require('../background.js');
      const manager = new JobManager();
      
      // Start multiple jobs simultaneously
      const job1 = manager.executeJob({ id: 1, type: 'profile_scrape' });
      const job2 = manager.executeJob({ id: 2, type: 'profile_scrape' });
      
      const results = await Promise.all([job1, job2]);
      
      // One should succeed, one should be queued
      const succeeded = results.filter(r => r.success && !r.queued);
      const queued = results.filter(r => r.queued);
      
      expect(succeeded.length).toBe(1);
      expect(queued.length).toBe(1);
    });
  });

  describe('Security Error Handling', () => {
    test('should handle CSP violations', async () => {
      // Mock CSP violation
      const mockEvent = {
        blockedURI: 'inline',
        violatedDirective: 'script-src',
        originalPolicy: "script-src 'self'"
      };

      const { handleCSPViolation } = require('../content.js');
      
      const result = handleCSPViolation(mockEvent);
      
      expect(result.blocked).toBe(true);
      expect(result.fallbackUsed).toBe(true);
    });

    test('should handle XSS attempt detection', async () => {
      const { sanitizeInput } = require('../content.js');
      
      const maliciousInput = '<script>alert("xss")</script>';
      const result = sanitizeInput(maliciousInput);
      
      expect(result.sanitized).not.toContain('<script>');
      expect(result.wasBlocked).toBe(true);
    });

    test('should handle unauthorized access attempts', async () => {
      // Mock unauthorized response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Forbidden' })
      });

      const { makeSecureRequest } = require('../background.js');
      
      const result = await makeSecureRequest('/api/sensitive');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('unauthorized');
      expect(result.shouldLogout).toBe(true);
    });
  });
});

// Test utilities
function createMockTab(id = 1, url = 'https://linkedin.com') {
  return {
    id,
    url,
    active: true,
    windowId: 1
  };
}

function createMockJob(id = 1, type = 'profile_scrape') {
  return {
    id,
    type,
    status: 'pending',
    created_at: new Date().toISOString(),
    parameters: {}
  };
}

module.exports = {
  createMockTab,
  createMockJob
};