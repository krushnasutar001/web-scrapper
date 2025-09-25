/**
 * Test script for LinkedIn Voyager API capture functionality
 * This script demonstrates how to use the enhanced LinkedInScraper with Voyager mode
 */

const LinkedInScraper = require('./services/linkedin-scraper');
const fs = require('fs').promises;
const path = require('path');

async function testVoyagerMode() {
  console.log('🚀 Testing LinkedIn Scraper with Voyager API capture...\n');

  // Initialize scraper with Voyager mode enabled
  const scraper = new LinkedInScraper({
    headless: false, // Set to true for production
    useVoyager: true, // Enable Voyager API capture
    timeout: 60000,
    navigationTimeout: 90000
  });

  try {
    // Initialize the scraper
    console.log('🔧 Initializing scraper...');
    await scraper.initialize();

    // Load authentication cookies
    console.log('🍪 Loading authentication cookies...');
    const cookiesPath = path.join(__dirname, '..', 'sd.json');
    const cookiesData = await fs.readFile(cookiesPath, 'utf8');
    const cookies = JSON.parse(cookiesData);
    
    const account = {
      account_name: 'test_account',
      cookies: cookies
    };

    // Test profile scraping with Voyager mode
    console.log('\n📋 Testing profile scraping with Voyager API capture...');
    const profileUrl = 'https://www.linkedin.com/in/williamhgates/';
    
    const profileResult = await scraper.scrapeProfile(profileUrl, account);
    
    console.log('\n📊 Profile Scraping Results:');
    console.log('- Status:', profileResult.status);
    console.log('- Success:', profileResult.success);
    console.log('- HTML Data Available:', !!profileResult.data);
    console.log('- Voyager Data Available:', !!profileResult.voyagerData);
    
    if (profileResult.voyagerData) {
      console.log('\n🔍 Voyager API Data Structure:');
      console.log('- Identity Data:', !!profileResult.voyagerData.identity);
      console.log('- Positions Data:', !!profileResult.voyagerData.positions);
      console.log('- Skills Data:', !!profileResult.voyagerData.skills);
      console.log('- Education Data:', !!profileResult.voyagerData.education);
      console.log('- Raw Responses Count:', profileResult.voyagerData.raw_responses?.length || 0);
      
      // Log captured endpoints
      if (profileResult.voyagerData.raw_responses?.length > 0) {
        console.log('\n📡 Captured Voyager Endpoints:');
        profileResult.voyagerData.raw_responses.forEach((response, index) => {
          console.log(`  ${index + 1}. ${response.endpoint}`);
        });
      }
    }

    // Save results for inspection
    const resultsPath = path.join(__dirname, 'voyager-test-results.json');
    await fs.writeFile(resultsPath, JSON.stringify(profileResult, null, 2));
    console.log(`\n💾 Results saved to: ${resultsPath}`);

    // Test direct Voyager API fetch (optional)
    console.log('\n🔗 Testing direct Voyager API fetch...');
    const directResult = await scraper.fetchVoyagerDirect(
      'https://www.linkedin.com/voyager/api/identity/profiles/williamhgates'
    );
    
    if (directResult) {
      console.log('✅ Direct Voyager API fetch successful');
      console.log('- Response keys:', Object.keys(directResult));
    } else {
      console.log('❌ Direct Voyager API fetch failed');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await scraper.close();
    console.log('✅ Test completed');
  }
}

// Run the test
if (require.main === module) {
  testVoyagerMode().catch(console.error);
}

module.exports = { testVoyagerMode };