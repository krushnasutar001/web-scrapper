#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const DOCKER_COMPOSE_FILE = path.join(__dirname, '../__tests__/integration/docker-compose.test.yml');
const PROJECT_NAME = 'linkedin-automation-test';
const TIMEOUT = 300000; // 5 minutes

class IntegrationTestRunner {
  constructor() {
    this.services = [];
    this.cleanup = [];
  }

  async run() {
    console.log('🚀 Starting LinkedIn Automation Integration Tests');
    console.log('================================================');

    try {
      await this.checkPrerequisites();
      await this.setupEnvironment();
      await this.startServices();
      await this.waitForServices();
      await this.runMigrations();
      await this.runTests();
      
      console.log('✅ All integration tests passed!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Integration tests failed:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check if Docker is installed and running
    try {
      await this.execCommand('docker --version');
      await this.execCommand('docker-compose --version');
    } catch (error) {
      throw new Error('Docker and Docker Compose are required but not found');
    }

    // Check if docker-compose file exists
    try {
      await fs.access(DOCKER_COMPOSE_FILE);
    } catch (error) {
      throw new Error(`Docker Compose file not found: ${DOCKER_COMPOSE_FILE}`);
    }

    console.log('✅ Prerequisites check passed');
  }

  async setupEnvironment() {
    console.log('🔧 Setting up test environment...');

    // Create necessary directories
    const dirs = [
      path.join(__dirname, '../uploads'),
      path.join(__dirname, '../logs'),
      path.join(__dirname, '../results'),
      path.join(__dirname, '../tmp'),
      path.join(__dirname, '../cookies'),
      path.join(__dirname, '../test-results'),
      path.join(__dirname, '../__tests__/temp')
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    }

    // Create test environment file
    const envContent = `
# Integration Test Environment
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/linkedin_automation_test
REDIS_URL=redis://localhost:6380
JWT_SECRET=test-jwt-secret-key-for-integration-tests
API_BASE_URL=http://localhost:5001
JEST_TIMEOUT=30000
TEST_TIMEOUT=60000
`;

    await fs.writeFile(path.join(__dirname, '../.env.test'), envContent.trim());

    console.log('✅ Test environment setup complete');
  }

  async startServices() {
    console.log('🐳 Starting Docker services...');

    // Stop any existing services
    try {
      await this.execCommand(
        `docker-compose -f ${DOCKER_COMPOSE_FILE} -p ${PROJECT_NAME} down -v --remove-orphans`
      );
    } catch (error) {
      // Services might not be running
    }

    // Start services
    await this.execCommand(
      `docker-compose -f ${DOCKER_COMPOSE_FILE} -p ${PROJECT_NAME} up -d postgres-test redis-test`
    );

    console.log('✅ Core services started');
  }

  async waitForServices() {
    console.log('⏳ Waiting for services to be ready...');

    const maxRetries = 30;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Check PostgreSQL
        await this.execCommand(
          `docker-compose -f ${DOCKER_COMPOSE_FILE} -p ${PROJECT_NAME} exec -T postgres-test pg_isready -U postgres -d linkedin_automation_test`
        );

        // Check Redis
        await this.execCommand(
          `docker-compose -f ${DOCKER_COMPOSE_FILE} -p ${PROJECT_NAME} exec -T redis-test redis-cli ping`
        );

        console.log('✅ All services are ready');
        return;
      } catch (error) {
        retries++;
        console.log(`⏳ Waiting for services... (${retries}/${maxRetries})`);
        await this.sleep(2000);
      }
    }

    throw new Error('Services failed to start within timeout');
  }

  async runMigrations() {
    console.log('📊 Running database migrations...');

    try {
      // Copy migration files to container
      const migrationFiles = [
        '001_create_job_queue_tables.sql',
        '002_enhance_users_table.sql',
        '003_enhance_linkedin_accounts_table.sql'
      ];

      for (const file of migrationFiles) {
        const migrationPath = path.join(__dirname, '../database/migrations', file);
        
        try {
          await fs.access(migrationPath);
          
          // Execute migration
          await this.execCommand(
            `docker-compose -f ${DOCKER_COMPOSE_FILE} -p ${PROJECT_NAME} exec -T postgres-test psql -U postgres -d linkedin_automation_test -f /docker-entrypoint-initdb.d/${file}`
          );
          
          console.log(`✅ Applied migration: ${file}`);
        } catch (error) {
          console.log(`⚠️ Migration ${file} failed or already applied:`, error.message);
        }
      }
    } catch (error) {
      console.log('⚠️ Migration setup completed with warnings:', error.message);
    }

    console.log('✅ Database migrations complete');
  }

  async runTests() {
    console.log('🧪 Running integration tests...');

    // Start backend and worker services
    await this.execCommand(
      `docker-compose -f ${DOCKER_COMPOSE_FILE} -p ${PROJECT_NAME} up -d backend-test worker-test`
    );

    // Wait for backend to be ready
    await this.waitForBackend();

    // Run tests
    const testCommand = process.platform === 'win32' 
      ? 'npm.cmd run test:integration'
      : 'npm run test:integration';

    await this.execCommand(testCommand, {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/linkedin_automation_test',
        REDIS_URL: 'redis://localhost:6380',
        API_BASE_URL: 'http://localhost:5001',
        JWT_SECRET: 'test-jwt-secret-key-for-integration-tests'
      }
    });

    console.log('✅ Integration tests completed successfully');
  }

  async waitForBackend() {
    console.log('⏳ Waiting for backend to be ready...');

    const maxRetries = 30;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        await this.execCommand('curl -f http://localhost:5001/health');
        console.log('✅ Backend is ready');
        return;
      } catch (error) {
        retries++;
        console.log(`⏳ Waiting for backend... (${retries}/${maxRetries})`);
        await this.sleep(2000);
      }
    }

    throw new Error('Backend failed to start within timeout');
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');

    try {
      // Stop and remove all services
      await this.execCommand(
        `docker-compose -f ${DOCKER_COMPOSE_FILE} -p ${PROJECT_NAME} down -v --remove-orphans`
      );

      // Remove test environment file
      try {
        await fs.unlink(path.join(__dirname, '../.env.test'));
      } catch (error) {
        // File might not exist
      }

      console.log('✅ Cleanup complete');
    } catch (error) {
      console.error('⚠️ Cleanup failed:', error.message);
    }
  }

  async execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const child = exec(command, {
        timeout: TIMEOUT,
        ...options
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${command}\n${error.message}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      // Log output in real-time for long-running commands
      if (command.includes('test') || command.includes('up')) {
        child.stdout?.on('data', (data) => {
          process.stdout.write(data);
        });

        child.stderr?.on('data', (data) => {
          process.stderr.write(data);
        });
      }
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  const runner = new IntegrationTestRunner();
  await runner.cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, cleaning up...');
  const runner = new IntegrationTestRunner();
  await runner.cleanup();
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  const runner = new IntegrationTestRunner();
  runner.run().catch(console.error);
}

module.exports = IntegrationTestRunner;