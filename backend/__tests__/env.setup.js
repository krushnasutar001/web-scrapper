// Environment setup for Jest tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/linkedin_automation_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PLAYWRIGHT_BROWSERS_PATH = '/tmp/playwright';

// Disable console.log during tests unless explicitly enabled
if (!process.env.ENABLE_TEST_LOGS) {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
}