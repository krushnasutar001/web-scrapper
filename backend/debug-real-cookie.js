/**
 * Real LinkedIn Cookie Debug Script
 * Tests actual cookie with detailed timing and error analysis
 */

const { chromium } = require('playwright');

// Real cookie provided by user
const REAL_COOKIE = 'AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mPiwZMannH_NVPXf8UzpbLO0_PEH0xLYEp9As3KuIf0C_OsNdZ2gxPBc4DEbk08-HytchRmqAgFVsbfYthSBRx3Kpg2nP7Gjnu4Q83';

class RealCookieDebugger {
  constructor() {
    this.timings = [];
    this.errors = [];
  }

  logTiming(step, startTime) {
    const elapsed = Date.now() - startTime;
    this.timings.push({ step, elapsed });
    console.log(`⏱️  ${step}: ${elapsed}ms`);
    return elapsed;
  }

  logError(step, error, elapsed) {
    const errorInfo = {
      step,
      error: error.message,
      type: error.name,
      elapsed
    };
    this.errors.push(errorInfo);
    console.log(`❌ ${step} FAILED after ${elapsed}ms:`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Type: ${error.name}`);
  }

  async debugRealCookie() {
    console.log('🔍 === REAL LINKEDIN COOKIE DEBUG SESSION ===');
    console.log(`Cookie: ${REAL_COOKIE.substring(0, 20)}...${REAL_COOKIE.substring(REAL_COOKIE.length - 10)}`);
    console.log(`Cookie Length: ${REAL_COOKIE.length} characters`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    console.log('\n📊 STEP-BY-STEP TIMING ANALYSIS:');
    
    let browser = null;
    let context = null;
    let page = null;
    const globalStart = Date.now();
    
    try {
      // Step 1: Browser Launch
      console.log('\n🚀 Step 1: Browser Launch');
      const browserStart = Date.now();
      
      try {
        browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-web-security',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection'
          ]
        });
        this.logTiming('Browser Launch', browserStart);
      } catch (error) {
        this.logError('Browser Launch', error, Date.now() - browserStart);
        throw error;
      }
      
      // Step 2: Context Creation
      console.log('\n🌐 Step 2: Context Creation');
      const contextStart = Date.now();
      
      try {
        context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1920, height: 1080 },
          locale: 'en-US',
          ignoreHTTPSErrors: true
        });
        this.logTiming('Context Creation', contextStart);
      } catch (error) {
        this.logError('Context Creation', error, Date.now() - contextStart);
        throw error;
      }
      
      // Step 3: Cookie Injection
      console.log('\n🍪 Step 3: Cookie Injection');
      const cookieStart = Date.now();
      
      try {
        await context.addCookies([{
          name: 'li_at',
          value: REAL_COOKIE,
          domain: '.linkedin.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'None'
        }]);
        this.logTiming('Cookie Injection', cookieStart);
        
        // Verify cookie was set
        const cookies = await context.cookies();
        const liAtCookie = cookies.find(c => c.name === 'li_at');
        console.log(`   ✅ Cookie verified: ${liAtCookie ? 'SET' : 'NOT SET'}`);
        if (liAtCookie) {
          console.log(`   📝 Cookie value matches: ${liAtCookie.value === REAL_COOKIE}`);
        }
      } catch (error) {
        this.logError('Cookie Injection', error, Date.now() - cookieStart);
        throw error;
      }
      
      // Step 4: Page Creation
      console.log('\n📄 Step 4: Page Creation');
      const pageStart = Date.now();
      
      try {
        page = await context.newPage();
        this.logTiming('Page Creation', pageStart);
      } catch (error) {
        this.logError('Page Creation', error, Date.now() - pageStart);
        throw error;
      }
      
      // Step 5: LinkedIn Navigation
      console.log('\n🌐 Step 5: LinkedIn Navigation');
      const navStart = Date.now();
      
      try {
        console.log('   🔗 Navigating to: https://www.linkedin.com/feed/');
        
        const response = await page.goto('https://www.linkedin.com/feed/', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        
        const navElapsed = this.logTiming('LinkedIn Navigation', navStart);
        
        console.log(`   📊 Response Status: ${response.status()}`);
        console.log(`   🔗 Final URL: ${page.url()}`);
        console.log(`   📄 Page Title: ${await page.title()}`);
        
        // Check for redirects
        const finalUrl = page.url();
        if (finalUrl.includes('/login') || finalUrl.includes('/uas/login')) {
          console.log('   ⚠️  REDIRECTED TO LOGIN - Cookie may be invalid/expired');
        } else if (finalUrl.includes('/feed/')) {
          console.log('   ✅ Successfully reached LinkedIn feed');
        } else {
          console.log(`   ❓ Unexpected URL: ${finalUrl}`);
        }
        
      } catch (error) {
        this.logError('LinkedIn Navigation', error, Date.now() - navStart);
        
        // Try to get more info about the error
        if (error.message.includes('timeout')) {
          console.log('   🕐 TIMEOUT ERROR - LinkedIn may be slow or blocking requests');
        } else if (error.message.includes('net::')) {
          console.log('   🌐 NETWORK ERROR - Connection issues detected');
        }
        
        throw error;
      }
      
      // Step 6: Authentication Verification
      console.log('\n🔐 Step 6: Authentication Verification');
      const authStart = Date.now();
      
      try {
        // Check for authenticated elements
        const authElements = [
          '.feed-identity-module',
          '[data-test-id="nav-user-menu"]',
          '.global-nav__me',
          '.artdeco-dropdown__trigger--placement-bottom',
          '[data-control-name="nav.settings_and_privacy"]'
        ];
        
        let foundElement = null;
        for (const selector of authElements) {
          try {
            const element = await page.waitForSelector(selector, { timeout: 3000 });
            if (element) {
              foundElement = selector;
              console.log(`   ✅ Found authenticated element: ${selector}`);
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        if (!foundElement) {
          console.log('   ❌ No authenticated elements found');
          
          // Check for login indicators
          const loginSelectors = [
            'input[name="session_key"]',
            'input[name="session_password"]',
            '.sign-in-form',
            '.login-form'
          ];
          
          for (const selector of loginSelectors) {
            try {
              const element = await page.$(selector);
              if (element) {
                console.log(`   🚫 Found login element: ${selector} - Cookie is INVALID`);
                break;
              }
            } catch (e) {
              // Continue
            }
          }
        }
        
        this.logTiming('Authentication Verification', authStart);
        
      } catch (error) {
        this.logError('Authentication Verification', error, Date.now() - authStart);
        // Don't throw - this is verification step
      }
      
      // Step 7: Performance Analysis
      console.log('\n📈 Step 7: Performance Analysis');
      const totalTime = Date.now() - globalStart;
      
      console.log('\n🎯 === PERFORMANCE SUMMARY ===');
      console.log(`Total Validation Time: ${totalTime}ms`);
      
      // Find bottleneck
      const slowestStep = this.timings.reduce((prev, current) => 
        (prev.elapsed > current.elapsed) ? prev : current
      );
      console.log(`Slowest Step: ${slowestStep.step} (${slowestStep.elapsed}ms)`);
      
      // Performance recommendations
      console.log('\n💡 === PERFORMANCE RECOMMENDATIONS ===');
      
      const browserLaunch = this.timings.find(t => t.step === 'Browser Launch');
      if (browserLaunch && browserLaunch.elapsed > 1000) {
        console.log('⚠️  Browser launch is slow (>1s). Consider:');
        console.log('   - Using browser reuse/pooling');
        console.log('   - Upgrading hardware (more RAM/faster CPU)');
        console.log('   - Using lighter browser options');
      }
      
      const navigation = this.timings.find(t => t.step === 'LinkedIn Navigation');
      if (navigation && navigation.elapsed > 5000) {
        console.log('⚠️  LinkedIn navigation is very slow (>5s). Consider:');
        console.log('   - Checking network connectivity');
        console.log('   - Using different LinkedIn endpoints');
        console.log('   - Implementing request retries');
        console.log('   - LinkedIn may be rate limiting');
      }
      
      if (totalTime > 10000) {
        console.log('🚨 CRITICAL: Total validation time >10s is too slow for production');
        console.log('   - Consider implementing cookie validation caching');
        console.log('   - Use background validation queues');
        console.log('   - Implement timeout limits');
      }
      
    } catch (error) {
      console.log('\n❌ === VALIDATION FAILED ===');
      console.log(`Total time before failure: ${Date.now() - globalStart}ms`);
      console.log(`Final error: ${error.message}`);
      
    } finally {
      // Cleanup
      console.log('\n🧹 Cleanup...');
      const cleanupStart = Date.now();
      
      try {
        if (page) await page.close();
        if (context) await context.close();
        if (browser) await browser.close();
        console.log(`✅ Cleanup completed in ${Date.now() - cleanupStart}ms`);
      } catch (cleanupError) {
        console.log(`⚠️  Cleanup error: ${cleanupError.message}`);
      }
    }
    
    console.log('\n🏁 === DEBUG SESSION COMPLETE ===');
    console.log(`End Time: ${new Date().toISOString()}`);
    
    // Final summary
    if (this.errors.length > 0) {
      console.log('\n🚨 ERRORS ENCOUNTERED:');
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.step}: ${error.error} (${error.elapsed}ms)`);
      });
    }
    
    console.log('\n📊 ALL TIMINGS:');
    this.timings.forEach(timing => {
      console.log(`   ${timing.step}: ${timing.elapsed}ms`);
    });
  }
}

// Run debug if this file is executed directly
if (require.main === module) {
  const cookieDebugger = new RealCookieDebugger();
  cookieDebugger.debugRealCookie().catch(console.error);
}

module.exports = RealCookieDebugger;