const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Add stealth plugin
puppeteer.use(StealthPlugin());

async function validateCookieAuthentication() {
  console.log('🚀 Starting cookie authentication validation...');
  
  let browser = null;
  let page = null;
  
  try {
    // Load cookies
    const cookiesPath = 'C:\\Users\\krush\\OneDrive\\Desktop\\Final\\linkedin-automation-saas\\sd.json';
    console.log(`📂 Loading cookies from: ${cookiesPath}`);
    
    const cookieData = fs.readFileSync(cookiesPath, 'utf8');
    const cookies = JSON.parse(cookieData);
    console.log(`✅ Loaded ${cookies.length} cookies`);
    
    // Analyze cookies
    const authCookies = ['li_at', 'JSESSIONID', 'bcookie', 'bscookie'];
    const foundAuthCookies = cookies.filter(cookie => 
      authCookies.includes(cookie.name)
    );
    
    console.log('🔍 Authentication cookies found:');
    foundAuthCookies.forEach(cookie => {
      console.log(`  • ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
      if (cookie.expires || cookie.expirationDate) {
        const expiry = cookie.expires || cookie.expirationDate;
        const expiryDate = new Date(typeof expiry === 'number' ? expiry * 1000 : expiry);
        const isExpired = expiryDate < new Date();
        console.log(`    Expires: ${expiryDate.toISOString()} ${isExpired ? '❌ EXPIRED' : '✅ Valid'}`);
      }
    });
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to LinkedIn
    console.log('🌐 Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
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
        // Ignore cookie errors for now
      }
    }
    
    // Refresh to apply cookies
    console.log('🔄 Refreshing page...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check authentication status
    console.log('🔍 Checking authentication status...');
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Check for login indicators
    const isLoggedIn = await page.evaluate(() => {
      // Look for common logged-in indicators
      const indicators = [
        'nav[aria-label="Primary Navigation"]',
        '.global-nav__me',
        '[data-control-name="nav.settings"]',
        '.feed-identity-module',
        '.global-nav__primary-item--profile'
      ];
      
      return indicators.some(selector => document.querySelector(selector) !== null);
    });
    
    console.log(`🔐 Authentication status: ${isLoggedIn ? '✅ Logged in' : '❌ Not logged in'}`);
    
    if (isLoggedIn) {
      console.log('✅ Cookies are valid and user is authenticated!');
      
      // Try to get user info
      try {
        const userInfo = await page.evaluate(() => {
          const nameElement = document.querySelector('.feed-identity-module__actor-meta h1, .global-nav__me-photo');
          return nameElement ? nameElement.textContent || nameElement.alt : 'Unknown';
        });
        console.log(`👤 Logged in as: ${userInfo}`);
      } catch (error) {
        console.log('⚠️ Could not extract user info');
      }
      
      // Test search functionality
      console.log('🔍 Testing search functionality...');
      try {
        await page.goto('https://www.linkedin.com/search/results/people/?keywords=Bill%20Gates', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const searchUrl = page.url();
        console.log(`🔍 Search URL: ${searchUrl}`);
        
        if (searchUrl.includes('/search/')) {
          console.log('✅ Search functionality works!');
        } else {
          console.log('❌ Search redirected, may be limited');
        }
        
      } catch (error) {
        console.log('❌ Search test failed:', error.message);
      }
      
    } else {
      console.log('❌ Authentication failed - cookies may be expired or invalid');
      
      // Check if we're on login page
      const isLoginPage = currentUrl.includes('/login') || title.toLowerCase().includes('sign in');
      if (isLoginPage) {
        console.log('📝 Redirected to login page - authentication required');
      }
    }
    
    // Wait to observe
    console.log('⏳ Waiting 10 seconds to observe...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('❌ Cookie validation failed:', error.message);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

validateCookieAuthentication().catch(console.error);