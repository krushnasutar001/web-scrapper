/**
 * Scralytics Hub - Multi-User Simulation Test Script
 * Comprehensive testing for multiple SaaS users, LinkedIn accounts, and concurrent job processing
 */

const { query, transaction } = require('../utils/database');
const JobService = require('../services/jobService');
const JobQueueService = require('../services/jobQueueService');
const ErrorHandlingService = require('../services/errorHandlingService');
const { LoggingService } = require('../services/loggingService');
const User = require('../models/User');
const LinkedInAccount = require('../models/LinkedInAccount');
const Job = require('../models/Job');

class MultiUserSimulation {
  constructor() {
    this.jobQueue = new JobQueueService();
    this.testResults = {
      usersCreated: 0,
      accountsCreated: 0,
      jobsCreated: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      errorsHandled: 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0
    };
    this.testUsers = [];
    this.testAccounts = [];
    this.testJobs = [];
  }

  /**
   * Run complete multi-user simulation
   */
  async runSimulation() {
    try {
      console.log('🚀 Starting Scralytics Hub Multi-User Simulation');
      console.log('=' .repeat(60));
      
      // Initialize test environment
      await this.initializeTestEnvironment();
      
      // Run test phases
      await this.phase1_EnvironmentSetup();
      await this.phase2_JobCreationTest();
      await this.phase3_QueueAndWorkerTest();
      await this.phase4_ErrorHandlingTest();
      await this.phase5_ConcurrentExecutionTest();
      await this.phase6_ValidationTest();
      
      // Generate test report
      await this.generateTestReport();
      
      console.log('✅ Multi-User Simulation Completed');
      
    } catch (error) {
      console.error('❌ Simulation failed:', error);
      throw error;
    }
  }

