/**
 * Simple Voyager API Test Script
 * Tests the LinkedIn scraper with Voyager API capture in a more controlled way
 */

const LinkedInScraper = require('./services/linkedin-scraper');
const fs = require('fs').promises;
const path = require('path');

async function testVoyagerModeSimple() {
  console.log('🚀 Testing LinkedIn Scraper with Voyager API capture (Simple Mode)...\n');

  // Initialize scraper with Voyager mode enabled and non-headless for debugging
  const scraper = new LinkedInScraper({ 
    headless: false, 
    useVoyager: true,
    timeout: 60000,
    navigationTimeout: 90000,
    waitTimeout: 30000
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
    
    // Inject cookies directly
    console.log('🔑 Injecting cookies...');
    await scraper.injectCookies(cookies);

    // Test basic LinkedIn navigation first
    console.log('\n🌐 Testing basic LinkedIn navigation...');
    try {
      await scraper.page.goto('https://www.linkedin.com/feed/', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      // Wait a bit for the page to load
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const currentUrl = scraper.page.url();
      console.log('✅ Successfully navigated to:', currentUrl);
      
      // Check if we're logged in by looking for common LinkedIn elements
      const isLoggedIn = await scraper.page.evaluate(() => {
        return document.querySelector('.global-nav') !== null || 
               document.querySelector('[data-test-id="nav-top-messaging"]') !== null ||
               document.querySelector('.feed-identity-module') !== null;
      });
      
      console.log('🔐 Login status:', isLoggedIn ? 'Logged in' : 'Not logged in');
      
      if (isLoggedIn) {
        console.log('\n🎯 Testing Voyager API capture...');
        
        // Clear any existing Voyager responses
        scraper.voyagerResponses = [];
        console.log('🧹 Cleared Voyager responses');
        
        // Navigate to a profile page that might trigger Voyager API calls
        console.log('📋 Navigating to a public profile...');
        
        try {
          // Try a more accessible profile or use the feed
          await scraper.page.goto('https://www.linkedin.com/in/satyanadella/', { 
            waitUntil: 'networkidle0',
            timeout: 45000 
          });
          
          // Wait for potential API calls
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          console.log(`📡 Captured ${scraper.voyagerResponses.length} Voyager API responses`);
          
          if (scraper.voyagerResponses.length > 0) {
            console.log('\n🔍 Voyager API Responses:');
            scraper.voyagerResponses.forEach((response, index) => {
              const apiPath = response.url.split('/voyager/api/')[1] || 'unknown';
              console.log(`  ${index + 1}. ${apiPath} (${response.timestamp})`);
            });
            
            // Test the extraction methods
            console.log('\n🧪 Testing data extraction methods...');
            const profileData = scraper.extractVoyagerProfileData();
            const companyData = scraper.extractVoyagerCompanyData();
            
            console.log('- Profile extraction result:', !!profileData);
            console.log('- Company extraction result:', !!companyData);
            
            if (profileData && Object.keys(profileData).length > 0) {
              console.log('- Profile data keys:', Object.keys(profileData));
            }
            
            if (companyData && Object.keys(companyData).length > 0) {
              console.log('- Company data keys:', Object.keys(companyData));
            }
          } else {
            console.log('⚠️ No Voyager API responses captured. This could be due to:');
            console.log('  - LinkedIn not making API calls for this profile');
            console.log('  - Network timing issues');
            console.log('  - Profile being cached');
          }
          
        } catch (navError) {
          console.log('⚠️ Profile navigation failed:', navError.message);
          console.log('🔄 Testing with current page content...');
          
          // Test extraction methods with current responses
          const profileData = scraper.extractVoyagerProfileData();
          const companyData = scraper.extractVoyagerCompanyData();
          
          console.log('- Profile extraction (current):', !!profileData);
          console.log('- Company extraction (current):', !!companyData);
        }
        
      } else {
        console.log('❌ Not logged in - cookies may be expired or invalid');
        console.log('🔍 Testing Voyager methods without authentication...');
        
        // Test the extraction methods anyway
        const profileData = scraper.extractVoyagerProfileData();
        const companyData = scraper.extractVoyagerCompanyData();
        
        console.log('- Profile extraction method works:', typeof profileData === 'object');
        console.log('- Company extraction method works:', typeof companyData === 'object');
      }
      
    } catch (error) {
      console.log('❌ Navigation failed:', error.message);
      console.log('🧪 Testing extraction methods directly...');
      
      // Test the methods exist and work
      const profileData = scraper.extractVoyagerProfileData();
      const companyData = scraper.extractVoyagerCompanyData();
      
      console.log('- Profile extraction method:', typeof scraper.extractVoyagerProfileData === 'function');
      console.log('- Company extraction method:', typeof scraper.extractVoyagerCompanyData === 'function');
      console.log('- fetchVoyagerDirect method:', typeof scraper.fetchVoyagerDirect === 'function');
    }

    console.log('\n✅ Voyager API integration test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await scraper.close();
    console.log('✅ Test completed');
  }
}

// Run the test
testVoyagerModeSimple().catch(console.error);