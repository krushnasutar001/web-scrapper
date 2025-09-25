/**
 * Test Script for Improved LinkedIn Scraper
 * Tests the enhanced scraping system with database validation and authentication
 */

const LinkedInScraper = require('./services/linkedin-scraper');
const DatabaseValidationService = require('./services/database-validation');
const { query } = require('./utils/database');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

async function testImprovedScraper() {
  console.log('🚀 Testing Improved LinkedIn Scraper with Enhanced Anti-Detection & Concurrency Control');
  console.log('=' .repeat(80));

  // Load real cookies from the provided JSON file
  const cookiesPath = 'C:\\Users\\krush\\OneDrive\\Desktop\\Final\\linkedin-automation-saas\\sd.json';
  let cookies = [];
  
  try {
    const cookiesData = await fs.readFile(cookiesPath, 'utf8');
    cookies = JSON.parse(cookiesData);
    console.log(`✅ Loaded ${cookies.length} cookies from ${cookiesPath}`);
    
    // Check for authentication cookie
    const authCookie = cookies.find(cookie => cookie.name === 'li_at');
    if (authCookie) {
      console.log('🔐 Authentication cookie (li_at) found');
    } else {
      console.log('⚠️ No authentication cookie (li_at) found');
    }
  } catch (error) {
    console.error('❌ Failed to load cookies:', error.message);
    return;
  }

  // Create scraper instance with enhanced settings and concurrency control
  const scraper = new LinkedInScraper({
    headless: false, // Keep visible for debugging
    timeout: 120000, // 2 minutes
    navigationTimeout: 180000, // 3 minutes  
    waitTimeout: 60000, // 1 minute
    retryAttempts: 3, // Try up to 3 times
    retryDelay: 5000, // 5 second base delay
    maxConcurrency: 3 // Limit to 3 concurrent operations
  });

  const mockAccount = {
    account_name: 'test-account',
    cookies: cookies
  };

  try {
    await scraper.initialize();
    console.log('✅ Scraper initialized successfully');

    // Test cases for sequential execution
    const testCases = [
      {
        name: 'Bill Gates Profile',
        url: 'https://www.linkedin.com/in/williamhgates/',
        type: 'profile'
      },
      {
        name: 'Jeff Weiner Profile', 
        url: 'https://www.linkedin.com/in/jeffweiner08/',
        type: 'profile'
      },
      {
        name: 'Microsoft Company',
        url: 'https://www.linkedin.com/company/microsoft/',
        type: 'company'
      }
    ];

    console.log('\n🔄 Testing Sequential Scraping (Original Method)');
    console.log('=' .repeat(60));

    for (const testCase of testCases) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🧪 Testing: ${testCase.name}`);
      console.log(`🔗 URL: ${testCase.url}`);
      console.log(`📋 Type: ${testCase.type}`);
      console.log(`${'='.repeat(50)}`);

      try {
        let result;
        const startTime = Date.now();

        if (testCase.type === 'profile') {
          result = await scraper.scrapeProfile(testCase.url, mockAccount);
        } else {
          result = await scraper.scrapeCompany(testCase.url, mockAccount);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`\n📊 Results for ${testCase.name}:`);
        console.log(`⏱️ Duration: ${duration}s`);
        console.log(`✅ Success: ${result.success || result.status === 'success'}`);
        console.log(`🔄 Attempts: ${result.attempt || result.attempts_made || 'N/A'}`);
        console.log(`📄 Status: ${result.status}`);
        console.log(`🔍 Content Validation: ${result.data?.content_validation || result.validation_status || 'N/A'}`);
        
        if (result.data) {
          if (testCase.type === 'profile') {
            console.log(`👤 Name: ${result.data.full_name || 'Not found'}`);
            console.log(`💼 Title: ${result.data.headline || 'Not found'}`);
            console.log(`📍 Location: ${result.data.location || 'Not found'}`);
          } else {
            console.log(`🏢 Company: ${result.data.company_name || 'Not found'}`);
            console.log(`🏭 Industry: ${result.data.industry || 'Not found'}`);
            console.log(`📍 Location: ${result.data.location || 'Not found'}`);
          }
        }
        
        if (result.error) {
          console.log(`❌ Error: ${result.error}`);
        }
        
        if (result.html_file) {
          console.log(`💾 HTML saved: ${result.html_file}`);
        }

      } catch (error) {
        console.error(`❌ Test failed for ${testCase.name}:`, error.message);
        console.error(`🔍 Error type: ${error.constructor.name}`);
        
        if (error.message.includes('timeout')) {
          console.log('⚠️ This appears to be a timeout issue - the enhanced retry logic should help');
        }
      }
    }

    // Test batch processing with concurrency control
    console.log('\n\n🚀 Testing Batch Processing with Concurrency Control');
    console.log('=' .repeat(60));
    
    const profileUrls = [
      'https://www.linkedin.com/in/williamhgates/',
      'https://www.linkedin.com/in/jeffweiner08/',
      'https://www.linkedin.com/in/satyanadella/'
    ];

    const companyUrls = [
      'https://www.linkedin.com/company/microsoft/',
      'https://www.linkedin.com/company/linkedin/'
    ];

    try {
      console.log('\n📦 Testing Profile Batch Processing...');
      const batchStartTime = Date.now();
      const profileResults = await scraper.scrapeBatch(profileUrls, mockAccount, 'profile');
      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
      
      console.log(`\n📊 Profile Batch Results:`);
      console.log(`⏱️ Total Duration: ${batchDuration}s`);
      console.log(`✅ Successful: ${profileResults.filter(r => r.success).length}/${profileResults.length}`);
      
      profileResults.forEach((result, index) => {
        if (result.success) {
          console.log(`  ✅ ${index + 1}. ${result.result.data?.full_name || 'Unknown'} - ${result.result.status}`);
        } else {
          console.log(`  ❌ ${index + 1}. ${result.url} - ${result.error}`);
        }
      });

      console.log('\n📦 Testing Company Batch Processing...');
      const companyBatchStartTime = Date.now();
      const companyResults = await scraper.scrapeBatch(companyUrls, mockAccount, 'company');
      const companyBatchDuration = ((Date.now() - companyBatchStartTime) / 1000).toFixed(2);
      
      console.log(`\n📊 Company Batch Results:`);
      console.log(`⏱️ Total Duration: ${companyBatchDuration}s`);
      console.log(`✅ Successful: ${companyResults.filter(r => r.success).length}/${companyResults.length}`);
      
      companyResults.forEach((result, index) => {
        if (result.success) {
          console.log(`  ✅ ${index + 1}. ${result.result.data?.company_name || 'Unknown'} - ${result.result.status}`);
        } else {
          console.log(`  ❌ ${index + 1}. ${result.url} - ${result.error}`);
        }
      });

    } catch (error) {
      console.error('❌ Batch processing failed:', error.message);
    }

  } catch (error) {
    console.error('❌ Failed to initialize scraper:', error.message);
  } finally {
    try {
      await scraper.close();
      console.log('\n✅ Scraper closed successfully');
      
      // Show final browser stats
      const stats = LinkedInScraper.getBrowserStats();
      console.log(`📊 Final Browser Stats: Instance=${stats.hasInstance}, RefCount=${stats.refCount}`);
      
    } catch (error) {
      console.error('❌ Error closing scraper:', error.message);
    }
  }

  console.log('\n🏁 Enhanced Anti-Detection & Concurrency Testing Complete!');
  console.log('📈 Improvements implemented:');
  console.log('  • Extended timeouts (2-3 minutes)');
  console.log('  • Puppeteer-extra with stealth plugin');
  console.log('  • Randomized User-Agents and viewport sizes');
  console.log('  • Enhanced cookie management with domain context');
  console.log('  • Human-like actions (scrolling, mouse movements, reading simulation)');
  console.log('  • Comprehensive retry logic with exponential backoff');
  console.log('  • Enhanced browser arguments for anti-detection');
  console.log('  • Random delays throughout the process');
  console.log('  • Concurrency control (max 3 simultaneous operations)');
  console.log('  • Batch processing with Promise.allSettled');
  console.log('  • Singleton browser pattern for resource efficiency');

}

// Run the test
testImprovedScraper().catch(console.error);

/**
 * Enhanced LinkedIn Scraper Test with Improved Resource Management
 * Tests the scraper with singleton browser pattern and proper cleanup
 */

class ScrapingSystemTest {
  constructor() {
    this.scraper = null;
    this.testResults = [];
  }

  async initialize() {
    console.log('🚀 Initializing LinkedIn Scraper Test System...');
    
    this.scraper = new LinkedInScraper({
      headless: false, // Set to false for debugging
      timeout: 90000 // 90 seconds timeout
    });
    
    await this.scraper.initialize();
    console.log('✅ Scraper initialized successfully');
  }

  async testDatabaseValidation() {
    console.log('\n📊 Testing Database Validation Service...');
    
    try {
      // Test 1: Validate non-existent job
      console.log('Test 1: Validating non-existent job...');
      const fakeJobId = uuidv4();
      const jobExists = await DatabaseValidationService.validateJobExists(fakeJobId, 'scraping_jobs');
      console.log(`Result: ${jobExists ? '❌ FAIL' : '✅ PASS'} - Non-existent job correctly identified`);
      
      // Test 2: Create a test scraping job
      console.log('Test 2: Creating test scraping job...');
      const testJobId = uuidv4();
      const testUserId = 'test-user-' + Date.now();
      
      // First create a test user if needed
      try {
        await query(`
          INSERT IGNORE INTO users (id, email, name, created_at, updated_at) 
          VALUES (?, ?, ?, NOW(), NOW())
        `, [testUserId, 'test@example.com', 'Test User']);
      } catch (e) {
        console.log('User may already exist, continuing...');
      }
      
      // Create test scraping job
      await query(`
        INSERT INTO scraping_jobs (id, user_id, job_name, job_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'running', NOW(), NOW())
      `, [testJobId, testUserId, 'Test Scraping Job', 'profile_scraping']);
      
      console.log('✅ Test scraping job created successfully');
      
      // Test 3: Validate the created job
      console.log('Test 3: Validating created job...');
      const createdJobExists = await DatabaseValidationService.validateJobExists(testJobId, 'scraping_jobs');
      console.log(`Result: ${createdJobExists ? '✅ PASS' : '❌ FAIL'} - Created job validation`);
      
      // Test 4: Test safe profile insert
      console.log('Test 4: Testing safe profile insert...');
      const testProfileData = {
        url: 'https://www.linkedin.com/in/test-profile',
        full_name: 'Test User Profile',
        first_name: 'Test',
        last_name: 'User',
        headline: 'Software Engineer at Test Company',
        about: 'This is a test profile for validation purposes.',
        country: 'United States',
        city: 'San Francisco',
        industry: 'Technology',
        email: 'test.profile@example.com',
        current_job_title: 'Software Engineer',
        current_company: 'Test Company',
        skills: ['JavaScript', 'Node.js', 'React'],
        education: [{'school': 'Test University', 'degree': 'Computer Science'}],
        experience: [{'company': 'Test Company', 'title': 'Software Engineer'}],
        content_validation: 'valid'
      };
      
      const profileResultId = await DatabaseValidationService.safeInsertProfileResult(
        testProfileData,
        testJobId,
        { user_id: testUserId, job_name: 'Test Job', job_type: 'profile_scraping' }
      );
      
      console.log(`✅ Profile result inserted with ID: ${profileResultId}`);
      
      // Test 5: Test safe company insert
      console.log('Test 5: Testing safe company insert...');
      const testCompanyData = {
        url: 'https://www.linkedin.com/company/test-company',
        name: 'Test Company Inc.',
        industry: 'Technology',
        location: 'San Francisco, CA',
        follower_count: '10000',
        company_size: '100-500 employees',
        website: 'https://testcompany.com',
        description: 'A test company for validation purposes.',
        content_validation: 'valid'
      };
      
      const companyResultId = await DatabaseValidationService.safeInsertCompanyResult(
        testCompanyData,
        testJobId,
        { user_id: testUserId, job_name: 'Test Job', job_type: 'company_scraping' }
      );
      
      console.log(`✅ Company result inserted with ID: ${companyResultId}`);
      
      // Cleanup test data
      console.log('🧹 Cleaning up test data...');
      await query('DELETE FROM profile_results WHERE job_id = ?', [testJobId]);
      await query('DELETE FROM company_results WHERE job_id = ?', [testJobId]);
      await query('DELETE FROM scraping_jobs WHERE id = ?', [testJobId]);
      await query('DELETE FROM users WHERE id = ?', [testUserId]);
      
      console.log('✅ Database validation tests completed successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Database validation test failed:', error);
      return false;
    }
  }

  async testScrapingWithValidation() {
    console.log('\n🔍 Testing Scraping with Content Validation...');
    
    try {
      // Load real cookies from the provided file
      const fs = require('fs');
      const path = require('path');
      const cookiesPath = 'C:\\Users\\krush\\OneDrive\\Desktop\\Final\\linkedin-automation-saas\\sd.json';
      
      let cookiesData = null;
      try {
        const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
        cookiesData = JSON.parse(cookiesContent);
        console.log(`✅ Loaded ${cookiesData.length} cookies from ${cookiesPath}`);
      } catch (error) {
        console.warn(`⚠️ Could not load cookies from ${cookiesPath}:`, error.message);
      }
      
      // Test URLs (using public profiles that should be accessible)
      const testUrls = [
        'https://www.linkedin.com/in/williamhgates', // Bill Gates - public profile
        'https://www.linkedin.com/in/jeffweiner08', // Jeff Weiner - public profile
        'https://www.linkedin.com/company/microsoft' // Microsoft company page
      ];
      
      for (const url of testUrls) {
        console.log(`\n🌐 Testing URL: ${url}`);
        
        try {
          let result;
          // Create account object with real cookies
          const mockAccount = {
            id: 'test-account',
            account_name: 'Test Account with Real Cookies',
            cookies: cookiesData ? JSON.stringify(cookiesData) : null
          };
          
          if (url.includes('/company/')) {
            result = await this.scraper.scrapeCompany(url, mockAccount);
          } else {
            result = await this.scraper.scrapeProfile(url, mockAccount);
          }
          
          console.log('📊 Scraping Result:');
          console.log(`- Success: ${result.success}`);
          console.log(`- Content Validation: ${result.content_validation}`);
          console.log(`- Validation Status: ${result.validation_status}`);
          
          if (result.success) {
            console.log(`- Name: ${result.name || result.fullName || 'N/A'}`);
            console.log(`- Title/Industry: ${result.title || result.headline || result.industry || 'N/A'}`);
            console.log(`- Location: ${result.location || 'N/A'}`);
          } else {
            console.log(`- Error: ${result.error}`);
          }
          
          this.testResults.push({
            url,
            success: result.success,
            validation: result.content_validation,
            error: result.error
          });
          
        } catch (error) {
          console.error(`❌ Error scraping ${url}:`, error.message);
          this.testResults.push({
            url,
            success: false,
            validation: 'error',
            error: error.message
          });
        }
        
        // Wait between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      return true;
      
    } catch (error) {
      console.error('❌ Scraping test failed:', error);
      return false;
    }
  }

  async generateTestReport() {
    console.log('\n📋 Test Report Summary');
    console.log('=' .repeat(50));
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalTests = this.testResults.length;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${totalTests - successCount}`);
    console.log(`Success Rate: ${((successCount / totalTests) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    this.testResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.url}`);
      console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`   Validation: ${result.validation}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      console.log('');
    });
  }

  async cleanup() {
    if (this.scraper && this.scraper.browser) {
      await this.scraper.browser.close();
      console.log('🧹 Browser closed');
    }
  }

  async runFullTest() {
    try {
      await this.initialize();
      
      // Test database validation
      const dbTestSuccess = await this.testDatabaseValidation();
      
      // Test scraping with validation
      const scrapingTestSuccess = await this.testScrapingWithValidation();
      
      // Generate report
      await this.generateTestReport();
      
      console.log('\n🎯 Overall Test Result:');
      if (dbTestSuccess && scrapingTestSuccess) {
        console.log('✅ All tests completed successfully!');
      } else {
        console.log('❌ Some tests failed. Please review the results above.');
      }
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new ScrapingSystemTest();
  test.runFullTest().catch(console.error);
}

module.exports = ScrapingSystemTest;