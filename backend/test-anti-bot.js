const LinkedInScraper = require('./services/linkedin-scraper');
const { initializeDatabase } = require('./utils/database');

async function testAntiBotDetection() {
  console.log("🤖 Testing Anti-Bot Detection and Rate Limiting...");
  
  let scraper = null;
  
  try {
    // Initialize database
    process.env.DB_PASSWORD = "Krushna_Sutar@0809";
    await initializeDatabase();
    
    // Initialize scraper
    scraper = new LinkedInScraper({
      headless: false, // Run in non-headless mode to see what's happening
      timeout: 15000
    });
    
    await scraper.initialize();
    console.log("✅ Scraper initialized successfully");
    
    // Test accessing LinkedIn without cookies
    console.log("🔍 Testing LinkedIn access without authentication...");
    
    try {
      await scraper.page.goto('https://www.linkedin.com', { 
        waitUntil: 'networkidle0',
        timeout: 15000 
      });
      
      const title = await scraper.page.title();
      console.log(`📄 Page title: ${title}`);
      
      // Check for common anti-bot indicators
      const content = await scraper.page.content();
      
      if (content.includes('challenge') || content.includes('captcha') || content.includes('robot')) {
        console.log("⚠️ Potential anti-bot challenge detected");
      }
      
      if (content.includes('blocked') || content.includes('suspended')) {
        console.log("❌ Account appears to be blocked or suspended");
      }
      
      // Check if we can access a profile page
      console.log("🔍 Testing profile page access...");
      
      const testProfileUrl = 'https://www.linkedin.com/in/test-profile-12345';
      await scraper.page.goto(testProfileUrl, { 
        waitUntil: 'networkidle0',
        timeout: 15000 
      });
      
      const profileTitle = await scraper.page.title();
      console.log(`📄 Profile page title: ${profileTitle}`);
      
      // Check response status
      const response = scraper.page.url();
      console.log(`🌐 Final URL: ${response}`);
      
      if (response.includes('login') || response.includes('authwall')) {
        console.log("🔒 Redirected to login - authentication required");
      }
      
    } catch (error) {
      console.error("❌ Error during LinkedIn access test:", error.message);
    }
    
    console.log("✅ Anti-bot detection test completed");
    
  } catch (error) {
    console.error("❌ Error in anti-bot test:", error.message);
  } finally {
    if (scraper && scraper.browser) {
      await scraper.browser.close();
      console.log("🔄 Browser closed");
    }
  }
}

testAntiBotDetection().then(() => {
  console.log("✅ Anti-bot test completed");
  process.exit(0);
}).catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});