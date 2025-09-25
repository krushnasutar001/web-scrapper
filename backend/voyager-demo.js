/**
 * Demo script for LinkedIn Voyager API capture functionality
 * This script demonstrates the Voyager mode without requiring authentication
 */

const LinkedInScraper = require('./services/linkedin-scraper');

async function demoVoyagerMode() {
  console.log('🚀 Demonstrating LinkedIn Scraper with Voyager API capture...\n');

  // Initialize scraper with Voyager mode enabled
  const scraper = new LinkedInScraper({
    headless: false, // Keep visible to see the browser
    useVoyager: true, // Enable Voyager API capture
    timeout: 30000,
    navigationTimeout: 45000
  });

  try {
    // Initialize the scraper
    console.log('🔧 Initializing scraper...');
    await scraper.initialize();

    // Create a mock account object (no cookies)
    const mockAccount = {
      account_name: 'demo_account',
      cookies: [] // Empty cookies array
    };

    // Test with a public LinkedIn profile (will likely redirect to guest page)
    console.log('\n📋 Testing Voyager mode setup...');
    const profileUrl = 'https://www.linkedin.com/in/williamhgates/';
    
    console.log('🔍 Voyager network listener is active and ready to capture API calls');
    console.log('📡 Any /voyager/api/ requests will be automatically captured');
    
    // Navigate to LinkedIn to trigger any potential API calls
    console.log('\n🌐 Navigating to LinkedIn profile (may redirect to guest page)...');
    
    try {
      const profileResult = await scraper.scrapeProfile(profileUrl, mockAccount);
      
      console.log('\n📊 Scraping Results:');
      console.log('- Status:', profileResult.status);
      console.log('- Success:', profileResult.success);
      console.log('- HTML Data Available:', !!profileResult.data);
      console.log('- Voyager Data Available:', !!profileResult.voyagerData);
      
      if (profileResult.voyagerData) {
        console.log('\n🔍 Voyager API Data Captured:');
        console.log('- Raw Responses Count:', profileResult.voyagerData.raw_responses?.length || 0);
        
        if (profileResult.voyagerData.raw_responses?.length > 0) {
          console.log('\n📡 Captured Voyager Endpoints:');
          profileResult.voyagerData.raw_responses.forEach((response, index) => {
            console.log(`  ${index + 1}. ${response.endpoint}`);
          });
        } else {
          console.log('📭 No Voyager API calls were captured (expected for guest access)');
        }
      } else {
        console.log('📭 No Voyager data captured (expected without authentication)');
      }
      
    } catch (error) {
      console.log('⚠️ Profile scraping failed (expected without authentication):', error.message);
    }

    // Demonstrate the Voyager response array functionality
    console.log('\n🔧 Demonstrating Voyager response management:');
    console.log('- Initial voyagerResponses length:', scraper.voyagerResponses.length);
    
    // Manually add a mock response to show the structure
    scraper.voyagerResponses.push({
      url: 'https://www.linkedin.com/voyager/api/identity/profiles/demo',
      json: { mockData: 'This is a demo response' },
      timestamp: Date.now()
    });
    
    console.log('- After adding mock response:', scraper.voyagerResponses.length);
    
    // Test the extraction methods
    const mockProfileData = scraper.extractVoyagerProfileData();
    console.log('- Mock profile data extracted:', !!mockProfileData);
    
    // Clear responses
    scraper.voyagerResponses = [];
    console.log('- After clearing:', scraper.voyagerResponses.length);

    console.log('\n✅ Voyager mode demonstration completed successfully!');
    console.log('\n📝 Summary of Voyager Features:');
    console.log('  ✓ Network listener setup in initialize()');
    console.log('  ✓ Automatic API response capture');
    console.log('  ✓ Response clearing before each scrape');
    console.log('  ✓ Data extraction methods for profiles and companies');
    console.log('  ✓ Direct API fetch helper method');
    console.log('  ✓ Structured data return with voyagerData field');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await scraper.close();
    console.log('✅ Demo completed');
  }
}

// Run the demo
if (require.main === module) {
  demoVoyagerMode().catch(console.error);
}

module.exports = { demoVoyagerMode };