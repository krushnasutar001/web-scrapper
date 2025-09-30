# LinkedIn Automation SaaS - Testing Guide

This document provides comprehensive information about testing the LinkedIn Automation SaaS backend, including unit tests, integration tests, and end-to-end testing with Docker.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [Docker-based Testing](#docker-based-testing)
- [Test Configuration](#test-configuration)
- [Running Tests](#running-tests)
- [Continuous Integration](#continuous-integration)
- [Troubleshooting](#troubleshooting)

## Overview

The testing suite covers:

- **Unit Tests**: Individual components, services, and utilities
- **Integration Tests**: End-to-end workflows with real database and Redis
- **API Tests**: REST API endpoints and authentication
- **Job Queue Tests**: BullMQ worker processing and job management
- **Database Tests**: PostgreSQL operations and migrations
- **File Upload Tests**: Multer file handling and validation

## Test Structure

```
backend/
├── __tests__/
│   ├── integration/
│   │   ├── job-queue.integration.test.js
│   │   └── docker-compose.test.yml
│   ├── job-creation.test.js
│   ├── worker.test.js
│   ├── results-api.test.js
│   ├── setup.js
│   ├── integration.setup.js
│   └── env.setup.js
├── scripts/
│   └── run-integration-tests.js
├── jest.config.js
└── README-TESTING.md
```

## Unit Tests

Unit tests focus on individual components and use mocked dependencies.

### Job Creation Tests (`job-creation.test.js`)

Tests the complete job creation flow:

- ✅ Successful job creation with credit deduction
- ✅ Insufficient credits handling
- ✅ Concurrent job limit enforcement
- ✅ LinkedIn account availability
- ✅ Input validation
- ✅ Database transaction rollback
- ✅ JWT authentication
- ✅ Credit calculation for different job types
- ✅ Bulk job creation with file uploads

### Worker Tests (`worker.test.js`)

Tests the BullMQ worker functionality:

- ✅ Worker initialization and event listeners
- ✅ Profile, company, and search scraping jobs
- ✅ Error handling and recovery
- ✅ Browser management (Puppeteer/Playwright)
- ✅ Database operations
- ✅ Graceful shutdown

### Results API Tests (`results-api.test.js`)

Tests the results API endpoints:

- ✅ JWT authentication and authorization
- ✅ Result submission (JSON format)
- ✅ File uploads (JSON, CSV, Excel)
- ✅ Progress updates
- ✅ Error reporting
- ✅ Result retrieval with pagination

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test job-creation.test.js
```

## Integration Tests

Integration tests use real PostgreSQL and Redis instances to test complete workflows.

### Job Queue Integration Tests

The main integration test (`job-queue.integration.test.js`) covers:

- **End-to-End Job Processing**: Complete job lifecycle from creation to completion
- **Database Operations**: Real PostgreSQL transactions and queries
- **Queue Management**: BullMQ job processing with Redis
- **File Handling**: Actual file uploads and processing
- **Error Scenarios**: Network failures, service unavailability
- **Concurrent Processing**: Multiple jobs and workers

### Test Scenarios

1. **Successful Job Processing**
   - Create job via API
   - Verify database records
   - Process job with worker
   - Validate results

2. **Error Handling**
   - Insufficient credits
   - Concurrent job limits
   - Service failures
   - Invalid inputs

3. **File Operations**
   - Bulk job creation with CSV
   - Result file uploads
   - File retrieval and validation

### Running Integration Tests

```bash
# Run integration tests (requires running services)
npm run test:integration

# Run with Docker (recommended)
npm run test:integration:docker
```

## Docker-based Testing

The most reliable way to run integration tests is using Docker Compose, which provides isolated test environments.

### Test Services

The `docker-compose.test.yml` includes:

- **PostgreSQL**: Test database with migrations
- **Redis**: Queue and caching service
- **Backend API**: Application server
- **Worker**: Job processing service
- **BullMQ Dashboard**: Queue monitoring (optional)

### Running Docker Tests

```bash
# Run complete integration test suite with Docker
npm run test:integration:docker

# Or run the script directly
node scripts/run-integration-tests.js
```

### Test Environment

The Docker test environment:

- Uses separate ports (5433 for PostgreSQL, 6380 for Redis, 5001 for API)
- Isolated test database (`linkedin_automation_test`)
- Automatic cleanup after tests
- Real browser automation with Chromium

## Test Configuration

### Jest Configuration (`jest.config.js`)

- **Projects**: Separate configurations for unit and integration tests
- **Coverage**: 70% threshold for branches, functions, lines, statements
- **Timeouts**: 30s for unit tests, 60s for integration tests
- **Setup**: Automatic mocking and environment configuration

### Environment Variables

Test-specific environment variables:

```bash
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/linkedin_automation_test
REDIS_URL=redis://localhost:6380
JWT_SECRET=test-jwt-secret-key
API_BASE_URL=http://localhost:5001
```

## Running Tests

### Local Development

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run integration tests (requires services)
docker-compose -f __tests__/integration/docker-compose.test.yml up -d
npm run test:integration

# Run all tests with Docker
npm run test:integration:docker
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:integration` | Run integration tests |
| `npm run test:integration:docker` | Run integration tests with Docker |

## Continuous Integration

The GitHub Actions workflow (`.github/workflows/ci.yml`) includes:

1. **Test Job**
   - PostgreSQL and Redis services
   - Environment setup
   - Database migrations
   - Unit and integration tests
   - Coverage reporting

2. **Code Quality**
   - ESLint and Prettier checks
   - Security audit
   - Dependency vulnerability scan

3. **Build and Deploy**
   - Docker image building
   - Security scanning with Trivy
   - Deployment to staging/production

### CI Environment

```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: linkedin_automation_test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

  redis:
    image: redis:7
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

## Troubleshooting

### Common Issues

1. **Services Not Ready**
   ```bash
   # Wait for services to start
   docker-compose -f __tests__/integration/docker-compose.test.yml up -d
   sleep 10
   ```

2. **Port Conflicts**
   ```bash
   # Check for running services
   netstat -tulpn | grep :5432
   netstat -tulpn | grep :6379
   ```

3. **Database Connection Issues**
   ```bash
   # Test database connection
   psql -h localhost -p 5433 -U postgres -d linkedin_automation_test
   ```

4. **Redis Connection Issues**
   ```bash
   # Test Redis connection
   redis-cli -h localhost -p 6380 ping
   ```

### Debug Mode

Enable debug logging:

```bash
# Enable test logs
ENABLE_TEST_LOGS=true npm test

# Enable debug mode for integration tests
DEBUG=true npm run test:integration:docker
```

### Cleanup

```bash
# Stop and remove test containers
docker-compose -f __tests__/integration/docker-compose.test.yml down -v

# Remove test volumes
docker volume prune

# Clean up test files
rm -rf __tests__/temp/
rm -rf test-results/
```

## Test Coverage

Current coverage targets:

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

### Coverage Report

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Cleanup**: Always clean up resources after tests
3. **Mocking**: Use mocks for external dependencies in unit tests
4. **Real Services**: Use real services for integration tests
5. **Error Testing**: Test both success and failure scenarios
6. **Performance**: Keep tests fast and efficient
7. **Documentation**: Document complex test scenarios

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Add both unit and integration tests for new features
3. Maintain test coverage above 70%
4. Update this documentation for new test scenarios
5. Ensure tests pass in CI environment

For questions or issues, please refer to the main project documentation or create an issue in the repository.