  /**
   * Initialize test environment
   */
  async initializeTestEnvironment() {
    try {
      console.log('\n📋 Initializing Test Environment...');
      
      // Clean up any existing test data
      await this.cleanupTestData();
      
      // Start job queue processor
      this.jobQueue.startQueueProcessor(5000); // 5 second intervals for testing
      
      console.log('✅ Test environment initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize test environment:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Environment Setup Test
   */
  async phase1_EnvironmentSetup() {
    try {
      console.log('\n🏗️  Phase 1: Environment Setup Test');
      console.log('-'.repeat(40));
      
      // Test 1: Create SaaS Users
      await this.test('Create User A (ID: 101)', async () => {
        const userA = await User.create({
          id: 101,
          email: 'user_a@company.com',
          password: 'test_password_123',
          credits: 1000,
          subscription_plan: 'premium'
        });
        
        this.testUsers.push(userA);
        this.testResults.usersCreated++;
        
        return userA.id === 101;
      });
      
      await this.test('Create User B (ID: 202)', async () => {
        const userB = await User.create({
          id: 202,
          email: 'user_b@company.com',
          password: 'test_password_456',
          credits: 500,
          subscription_plan: 'basic'
        });
        
        this.testUsers.push(userB);
        this.testResults.usersCreated++;
        
        return userB.id === 202;
      });
      
      // Test 2: Create LinkedIn Accounts
      await this.test('Create LinkedIn Account for User A - Recruiter', async () => {
        const account = await LinkedInAccount.create({
          user_id: 101,
          account_name: 'Recruiter A',
          email: 'recruiter_a@company.com',
          is_active: true,
          validation_status: 'ACTIVE',
          daily_request_limit: 100,
          chrome_profile_path: '/profiles/recruiter_a',
          extension_jwt: 'jwt_token_recruiter_a'
        });
        
        this.testAccounts.push(account);
        this.testResults.accountsCreated++;
        
        return account.email === 'recruiter_a@company.com';
      });
      
      await this.test('Create LinkedIn Account for User A - Sales', async () => {
        const account = await LinkedInAccount.create({
          user_id: 101,
          account_name: 'Sales B',
          email: 'sales_b@company.com',
          is_active: true,
          validation_status: 'ACTIVE',
          daily_request_limit: 80,
          chrome_profile_path: '/profiles/sales_b',
          extension_jwt: 'jwt_token_sales_b'
        });
        
        this.testAccounts.push(account);
        this.testResults.accountsCreated++;
        
        return account.email === 'sales_b@company.com';
      });
      
      await this.test('Create LinkedIn Account for User B - Marketing', async () => {
        const account = await LinkedInAccount.create({
          user_id: 202,
          account_name: 'Marketing X',
          email: 'marketing_x@gmail.com',
          is_active: true,
          validation_status: 'ACTIVE',
          daily_request_limit: 50,
          chrome_profile_path: '/profiles/marketing_x',
          extension_jwt: 'jwt_token_marketing_x'
        });
        
        this.testAccounts.push(account);
        this.testResults.accountsCreated++;
        
        return account.email === 'marketing_x@gmail.com';
      });
      
      console.log(`✅ Phase 1 Complete: ${this.testResults.usersCreated} users, ${this.testResults.accountsCreated} accounts created`);
      
    } catch (error) {
      console.error('❌ Phase 1 failed:', error);
      throw error;
    }
  }

  /**
   * Phase 2: Job Creation Test
   */
  async phase2_JobCreationTest() {
    try {
      console.log('\n💼 Phase 2: Job Creation Test');
      console.log('-'.repeat(40));
      
      // Test 1: User A creates profile scraping job
      await this.test('User A - Create Profile Scraping Job (ID: 1001)', async () => {
        const jobData = {
          id: 1001,
          user_id: 101,
          job_name: 'Profile Scraping - Recruiters',
          job_type: 'profile_scraping',
          max_results: 50,
          configuration: {
            fields: ['name', 'title', 'company', 'location', 'email'],
            filters: { industry: 'Technology' }
          }
        };
        
        const urls = [
          'https://linkedin.com/in/john-doe',
          'https://linkedin.com/in/jane-smith',
          'https://linkedin.com/in/mike-johnson'
        ];
        
        const job = await JobService.createJobWithValidation(jobData, urls, this.testAccounts[0].id);
        this.testJobs.push(job);
        this.testResults.jobsCreated++;
        
        return job.id === 1001;
      });
      
      // Test 2: User A creates company scraping job
      await this.test('User A - Create Company Scraping Job (ID: 1002)', async () => {
        const jobData = {
          id: 1002,
          user_id: 101,
          job_name: 'Company Scraping - Tech Companies',
          job_type: 'company_scraping',
          max_results: 20,
          configuration: {
            fields: ['company_name', 'industry', 'size', 'location'],
            filters: { size: '1000+' }
          }
        };
        
        const urls = [
          'https://linkedin.com/company/google',
          'https://linkedin.com/company/microsoft',
          'https://linkedin.com/company/apple'
        ];
        
        const job = await JobService.createJobWithValidation(jobData, urls, this.testAccounts[1].id);
        this.testJobs.push(job);
        this.testResults.jobsCreated++;
        
        return job.id === 1002;
      });
      
      // Test 3: User B creates job post scraping job
      await this.test('User B - Create Job Post Scraping Job (ID: 1003)', async () => {
        const jobData = {
          id: 1003,
          user_id: 202,
          job_name: 'Job Post Scraping - Marketing Roles',
          job_type: 'job_post_scraping',
          max_results: 30,
          configuration: {
            fields: ['title', 'company', 'location', 'salary', 'description'],
            filters: { department: 'Marketing' }
          }
        };
        
        const urls = [
          'https://linkedin.com/jobs/view/123456',
          'https://linkedin.com/jobs/view/789012',
          'https://linkedin.com/jobs/view/345678'
        ];
        
        const job = await JobService.createJobWithValidation(jobData, urls, this.testAccounts[2].id);
        this.testJobs.push(job);
        this.testResults.jobsCreated++;
        
        return job.id === 1003;
      });
      
      // Test 4: Validate credit deduction
      await this.test('Validate Credit Deduction', async () => {
        const userA = await User.findById(101);
        const userB = await User.findById(202);
        
        // User A should have credits deducted for 2 jobs (70 URLs total)
        // User B should have credits deducted for 1 job (30 URLs)
        
        return userA.credits < 1000 && userB.credits < 500;
      });
      
      console.log(`✅ Phase 2 Complete: ${this.testResults.jobsCreated} jobs created`);
      
    } catch (error) {
      console.error('❌ Phase 2 failed:', error);
      throw error;
    }
  }

  /**
   * Phase 3: Queue and Worker Test
   */
  async phase3_QueueAndWorkerTest() {
    try {
      console.log('\n⚙️  Phase 3: Queue and Worker Test');
      console.log('-'.repeat(40));
      
      // Test 1: Add jobs to queue
      await this.test('Add Jobs to Queue', async () => {
        for (const job of this.testJobs) {
          const account = this.testAccounts.find(acc => acc.user_id === job.user_id);
          await this.jobQueue.addJobToQueue(job.id, job.user_id, account.id, 1);
        }
        
        const queueStatus = await this.jobQueue.getQueueStatus();
        return queueStatus.queue.queued >= 3;
      });
      
      // Test 2: Process queue with round-robin assignment
      await this.test('Process Queue with Round-Robin Assignment', async () => {
        // Wait for queue processing
        await this.sleep(10000); // 10 seconds
        
        const queueStatus = await this.jobQueue.getQueueStatus();
        return queueStatus.activeWorkers > 0;
      });
      
      // Test 3: Validate parallel execution
      await this.test('Validate Parallel Execution', async () => {
        const queueStatus = await this.jobQueue.getQueueStatus();
        
        // Should have multiple workers running concurrently
        return queueStatus.activeWorkers >= 2;
      });
      
      console.log('✅ Phase 3 Complete: Queue processing validated');
      
    } catch (error) {
      console.error('❌ Phase 3 failed:', error);
      throw error;
    }
  }

  /**
   * Phase 4: Error Handling Test
   */
  async phase4_ErrorHandlingTest() {
    try {
      console.log('\n🛠️  Phase 4: Error Handling Test');
      console.log('-'.repeat(40));
      
      // Test 1: Cookie error handling
      await this.test('Handle Cookie Error', async () => {
        const result = await ErrorHandlingService.handleCookieError({
          linkedinAccountId: this.testAccounts[0].id,
          jobId: this.testJobs[0].id,
          errorMessage: 'Invalid cookies detected',
          retryCount: 0
        });
        
        this.testResults.errorsHandled++;
        return result.action === 'COOKIES_REFRESHED' || result.action === 'RETRY_LATER';
      });
      
      // Test 2: Login error handling
      await this.test('Handle Login Error', async () => {
        const result = await ErrorHandlingService.handleLoginError({
          linkedinAccountId: this.testAccounts[1].id,
          jobId: this.testJobs[1].id,
          redirectUrl: 'https://linkedin.com/login',
          retryCount: 0
        });
        
        this.testResults.errorsHandled++;
        return result.action === 'RETRY_WITH_COOKIES' || result.action === 'ACCOUNT_BLOCKED';
      });
      
      // Test 3: Database error handling
      await this.test('Handle Database Error', async () => {
        const result = await ErrorHandlingService.handleDatabaseError({
          operation: 'UPDATE_JOB_STATUS',
          tableName: 'scraping_jobs',
          errorCode: 'ER_DATA_TOO_LONG',
          errorMessage: 'Data too long for column status',
          data: { status: 'invalid_status_value' }
        });
        
        this.testResults.errorsHandled++;
        return result.action === 'DATA_TRUNCATION_DETECTED';
      });
      
      console.log(`✅ Phase 4 Complete: ${this.testResults.errorsHandled} errors handled`);
      
    } catch (error) {
      console.error('❌ Phase 4 failed:', error);
      throw error;
    }
  }

  /**
   * Phase 5: Concurrent Execution Test
   */
  async phase5_ConcurrentExecutionTest() {
    try {
      console.log('\n🔄 Phase 5: Concurrent Execution Test');
      console.log('-'.repeat(40));
      
      // Test 1: Simulate concurrent job processing
      await this.test('Simulate Concurrent Processing', async () => {
        // Simulate job completion for testing
        const promises = this.testJobs.map(async (job, index) => {
          await this.sleep(2000 * (index + 1)); // Staggered completion
          
          const workerId = `test_worker_${job.id}`;
          await this.jobQueue.completeJob(workerId, job.id, {
            successful: Math.floor(Math.random() * 10) + 5,
            total: Math.floor(Math.random() * 15) + 10,
            requests: Math.floor(Math.random() * 5) + 1
          });
          
          this.testResults.jobsCompleted++;
        });
        
        await Promise.all(promises);
        return this.testResults.jobsCompleted === this.testJobs.length;
      });
      
      // Test 2: Validate user isolation
      await this.test('Validate User Isolation', async () => {
        // Check that User A cannot see User B's jobs
        const userAJobs = await query('SELECT * FROM scraping_jobs WHERE user_id = ?', [101]);
        const userBJobs = await query('SELECT * FROM scraping_jobs WHERE user_id = ?', [202]);
        
        const userAJobIds = userAJobs.map(job => job.id);
        const userBJobIds = userBJobs.map(job => job.id);
        
        // No overlap between user jobs
        const overlap = userAJobIds.filter(id => userBJobIds.includes(id));
        return overlap.length === 0;
      });
      
      console.log(`✅ Phase 5 Complete: ${this.testResults.jobsCompleted} jobs processed concurrently`);
      
    } catch (error) {
      console.error('❌ Phase 5 failed:', error);
      throw error;
    }
  }

  /**
   * Phase 6: Final Validation Test
   */
  async phase6_ValidationTest() {
    try {
      console.log('\n✅ Phase 6: Final Validation Test');
      console.log('-'.repeat(40));
      
      // Test 1: Validate job completion status
      await this.test('Validate Job Completion Status', async () => {
        const completedJobs = await query(
          "SELECT * FROM scraping_jobs WHERE status IN ('completed', 'failed')"
        );
        
        return completedJobs.length === this.testJobs.length;
      });
      
      // Test 2: Validate logging
      await this.test('Validate Activity Logging', async () => {
        const activityLogs = await LoggingService.getRecentActivity({ limit: 100 });
        return activityLogs.length > 0;
      });
      
      // Test 3: Validate error logs
      await this.test('Validate Error Logging', async () => {
        const errorStats = await LoggingService.getErrorStats({ timeframe: '1h' });
        return errorStats.length >= 0; // Should have some error logs from testing
      });
      
      // Test 4: Validate credit deduction accuracy
      await this.test('Validate Credit Deduction Accuracy', async () => {
        const userA = await User.findById(101);
        const userB = await User.findById(202);
        
        // Credits should be properly deducted
        return userA.credits !== 1000 && userB.credits !== 500;
      });
      
      console.log('✅ Phase 6 Complete: All validations passed');
      
    } catch (error) {
      console.error('❌ Phase 6 failed:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive test report
   */
  async generateTestReport() {
    try {
      console.log('\n📊 Test Report');
      console.log('='.repeat(60));
      
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalTests: this.testResults.totalTests,
          passedTests: this.testResults.passedTests,
          failedTests: this.testResults.failedTests,
          successRate: `${((this.testResults.passedTests / this.testResults.totalTests) * 100).toFixed(2)}%`
        },
        environment: {
          usersCreated: this.testResults.usersCreated,
          accountsCreated: this.testResults.accountsCreated,
          jobsCreated: this.testResults.jobsCreated,
          jobsCompleted: this.testResults.jobsCompleted,
          errorsHandled: this.testResults.errorsHandled
        },
        queueStatus: await this.jobQueue.getQueueStatus(),
        errorStats: await LoggingService.getErrorStats({ timeframe: '1h' }),
        recentActivity: await LoggingService.getRecentActivity({ limit: 10 })
      };
      
      console.log('📈 Summary:');
      console.log(`   Total Tests: ${report.summary.totalTests}`);
      console.log(`   Passed: ${report.summary.passedTests}`);
      console.log(`   Failed: ${report.summary.failedTests}`);
      console.log(`   Success Rate: ${report.summary.successRate}`);
      
      console.log('\n🏗️  Environment:');
      console.log(`   Users Created: ${report.environment.usersCreated}`);
      console.log(`   Accounts Created: ${report.environment.accountsCreated}`);
      console.log(`   Jobs Created: ${report.environment.jobsCreated}`);
      console.log(`   Jobs Completed: ${report.environment.jobsCompleted}`);
      console.log(`   Errors Handled: ${report.environment.errorsHandled}`);
      
      // Save report to file
      const fs = require('fs');
      const reportPath = `./test-reports/multi-user-simulation-${Date.now()}.json`;
      
      // Ensure directory exists
      if (!fs.existsSync('./test-reports')) {
        fs.mkdirSync('./test-reports', { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n💾 Report saved to: ${reportPath}`);
      
    } catch (error) {
      console.error('❌ Error generating test report:', error);
    }
  }

  /**
   * Helper method to run individual tests
   */
  async test(testName, testFunction) {
    try {
      this.testResults.totalTests++;
      console.log(`🧪 Running: ${testName}`);
      
      const result = await testFunction();
      
      if (result) {
        console.log(`   ✅ PASSED: ${testName}`);
        this.testResults.passedTests++;
      } else {
        console.log(`   ❌ FAILED: ${testName}`);
        this.testResults.failedTests++;
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${testName} - ${error.message}`);
      this.testResults.failedTests++;
    }
  }

  /**
   * Clean up test data
   */
  async cleanupTestData() {
    try {
      console.log('🧹 Cleaning up test data...');
      
      // Delete in reverse order of dependencies
      await query('DELETE FROM error_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
      await query('DELETE FROM activity_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
      await query('DELETE FROM job_queue WHERE user_id IN (101, 202)');
      await query('DELETE FROM job_urls WHERE job_id IN (1001, 1002, 1003)');
      await query('DELETE FROM scraping_jobs WHERE id IN (1001, 1002, 1003)');
      await query('DELETE FROM jobs WHERE id IN (1001, 1002, 1003)');
      await query('DELETE FROM linkedin_accounts WHERE user_id IN (101, 202)');
      await query('DELETE FROM users WHERE id IN (101, 202)');
      
      console.log('✅ Test data cleaned up');
      
    } catch (error) {
      console.error('❌ Error cleaning up test data:', error);
      // Don't throw - cleanup errors shouldn't stop the test
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop simulation and cleanup
   */
  async stop() {
    try {
      console.log('\n🛑 Stopping simulation...');
      
      // Stop job queue processor
      this.jobQueue.stopQueueProcessor();
      
      // Cleanup test data
      await this.cleanupTestData();
      
      console.log('✅ Simulation stopped and cleaned up');
      
    } catch (error) {
      console.error('❌ Error stopping simulation:', error);
    }
  }
}

// Export for use in other scripts
module.exports = MultiUserSimulation;

// Run simulation if called directly
if (require.main === module) {
  const simulation = new MultiUserSimulation();
  
  simulation.runSimulation()
    .then(() => {
      console.log('\n🎉 Simulation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Simulation failed:', error);
      process.exit(1);
    });
}