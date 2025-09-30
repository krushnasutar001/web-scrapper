module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    '!src/worker.js', // Exclude worker from coverage (tested in integration)
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!coverage/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Transform configuration
  transform: {},
  
  // Environment variables for tests
  setupFiles: ['<rootDir>/__tests__/env.setup.js'],
  
  // Projects for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/__tests__/**/*.test.js',
        '!<rootDir>/__tests__/integration/**'
      ],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.js'],
      testEnvironment: 'node',
      testTimeout: 60000,
      setupFilesAfterEnv: ['<rootDir>/__tests__/integration.setup.js']
    }
  ],
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Maximum worker processes
  maxWorkers: '50%'
};