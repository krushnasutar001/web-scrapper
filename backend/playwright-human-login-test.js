/**
 * Human-like LinkedIn Login Test with Playwright Debug Mode
 * Tests real LinkedIn authentication with human behavior simulation
 */

const { chromium } = require('playwright');
const path = require('path');

// User's LinkedIn cookie
const LINKEDIN_COOKIE = 'AQEDAVIYJnMCe5EDAAABmR6x5g4AAAGZQr5qDk0AQ5RVrd-SfiZANkk64STLQyYEpDQh5zAk7otXPjPyz_Hh7k2bGuLomC9XHkGtWw_cvROb_OVZ08Gzx09a9YmUjDXt1ZbTAQJubGcaFKI2kfPEJFHZ';

class HumanLikeLinkedInTester {
  constructor() {
    this.debugMode = process.env.PLAYWRIGHT_DEBUG === 'true';
    this.headless = !this.debugMode; // Show browser in debug mode
    this.slowMo = this.debugMode ? 1000 : 100; // Slow down in debug mode
  }

  /**
   * Human-like delay with randomization
   */
  async humanDelay(min = 1000, max = 3000) {
    const delay = Math.random() * (max - min) + min;
    console.log(`   ⏳ Human delay: ${Math.round(delay)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Human-like mouse movement
   */
  async humanMouseMove(page, selector) {
    try {
      const element = await page.$(selector);
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          // Move to random position within element
          const x = box.x + Math.random() * box.width;
          const y = box.y + Math.random() * box.height;
          await page.mouse.move(x, y, { steps: 10 });
          console.log(`   🖱️  Mouse moved to ${selector}`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not move mouse to ${selector}`);
    }
  }

  /**
   * Human-like scrolling
   */
  async humanScroll(page, direction = 'down', distance = 300) {
    const scrollSteps = 5;
    const stepDistance = distance / scrollSteps;
    
    for (let i = 0; i < scrollSteps; i++) {
      await page.mouse.wheel(0, direction === 'down' ? stepDistance : -stepDistance);
      await this.humanDelay(100, 300);
    }
    console.log(`   📜 Human scroll ${direction} (${distance}px)`);
  }

  /**
   * Test LinkedIn authentication with human-like behavior
   */
  async testLinkedInLogin() {
    console.log('🤖 === HUMAN-LIKE LINKEDIN LOGIN TEST ===');
    console.log(`Cookie: ${LINKEDIN_COOKIE.substring(0, 20)}...${LINKEDIN_COOKIE.substring(LINKEDIN_COOKIE.length - 10)}`);
    console.log(`Debug Mode: ${this.debugMode ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Headless: ${this.headless}`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    let browser = null;
    let context = null;
    let page = null;
    
    try {
      // Step 1: Launch browser with human-like settings
      console.log('\n🚀 Step 1: Launching Browser');
      const launchStart = Date.now();
      
      browser = await chromium.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-extensions-file-access-check',
          '--disable-extensions-http-throttling',
          '--disable-extensions-except',
          '--disable-component-extensions-with-background-pages'
        ],
        devtools: this.debugMode // Open DevTools in debug mode
      });
      
      console.log(`   ✅ Browser launched in ${Date.now() - launchStart}ms`);
      
      // Step 2: Create human-like browser context
      console.log('\n🌐 Step 2: Creating Human-like Context');
      const contextStart = Date.now();
      
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }, // Common laptop resolution
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: ['geolocation'],
        geolocation: { latitude: 40.7128, longitude: -74.0060 }, // New York
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        forcedColors: 'none',
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0'
        }
      });
      
      console.log(`   ✅ Context created in ${Date.now() - contextStart}ms`);
      
      // Step 3: Inject LinkedIn cookie
      console.log('\n🍪 Step 3: Injecting LinkedIn Cookie');
      const cookieStart = Date.now();
      
      await context.addCookies([{
        name: 'li_at',
        value: LINKEDIN_COOKIE,
        domain: '.linkedin.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      }]);
      
      // Add additional LinkedIn cookies for more realistic session
      await context.addCookies([
        {
          name: 'JSESSIONID',
          value: `ajax:${Math.random().toString(36).substring(2)}`,
          domain: '.linkedin.com',
          path: '/',
          httpOnly: true,
          secure: true
        },
        {
          name: 'lang',
          value: 'v=2&lang=en-us',
          domain: '.linkedin.com',
          path: '/'
        },
        {
          name: 'timezone',
          value: 'America/New_York',
          domain: '.linkedin.com',
          path: '/'
        }
      ]);
      
      console.log(`   ✅ Cookies injected in ${Date.now() - cookieStart}ms`);
      
      // Step 4: Create page and set up human-like behavior
      console.log('\n📄 Step 4: Creating Page with Human Behavior');
      const pageStart = Date.now();
      
      page = await context.newPage();
      
      // Set up request interception for debugging
      await page.route('**/*', (route) => {
        const request = route.request();
        console.log(`   🌐 ${request.method()} ${request.url()}`);
        route.continue();
      });
      
      // Set up response monitoring
      page.on('response', response => {
        if (response.status() >= 400) {
          console.log(`   ❌ HTTP ${response.status()}: ${response.url()}`);
        } else {
          console.log(`   ✅ HTTP ${response.status()}: ${response.url()}`);
        }
      });
      
      // Set up console monitoring
      page.on('console', msg => {
        console.log(`   🖥️  Console ${msg.type()}: ${msg.text()}`);
      });
      
      // Set up error monitoring
      page.on('pageerror', error => {
        console.log(`   💥 Page Error: ${error.message}`);
      });
      
      console.log(`   ✅ Page created in ${Date.now() - pageStart}ms`);
      
      // Step 5: Navigate to LinkedIn with human-like behavior
      console.log('\n🌐 Step 5: Human-like LinkedIn Navigation');
      const navStart = Date.now();
      
      // First, visit LinkedIn homepage (more human-like)
      console.log('   📍 Visiting LinkedIn homepage first...');
      await page.goto('https://www.linkedin.com/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      await this.humanDelay(2000, 4000);
      
      // Human-like mouse movement on homepage
      await this.humanMouseMove(page, 'body');
      await this.humanDelay(1000, 2000);
      
      // Now navigate to feed
      console.log('   📍 Navigating to LinkedIn feed...');
      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      console.log(`   ✅ Navigation completed in ${Date.now() - navStart}ms`);
      console.log(`   📊 Response Status: ${response.status()}`);
      console.log(`   🔗 Final URL: ${page.url()}`);
      
      // Step 6: Human-like page interaction and analysis
      console.log('\n🔍 Step 6: Human-like Page Analysis');
      const analysisStart = Date.now();
      
      // Wait for page to fully load
      await page.waitForLoadState('networkidle');
      await this.humanDelay(2000, 4000);
      
      // Get page title and URL
      const pageTitle = await page.title();
      const currentUrl = page.url();
      
      console.log(`   📄 Page Title: ${pageTitle}`);
      console.log(`   🔗 Current URL: ${currentUrl}`);
      
      // Human-like scrolling to load content
      console.log('   📜 Human-like scrolling to load content...');
      await this.humanScroll(page, 'down', 500);
      await this.humanDelay(2000, 3000);
      
      // Check for authentication indicators
      console.log('   🔍 Checking authentication indicators...');
      
      const authElements = [
        '.feed-identity-module',
        '[data-test-id="nav-user-menu"]',
        '.global-nav__me',
        '.artdeco-dropdown__trigger--placement-bottom',
        '[data-control-name="nav.settings_and_privacy"]',
        '.feed-shared-update-v2',
        '.scaffold-layout__sidebar',
        '.feed-shared-actor'
      ];
      
      let foundElements = [];
      let authScore = 0;
      
      for (const selector of authElements) {
        try {
          const element = await page.$(selector);
          if (element) {
            foundElements.push(selector);
            authScore++;
            console.log(`   ✅ Found: ${selector}`);
            
            // Human-like interaction with found elements
            await this.humanMouseMove(page, selector);
            await this.humanDelay(500, 1000);
          }
        } catch (error) {
          console.log(`   ❌ Not found: ${selector}`);
        }
      }
      
      // Check for login indicators (bad signs)
      const loginElements = [
        'input[name="session_key"]',
        'input[name="session_password"]',
        '.sign-in-form',
        '.login-form',
        '[data-test-id="sign-in-form"]'
      ];
      
      let loginFound = false;
      for (const selector of loginElements) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`   🚫 Login element found: ${selector}`);
            loginFound = true;
          }
        } catch (error) {
          // Expected - no login elements is good
        }
      }
      
      console.log(`   ✅ Analysis completed in ${Date.now() - analysisStart}ms`);
      
      // Step 7: Determine authentication status
      console.log('\n🎯 Step 7: Authentication Status Determination');
      
      let isAuthenticated = false;
      let status = 'INVALID';
      let confidence = 0;
      
      // Check URL patterns
      if (currentUrl.includes('/login') || currentUrl.includes('/uas/login')) {
        console.log('   ❌ Redirected to login page - Cookie INVALID');
        status = 'INVALID';
        confidence = 95;
      } else if (currentUrl.includes('/feed/') && !loginFound) {
        console.log('   ✅ On feed page without login elements');
        isAuthenticated = true;
        status = 'ACTIVE';
        confidence += 30;
      }
      
      // Check authentication elements
      if (authScore >= 3) {
        console.log(`   ✅ Found ${authScore} authentication indicators`);
        isAuthenticated = true;
        status = 'ACTIVE';
        confidence += authScore * 15;
      } else if (authScore >= 1) {
        console.log(`   ⚠️  Found ${authScore} authentication indicators (weak)`);
        confidence += authScore * 10;
      }
      
      // Check page title
      if (pageTitle.toLowerCase().includes('linkedin') && 
          !pageTitle.toLowerCase().includes('sign in') &&
          !pageTitle.toLowerCase().includes('login')) {
        console.log('   ✅ Page title indicates authenticated session');
        confidence += 20;
      }
      
      // Final determination
      if (confidence >= 50 && !loginFound) {
        isAuthenticated = true;
        status = 'ACTIVE';
      }
      
      console.log(`   🎯 Authentication Status: ${status}`);
      console.log(`   📊 Confidence Score: ${Math.min(confidence, 100)}%`);
      console.log(`   🔍 Elements Found: ${foundElements.length}`);
      console.log(`   🚫 Login Elements: ${loginFound ? 'Found' : 'None'}`);
      
      // Step 8: Additional human-like interactions if authenticated
      if (isAuthenticated && this.debugMode) {
        console.log('\n🤖 Step 8: Additional Human-like Interactions (Debug Mode)');
        
        // Try to interact with feed elements
        try {
          const feedPosts = await page.$$('.feed-shared-update-v2');
          if (feedPosts.length > 0) {
            console.log(`   📰 Found ${feedPosts.length} feed posts`);
            
            // Human-like interaction with first post
            await this.humanMouseMove(page, '.feed-shared-update-v2:first-child');
            await this.humanDelay(2000, 3000);
            
            // Scroll to see more posts
            await this.humanScroll(page, 'down', 800);
            await this.humanDelay(3000, 5000);
          }
        } catch (error) {
          console.log('   ⚠️  Could not interact with feed posts');
        }
        
        // Try to access profile menu
        try {
          const profileMenu = await page.$('[data-test-id="nav-user-menu"]');
          if (profileMenu) {
            console.log('   👤 Profile menu accessible');
            await this.humanMouseMove(page, '[data-test-id="nav-user-menu"]');
            await this.humanDelay(1000, 2000);
          }
        } catch (error) {
          console.log('   ⚠️  Could not access profile menu');
        }
      }
      
      // Step 9: Take screenshot for debugging
      if (this.debugMode) {
        console.log('\n📸 Step 9: Taking Debug Screenshot');
        const screenshotPath = path.join(__dirname, 'debug-linkedin-login.png');
        await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true 
        });
        console.log(`   📸 Screenshot saved: ${screenshotPath}`);
      }
      
      // Final results
      const totalTime = Date.now() - launchStart;
      
      console.log('\n🎉 === TEST RESULTS ===');
      console.log(`Cookie Status: ${status}`);
      console.log(`Authentication: ${isAuthenticated ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Confidence: ${Math.min(confidence, 100)}%`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Page Title: ${pageTitle}`);
      console.log(`Final URL: ${currentUrl}`);
      console.log(`Elements Found: ${foundElements.join(', ')}`);
      
      if (this.debugMode) {
        console.log('\n🐛 DEBUG MODE: Browser will stay open for manual inspection');
        console.log('Press Ctrl+C to close when done debugging');
        
        // Keep browser open in debug mode
        await new Promise(() => {}); // Wait indefinitely
      }
      
      return {
        isAuthenticated,
        status,
        confidence: Math.min(confidence, 100),
        totalTime,
        pageTitle,
        finalUrl: currentUrl,
        elementsFound: foundElements,
        loginElementsFound: loginFound
      };
      
    } catch (error) {
      console.error('\n❌ === TEST FAILED ===');
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      
      if (this.debugMode && page) {
        console.log('\n📸 Taking error screenshot...');
        try {
          const errorScreenshotPath = path.join(__dirname, 'error-linkedin-login.png');
          await page.screenshot({ 
            path: errorScreenshotPath, 
            fullPage: true 
          });
          console.log(`   📸 Error screenshot saved: ${errorScreenshotPath}`);
        } catch (screenshotError) {
          console.error('Could not take error screenshot:', screenshotError.message);
        }
      }
      
      throw error;
      
    } finally {
      if (!this.debugMode) {
        console.log('\n🧹 Cleaning up...');
        try {
          if (page) await page.close();
          if (context) await context.close();
          if (browser) await browser.close();
          console.log('✅ Cleanup completed');
        } catch (cleanupError) {
          console.error('⚠️  Cleanup error:', cleanupError.message);
        }
      }
    }
  }
}

// Run test with debug mode support
if (require.main === module) {
  const tester = new HumanLikeLinkedInTester();
  
  // Check for debug mode
  if (process.argv.includes('--debug') || process.env.PLAYWRIGHT_DEBUG === 'true') {
    process.env.PLAYWRIGHT_DEBUG = 'true';
    console.log('🐛 DEBUG MODE ENABLED - Browser will stay open for inspection');
  }
  
  tester.testLinkedInLogin().catch(error => {
    console.error('Test failed:', error.message);
    process.exit(1);
  });
}

module.exports = HumanLikeLinkedInTester;