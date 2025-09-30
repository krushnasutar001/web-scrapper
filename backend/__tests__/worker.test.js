const { Worker, Queue } = require('bullmq');
const { Pool } = require('pg');
const Redis = require('ioredis');

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
    browser: {
      executablePath: '/usr/bin/chromium',
      headless: true
    }
  })
}));

const config = require('../config').validateAndLoadConfig();
const { chromium } = require('playwright');

// Mock dependencies
jest.mock('bullmq');
jest.mock('pg');
jest.mock('playwright');
jest.mock('../config');

// Import the worker module after mocking
const workerModule = require('../workers/worker');

describe('BullMQ Worker', () => {
  let mockPool;
  let mockClient;
  let mockBrowser;
  let mockPage;
  let mockWorker;

  beforeAll(() => {
    // Setup config mock
    config.REDIS_URL = 'redis://localhost:6379';
    config.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    config.CHROME_USER_DATA_DIR = '/tmp/chrome-test';
    config.CHROME_HEADLESS = true;
    config.WORKER_CONCURRENCY = 2;
    config.WORKER_TIMEOUT = 300000;
  });

  beforeEach(() => {
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

    // Setup browser mocks
    mockPage = {
      goto: jest.fn(),
      waitForSelector: jest.fn(),
      evaluate: jest.fn(),
      screenshot: jest.fn(),
      close: jest.fn(),
      setUserAgent: jest.fn(),
      setViewportSize: jest.fn(),
      context: jest.fn().mockReturnValue({
        addCookies: jest.fn(),
        storageState: jest.fn()
      })
    };

    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn()
    };

    chromium.launch = jest.fn().mockResolvedValue(mockBrowser);

    // Setup worker mock
    mockWorker = {
      on: jest.fn(),
      close: jest.fn()
    };

    Worker.mockImplementation(() => mockWorker);
  });

  describe('Worker Initialization', () => {
    test('should initialize worker with correct configuration', () => {
      require('../workers/worker');

      expect(Worker).toHaveBeenCalledWith(
        'scraping',
        expect.any(Function),
        expect.objectContaining({
          connection: { host: 'localhost', port: 6379 },
          concurrency: 2,
          removeOnComplete: 100,
          removeOnFail: 50
        })
      );
    });

    test('should setup event listeners', () => {
      require('../workers/worker');

      expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('Job Processing', () => {
    let jobProcessor;

    beforeEach(() => {
      // Get the job processor function passed to Worker constructor
      require('../workers/worker');
      jobProcessor = Worker.mock.calls[0][1];
    });

    test('should process profile scraping job successfully', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          job_id: 'job-123',
          user_id: 1,
          job_type: 'profile_scraping',
          config: {
            urls: ['https://linkedin.com/in/test-profile'],
            max_results: 1
          }
        },
        updateProgress: jest.fn()
      };

      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1, 
            cookie_path: '/path/to/cookies.json',
            status: 'active'
          }] 
        }) // Get LinkedIn account
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'url-1',
            url: 'https://linkedin.com/in/test-profile',
            status: 'pending'
          }] 
        }) // Get job URLs
        .mockResolvedValueOnce({ rows: [] }) // Update URL status to processing
        .mockResolvedValueOnce({ rows: [] }) // Update job progress
        .mockResolvedValueOnce({ rows: [] }) // Save result
        .mockResolvedValueOnce({ rows: [] }) // Update URL status to completed
        .mockResolvedValueOnce({ rows: [] }); // Update job status

      // Mock file system for cookies
      const fs = require('fs').promises;
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify([
        { name: 'li_at', value: 'test-cookie', domain: '.linkedin.com' }
      ]));

      // Mock page scraping
      mockPage.evaluate.mockResolvedValue({
        name: 'John Doe',
        headline: 'Software Engineer',
        location: 'San Francisco, CA',
        connections: '500+',
        about: 'Experienced software engineer...',
        experience: [
          {
            title: 'Senior Software Engineer',
            company: 'Tech Corp',
            duration: '2020 - Present',
            description: 'Leading development of web applications'
          }
        ],
        education: [
          {
            school: 'University of Technology',
            degree: 'Bachelor of Computer Science',
            years: '2016 - 2020'
          }
        ]
      });

      const result = await jobProcessor(mockJob);

      expect(result).toEqual({
        success: true,
        processed_urls: 1,
        results_count: 1,
        message: 'Job completed successfully'
      });

      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    test('should handle scraping errors gracefully', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          job_id: 'job-123',
          user_id: 1,
          job_type: 'profile_scraping',
          config: {
            urls: ['https://linkedin.com/in/invalid-profile'],
            max_results: 1
          }
        },
        updateProgress: jest.fn()
      };

      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1, 
            cookie_path: '/path/to/cookies.json',
            status: 'active'
          }] 
        })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'url-1',
            url: 'https://linkedin.com/in/invalid-profile',
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] }) // Update URL status to processing
        .mockResolvedValueOnce({ rows: [] }) // Update job progress
        .mockResolvedValueOnce({ rows: [] }) // Update URL status to failed
        .mockResolvedValueOnce({ rows: [] }); // Update job status

      // Mock file system for cookies
      const fs = require('fs').promises;
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify([
        { name: 'li_at', value: 'test-cookie', domain: '.linkedin.com' }
      ]));

      // Mock page error
      mockPage.goto.mockRejectedValue(new Error('Page not found'));

      const result = await jobProcessor(mockJob);

      expect(result).toEqual({
        success: true,
        processed_urls: 1,
        results_count: 0,
        failed_urls: 1,
        message: 'Job completed with some failures'
      });
    });

    test('should handle company scraping job', async () => {
      const mockJob = {
        id: 'job-456',
        data: {
          job_id: 'job-456',
          user_id: 1,
          job_type: 'company_scraping',
          config: {
            companies: ['tech-corp'],
            max_results: 1
          }
        },
        updateProgress: jest.fn()
      };

      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1, 
            cookie_path: '/path/to/cookies.json',
            status: 'active'
          }] 
        })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'url-1',
            url: 'https://linkedin.com/company/tech-corp',
            status: 'pending'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      // Mock file system for cookies
      const fs = require('fs').promises;
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify([
        { name: 'li_at', value: 'test-cookie', domain: '.linkedin.com' }
      ]));

      // Mock company page scraping
      mockPage.evaluate.mockResolvedValue({
        name: 'Tech Corp',
        industry: 'Technology',
        size: '1001-5000 employees',
        headquarters: 'San Francisco, CA',
        founded: '2010',
        description: 'Leading technology company...',
        website: 'https://techcorp.com',
        specialties: ['Software Development', 'AI', 'Machine Learning']
      });

      const result = await jobProcessor(mockJob);

      expect(result).toEqual({
        success: true,
        processed_urls: 1,
        results_count: 1,
        message: 'Job completed successfully'
      });
    });

    test('should handle search scraping job', async () => {
      const mockJob = {
        id: 'job-789',
        data: {
          job_id: 'job-789',
          user_id: 1,
          job_type: 'search_scraping',
          config: {
            search_terms: ['software engineer'],
            location: 'San Francisco',
            max_results: 2
          }
        },
        updateProgress: jest.fn()
      };

      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 1, 
            cookie_path: '/path/to/cookies.json',
            status: 'active'
          }] 
        })
        .mockResolvedValueOnce({ rows: [] }) // No predefined URLs for search
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      // Mock file system for cookies
      const fs = require('fs').promises;
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify([
        { name: 'li_at', value: 'test-cookie', domain: '.linkedin.com' }
      ]));

      // Mock search results
      mockPage.evaluate.mockResolvedValue([
        {
          name: 'John Doe',
          headline: 'Software Engineer at Tech Corp',
          location: 'San Francisco, CA',
          profile_url: 'https://linkedin.com/in/john-doe'
        },
        {
          name: 'Jane Smith',
          headline: 'Senior Software Engineer at StartupCo',
          location: 'San Francisco, CA',
          profile_url: 'https://linkedin.com/in/jane-smith'
        }
      ]);

      const result = await jobProcessor(mockJob);

      expect(result).toEqual({
        success: true,
        processed_urls: 1,
        results_count: 2,
        message: 'Job completed successfully'
      });
    });

    test('should handle missing LinkedIn account', async () => {
      const mockJob = {
        id: 'job-no-account',
        data: {
          job_id: 'job-no-account',
          user_id: 999,
          job_type: 'profile_scraping',
          config: {
            urls: ['https://linkedin.com/in/test'],
            max_results: 1
          }
        },
        updateProgress: jest.fn()
      };

      // Mock no LinkedIn account found
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(jobProcessor(mockJob)).rejects.toThrow('No available LinkedIn account found');
    });

    test('should handle browser launch failure', async () => {
      const mockJob = {
        id: 'job-browser-fail',
        data: {
          job_id: 'job-browser-fail',
          user_id: 1,
          job_type: 'profile_scraping',
          config: {
            urls: ['https://linkedin.com/in/test'],
            max_results: 1
          }
        },
        updateProgress: jest.fn()
      };

      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 1, 
          cookie_path: '/path/to/cookies.json',
          status: 'active'
        }] 
      });

      // Mock browser launch failure
      chromium.launch.mockRejectedValue(new Error('Failed to launch browser'));

      await expect(jobProcessor(mockJob)).rejects.toThrow('Failed to launch browser');
    });
  });

  describe('Database Operations', () => {
    test('should update job status correctly', async () => {
      const { updateJobStatus } = require('../workers/worker');

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await updateJobStatus('job-123', 'running', 'Processing URLs...');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE jobs SET status = $1'),
        ['running', 'Processing URLs...', 'job-123']
      );
    });

    test('should save job result correctly', async () => {
      const { saveJobResult } = require('../workers/worker');

      const resultData = {
        name: 'John Doe',
        headline: 'Software Engineer'
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await saveJobResult('job-123', 'url-1', resultData);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO job_results'),
        expect.arrayContaining([
          expect.any(String), // result ID
          'job-123',
          JSON.stringify(resultData)
        ])
      );
    });

    test('should handle database connection errors', async () => {
      const { updateJobStatus } = require('../workers/worker');

      mockPool.connect.mockRejectedValue(new Error('Database connection failed'));

      await expect(updateJobStatus('job-123', 'failed', 'DB Error')).rejects.toThrow('Database connection failed');
    });
  });

  describe('Browser Management', () => {
    test('should launch browser with correct configuration', async () => {
      const { launchBrowser } = require('../workers/worker');

      await launchBrowser();

      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        userDataDir: '/tmp/chrome-test',
        args: expect.arrayContaining([
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ])
      });
    });

    test('should load cookies correctly', async () => {
      const { loadCookies } = require('../workers/worker');

      const fs = require('fs').promises;
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify([
        { name: 'li_at', value: 'test-cookie', domain: '.linkedin.com' }
      ]));

      const cookies = await loadCookies('/path/to/cookies.json');

      expect(cookies).toEqual([
        { name: 'li_at', value: 'test-cookie', domain: '.linkedin.com' }
      ]);
    });

    test('should handle missing cookie file', async () => {
      const { loadCookies } = require('../workers/worker');

      const fs = require('fs').promises;
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

      await expect(loadCookies('/invalid/path')).rejects.toThrow('File not found');
    });
  });

  describe('Graceful Shutdown', () => {
    test('should close worker and browser on shutdown', async () => {
      const { gracefulShutdown } = require('../workers/worker');

      await gracefulShutdown();

      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    test('should handle shutdown signals', () => {
      const originalProcessOn = process.on;
      const mockProcessOn = jest.fn();
      process.on = mockProcessOn;

      require('../workers/worker');

      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      process.on = originalProcessOn;
    });
  });

  describe('Error Handling', () => {
    test('should handle worker errors', () => {
      require('../workers/worker');

      const errorHandler = mockWorker.on.mock.calls.find(call => call[0] === 'error')[1];
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      errorHandler(new Error('Worker error'));

      expect(consoleSpy).toHaveBeenCalledWith('❌ Worker error:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    test('should handle job failures', () => {
      require('../workers/worker');

      const failedHandler = mockWorker.on.mock.calls.find(call => call[0] === 'failed')[1];
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockJob = { id: 'job-123', data: { job_id: 'job-123' } };
      const error = new Error('Job failed');

      failedHandler(mockJob, error);

      expect(consoleSpy).toHaveBeenCalledWith('❌ Job job-123 failed:', error);

      consoleSpy.mockRestore();
    });
  });
});