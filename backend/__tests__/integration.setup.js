// Integration test setup
const { Pool } = require('pg');
const Redis = require('ioredis');

// Don't mock external dependencies for integration tests
jest.unmock('bullmq');
jest.unmock('pg');
jest.unmock('ioredis');

// Global test database and Redis connections
let testPool;
let testRedis;

beforeAll(async () => {
  // Wait a bit for services to be ready
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Initialize test database connection
  testPool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  // Initialize test Redis connection
  testRedis = new Redis(process.env.REDIS_URL);
  
  // Test connections
  try {
    await testPool.query('SELECT 1');
    await testRedis.ping();
    console.log('✅ Test database and Redis connections established');
  } catch (error) {
    console.error('❌ Failed to connect to test services:', error.message);
    throw error;
  }
});

afterAll(async () => {
  // Clean up connections
  if (testPool) {
    await testPool.end();
  }
  if (testRedis) {
    await testRedis.disconnect();
  }
});

// Make connections available globally
global.testPool = testPool;
global.testRedis = testRedis;

// Increase timeout for integration tests
jest.setTimeout(60000);