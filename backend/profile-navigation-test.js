const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Add stealth plugin
puppeteer.use(StealthPlugin());

async function testProfileNavigation() {
  console.log('🚀 Starting LinkedIn profile navigation test...');
  
  let browser = null;
  let page = null;
  
  try {
    // Load cookies
    const cookiesPath = 'C:\\Users\\krush\\OneDrive\\Desktop\\Final\\linkedin-automation-saas\\sd.json';
    console.log(`📂 Loading cookies from: ${cookiesPath}`);
    
    if (!fs.existsSync(cookiesPath)) {
      throw new Error(`Cookie file not found: ${cookiesPath}`);
    }
    
    const cookieData = fs.readFileSync(cookiesPath, 'utf8');
    const cookies = JSON.parse(cookieData);
    console.log(`✅ Loaded ${cookies.length} cookies`);
    
    // Launch browser
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('✅ Browser setup complete');
    
    // Navigate to LinkedIn first
    console.log('🌐 Navigating to LinkedIn homepage...');
    await page.goto('https://www.linkedin.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    console.log('✅ LinkedIn homepage loaded');
    
    // Inject cookies
    console.log('🍪 Injecting cookies...');
    await page.deleteCookie(...await page.cookies());
    
    for (const cookie of cookies) {
      try {
        const cookieConfig = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || '.linkedin.com',
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
          secure: cookie.secure !== false,
          sameSite: cookie.sameSite || 'Lax'
        };
        
        await page.setCookie(cookieConfig);
      } catch (error) {
        console.warn(`⚠️ Failed to set cookie ${cookie.name}:`, error.message);
      }
    }
    console.log('✅ Cookies injected');
    
    // Refresh page to apply cookies
    console.log('🔄 Refreshing page to apply cookies...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('✅ Page refreshed');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to navigate to a LinkedIn profile
    const profileUrl = 'https://www.linkedin.com/in/williamhgates/';
    console.log(`🌐 Navigating to profile: ${profileUrl}`);
    
    try {
      await page.goto(profileUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000  // Increased timeout
      });
      console.log('✅ Profile page loaded successfully!');
      
      // Check if we're on the profile page or redirected
      const currentUrl = page.url();
      console.log(`📍 Current URL: ${currentUrl}`);
      
      const title = await page.title();
      console.log(`📄 Page title: ${title}`);
      
      // Check for profile elements
      try {
        await page.waitForSelector('h1', { timeout: 10000 });
        const profileName = await page.$eval('h1', el => el.textContent.trim());
        console.log(`👤 Profile name found: ${profileName}`);
      } catch (error) {
        console.log('⚠️ Could not find profile name element');
      }
      
    } catch (error) {
      console.error('❌ Profile navigation failed:', error.message);
      
      // Check current URL to see where we ended up
      const currentUrl = page.url();
      console.log(`📍 Current URL after failed navigation: ${currentUrl}`);
      
      const title = await page.title();
      console.log(`📄 Current page title: ${title}`);
    }
    
    // Wait to observe
    console.log('⏳ Waiting 10 seconds to observe the page...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('✅ Profile navigation test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('🔍 Error details:', error);
  } finally {
    // Cleanup
    if (page) {
      await page.close();
      console.log('📄 Page closed');
    }
    
    if (browser) {
      await browser.close();
      console.log('🌐 Browser closed');
    }
  }
}

// Run the test
testProfileNavigation().catch(console.error);