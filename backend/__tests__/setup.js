// General test setup for unit tests
const { Pool } = require('pg');
const Redis = require('ioredis');

// Mock external dependencies by default
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn(),
      evaluate: jest.fn(),
      close: jest.fn()
    }),
    close: jest.fn()
  })
}));

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn(),
        evaluate: jest.fn(),
        close: jest.fn()
      }),
      close: jest.fn()
    })
  }
}));

// Mock BullMQ by default
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJobs: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue()
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue()
  }))
}));

// Global test utilities
global.createMockPool = () => ({
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn()
  }),
  end: jest.fn()
});

global.createMockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  disconnect: jest.fn()
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global timeout for all tests
jest.setTimeout(30000);