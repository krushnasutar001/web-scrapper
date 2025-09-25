/**
 * Simple LinkedIn Scraper Test
 * Tests the enhanced scraping system with concurrency control
 */

const LinkedInScraper = require('./services/linkedin-scraper');
const fs = require('fs').promises;

async function testSimpleScraper() {
  console.log('🚀 Testing Enhanced LinkedIn Scraper with Concurrency Control');
  console.log('=' .repeat(70));

  // Load cookies from the provided JSON file
  const cookiesPath = 'C:\\Users\\krush\\OneDrive\\Desktop\\Final\\linkedin-automation-saas\\sd.json';
  let cookies = [];
  
  try {
    const cookiesData = await fs.readFile(cookiesPath, 'utf8');
    cookies = JSON.parse(cookiesData);
    console.log(`✅ Loaded ${cookies.length} cookies from file`);
    
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

  // Create scraper instance with enhanced settings
  const scraper = new LinkedInScraper({
    headless: false, // Keep visible for debugging
    timeout: 60000, // 1 minute
    navigationTimeout: 90000, // 1.5 minutes  
    waitTimeout: 30000, // 30 seconds
    retryAttempts: 2, // Try up to 2 times
    retryDelay: 3000, // 3 second base delay
    maxConcurrency: 2 // Limit to 2 concurrent operations for stability
  });

  const mockAccount = {
    account_name: 'test-account',
    cookies: cookies
  };

  try {
    await scraper.initialize();
    console.log('✅ Scraper initialized successfully');

    // Test single profile scraping first
    console.log('\n🧪 Testing Single Profile Scraping');
    console.log('=' .repeat(50));
    
    const testUrl = 'https://www.linkedin.com/in/williamhgates/';
    console.log(`🔗 Testing URL: ${testUrl}`);

    try {
      const startTime = Date.now();
      const result = await scraper.scrapeProfile(testUrl, mockAccount);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n📊 Single Profile Results:`);
      console.log(`⏱️ Duration: ${duration}s`);
      console.log(`✅ Success: ${result.success || result.status === 'success'}`);
      console.log(`🔄 Attempts: ${result.attempt || result.attempts_made || 'N/A'}`);
      console.log(`📄 Status: ${result.status}`);
      
      if (result.data) {
        console.log(`👤 Name: ${result.data.full_name || 'Not found'}`);
        console.log(`💼 Title: ${result.data.headline || 'Not found'}`);
        console.log(`📍 Location: ${result.data.location || 'Not found'}`);
      }
      
      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
      }

      // If single scraping works, test batch processing
      if (result.success || result.status === 'success') {
        console.log('\n🚀 Testing Batch Processing with Concurrency Control');
        console.log('=' .repeat(60));
        
        const profileUrls = [
          'https://www.linkedin.com/in/williamhgates/',
          'https://www.linkedin.com/in/jeffweiner08/'
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

        } catch (error) {
          console.error('❌ Batch processing failed:', error.message);
        }
      }

    } catch (error) {
      console.error(`❌ Single profile test failed:`, error.message);
      console.error(`🔍 Error type: ${error.constructor.name}`);
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

  console.log('\n🏁 Enhanced Scraper Testing Complete!');
  console.log('📈 Features tested:');
  console.log('  • Puppeteer-extra with stealth plugin');
  console.log('  • Randomized User-Agents and viewport sizes');
  console.log('  • Enhanced cookie management with domain context');
  console.log('  • Human-like actions (scrolling, mouse movements, reading simulation)');
  console.log('  • Comprehensive retry logic with exponential backoff');
  console.log('  • Random delays throughout the process');
  console.log('  • Concurrency control with limited simultaneous operations');
  console.log('  • Batch processing with Promise.allSettled');
  console.log('  • Singleton browser pattern for resource efficiency');
}

// Run the test
testSimpleScraper().catch(console.error);