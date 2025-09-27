/**
 * Scralytics Hub - Test Data Setup
 * Creates test users and LinkedIn accounts for multi-user testing environment
 */

const { query, transaction } = require('./utils/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

class TestDataSetup {
  
  /**
   * Create test users for multi-user testing
   */
  static async createTestUsers() {
    console.log('🔧 Setting up test users...');
    
    try {
      // User A - ID: 101
      const userA = {
        id: '101',
        email: 'user_a@scralytics.com',
        password: 'TestPassword123!',
        name: 'Test User A',
        credits: 5000
      };
      
      // User B - ID: 202  
      const userB = {
        id: '202',
        email: 'user_b@scralytics.com', 
        password: 'TestPassword123!',
        name: 'Test User B',
        credits: 3000
      };
      
      const users = [userA, userB];
      
      for (const user of users) {
        // Check if user already exists
        const existingUser = await query('SELECT id FROM users WHERE id = ? OR email = ?', [user.id, user.email]);
        
        if (existingUser.length > 0) {
          console.log(`⚠️  User ${user.name} (${user.email}) already exists, skipping...`);
          continue;
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(user.password, 10);
        
        // Insert user
        await query(`
          INSERT INTO users (id, email, password_hash, name, credits, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())
        `, [user.id, user.email, passwordHash, user.name, user.credits]);
        
        console.log(`✅ Created user: ${user.name} (ID: ${user.id}) with ${user.credits} credits`);
      }
      
      return { userA, userB };
    } catch (error) {
      console.error('❌ Error creating test users:', error);
      throw error;
    }
  }
  
  /**
   * Create LinkedIn accounts for test users
   */
  static async createLinkedInAccounts() {
    console.log('🔧 Setting up LinkedIn accounts...');
    
    try {
      const accounts = [
        // User A accounts
        {
          id: uuidv4(),
          user_id: '101',
          account_name: 'Recruiter A Account',
          email: 'recruiter_a@company.com',
          chrome_profile_path: 'C:\\Chrome\\Profiles\\RecruiterA',
          validation_status: 'ACTIVE'
        },
        {
          id: uuidv4(),
          user_id: '101', 
          account_name: 'Sales B Account',
          email: 'sales_b@company.com',
          chrome_profile_path: 'C:\\Chrome\\Profiles\\SalesB',
          validation_status: 'ACTIVE'
        },
        // User B account
        {
          id: uuidv4(),
          user_id: '202',
          account_name: 'Marketing X Account', 
          email: 'marketing_x@gmail.com',
          chrome_profile_path: 'C:\\Chrome\\Profiles\\MarketingX',
          validation_status: 'ACTIVE'
        }
      ];
      
      for (const account of accounts) {
        // Check if account already exists
        const existingAccount = await query(
          'SELECT id FROM linkedin_accounts WHERE user_id = ? AND email = ?', 
          [account.user_id, account.email]
        );
        
        if (existingAccount.length > 0) {
          console.log(`⚠️  LinkedIn account ${account.email} already exists for user ${account.user_id}, skipping...`);
          continue;
        }
        
        // Insert LinkedIn account
        await query(`
          INSERT INTO linkedin_accounts (
            id, user_id, account_name, email, chrome_profile_path,
            is_active, validation_status, daily_request_limit, 
            requests_today, consecutive_failures, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, TRUE, ?, 150, 0, 0, NOW(), NOW())
        `, [
          account.id, account.user_id, account.account_name, 
          account.email, account.chrome_profile_path, account.validation_status
        ]);
        
        console.log(`✅ Created LinkedIn account: ${account.account_name} (${account.email}) for user ${account.user_id}`);
      }
      
      return accounts;
    } catch (error) {
      console.error('❌ Error creating LinkedIn accounts:', error);
      throw error;
    }
  }
  
  /**
   * Create test jobs for multi-user testing
   */
  static async createTestJobs() {
    console.log('🔧 Setting up test jobs...');
    
    try {
      // Get LinkedIn accounts for job assignment
      const userAAccounts = await query('SELECT id, email FROM linkedin_accounts WHERE user_id = ?', ['101']);
      const userBAccounts = await query('SELECT id, email FROM linkedin_accounts WHERE user_id = ?', ['202']);
      
      if (userAAccounts.length < 2) {
        throw new Error('User A must have at least 2 LinkedIn accounts');
      }
      if (userBAccounts.length < 1) {
        throw new Error('User B must have at least 1 LinkedIn account');
      }
      
      const jobs = [
        // User A jobs
        {
          id: '1001',
          user_id: '101',
          job_name: 'Profile Scraping Job 1001',
          job_type: 'profile',
          linkedin_account_id: userAAccounts.find(acc => acc.email === 'recruiter_a@company.com')?.id,
          max_results: 50,
          total_urls: 50,
          configuration: {
            selectedAccountIds: [userAAccounts.find(acc => acc.email === 'recruiter_a@company.com')?.id],
            scrapeFields: ['name', 'title', 'company', 'location']
          }
        },
        {
          id: '1002', 
          user_id: '101',
          job_name: 'Company Scraping Job 1002',
          job_type: 'company',
          linkedin_account_id: userAAccounts.find(acc => acc.email === 'sales_b@company.com')?.id,
          max_results: 20,
          total_urls: 20,
          configuration: {
            selectedAccountIds: [userAAccounts.find(acc => acc.email === 'sales_b@company.com')?.id],
            scrapeFields: ['name', 'industry', 'size', 'location']
          }
        },
        // User B job
        {
          id: '1003',
          user_id: '202', 
          job_name: 'Job Post Scraping Job 1003',
          job_type: 'job_post',
          linkedin_account_id: userBAccounts[0].id,
          max_results: 30,
          total_urls: 30,
          configuration: {
            selectedAccountIds: [userBAccounts[0].id],
            scrapeFields: ['title', 'company', 'location', 'description']
          }
        }
      ];
      
      for (const job of jobs) {
        // Check if job already exists
        const existingJob = await query('SELECT id FROM scraping_jobs WHERE id = ?', [job.id]);
        
        if (existingJob.length > 0) {
          console.log(`⚠️  Job ${job.id} already exists, skipping...`);
          continue;
        }
        
        // Insert job
        await query(`
          INSERT INTO scraping_jobs (
            id, user_id, job_name, job_type, linkedin_account_id,
            status, max_results, total_urls, configuration,
            processed_urls, successful_urls, failed_urls, result_count,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0, 0, 0, 0, NOW(), NOW())
        `, [
          job.id, job.user_id, job.job_name, job.job_type, job.linkedin_account_id,
          job.max_results, job.total_urls, JSON.stringify(job.configuration)
        ]);
        
        console.log(`✅ Created job: ${job.job_name} (ID: ${job.id}) for user ${job.user_id}`);
        
        // Add job to queue
        await query(`
          INSERT INTO job_queue (
            id, job_id, user_id, linkedin_account_id, status, priority, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'queued', 0, NOW(), NOW())
        `, [uuidv4(), job.id, job.user_id, job.linkedin_account_id]);
        
        console.log(`✅ Added job ${job.id} to processing queue`);
      }
      
      return jobs;
    } catch (error) {
      console.error('❌ Error creating test jobs:', error);
      throw error;
    }
  }
  
  /**
   * Validate test environment setup
   */
  static async validateSetup() {
    console.log('🔍 Validating test environment setup...');
    
    try {
      // Check users
      const users = await query('SELECT id, email, name, credits FROM users WHERE id IN (?, ?)', ['101', '202']);
      console.log(`✅ Found ${users.length} test users:`);
      users.forEach(user => {
        console.log(`   - ${user.name} (${user.email}): ${user.credits} credits`);
      });
      
      // Check LinkedIn accounts
      const accounts = await query(`
        SELECT la.user_id, la.account_name, la.email, la.validation_status 
        FROM linkedin_accounts la 
        WHERE la.user_id IN (?, ?) 
        ORDER BY la.user_id, la.email
      `, ['101', '202']);
      
      console.log(`✅ Found ${accounts.length} LinkedIn accounts:`);
      accounts.forEach(account => {
        console.log(`   - User ${account.user_id}: ${account.account_name} (${account.email}) - ${account.validation_status}`);
      });
      
      // Check jobs
      const jobs = await query(`
        SELECT sj.id, sj.user_id, sj.job_name, sj.job_type, sj.status, sj.total_urls
        FROM scraping_jobs sj 
        WHERE sj.id IN (?, ?, ?)
        ORDER BY sj.id
      `, ['1001', '1002', '1003']);
      
      console.log(`✅ Found ${jobs.length} test jobs:`);
      jobs.forEach(job => {
        console.log(`   - Job ${job.id}: ${job.job_name} (${job.job_type}) - ${job.status} - ${job.total_urls} URLs`);
      });
      
      // Check job queue
      const queueItems = await query(`
        SELECT jq.job_id, jq.user_id, jq.status, jq.priority
        FROM job_queue jq 
        WHERE jq.job_id IN (?, ?, ?)
        ORDER BY jq.job_id
      `, ['1001', '1002', '1003']);
      
      console.log(`✅ Found ${queueItems.length} jobs in queue:`);
      queueItems.forEach(item => {
        console.log(`   - Job ${item.job_id}: User ${item.user_id} - ${item.status} (Priority: ${item.priority})`);
      });
      
      return {
        users: users.length,
        accounts: accounts.length, 
        jobs: jobs.length,
        queueItems: queueItems.length
      };
      
    } catch (error) {
      console.error('❌ Error validating setup:', error);
      throw error;
    }
  }
  
  /**
   * Run complete test environment setup
   */
  static async setupTestEnvironment() {
    console.log('🚀 Starting Scralytics Hub test environment setup...');
    
    try {
      // Step 1: Create test users
      await this.createTestUsers();
      
      // Step 2: Create LinkedIn accounts
      await this.createLinkedInAccounts();
      
      // Step 3: Create test jobs
      await this.createTestJobs();
      
      // Step 4: Validate setup
      const validation = await this.validateSetup();
      
      console.log('🎉 Test environment setup completed successfully!');
      console.log(`📊 Summary: ${validation.users} users, ${validation.accounts} accounts, ${validation.jobs} jobs, ${validation.queueItems} queue items`);
      
      return validation;
      
    } catch (error) {
      console.error('❌ Test environment setup failed:', error);
      throw error;
    }
  }
  
  /**
   * Clean up test data
   */
  static async cleanupTestData() {
    console.log('🧹 Cleaning up test data...');
    
    try {
      // Delete in reverse order due to foreign key constraints
      await query('DELETE FROM job_queue WHERE job_id IN (?, ?, ?)', ['1001', '1002', '1003']);
      await query('DELETE FROM scraping_profiles WHERE job_id IN (?, ?, ?)', ['1001', '1002', '1003']);
      await query('DELETE FROM scraping_jobs WHERE id IN (?, ?, ?)', ['1001', '1002', '1003']);
      await query('DELETE FROM linkedin_accounts WHERE user_id IN (?, ?)', ['101', '202']);
      await query('DELETE FROM users WHERE id IN (?, ?)', ['101', '202']);
      
      console.log('✅ Test data cleanup completed');
      
    } catch (error) {
      console.error('❌ Error cleaning up test data:', error);
      throw error;
    }
  }
}

module.exports = TestDataSetup;

// Run setup if called directly
if (require.main === module) {
  TestDataSetup.setupTestEnvironment()
    .then(() => {
      console.log('✅ Test environment ready for multi-user testing!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}