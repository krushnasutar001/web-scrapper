/**
 * Performance-Optimized LinkedIn Cookie Validator
 * Includes precise timing measurements, parallel processing, and bottleneck identification
 */

const { chromium } = require('playwright');

class RealLinkedInValidator {
  constructor() {
    this.browsers = new Map();
    this.validationQueue = [];
    this.isProcessing = false;
    this.defaultConcurrency = 5;
    this.enableProxyComparison = false;
  }

  /**
   * Performance timer utility
   */
  createTimer() {
    const start = Date.now();
    return {
      start,
      elapsed: () => Date.now() - start,
      mark: (label) => {
        const elapsed = Date.now() - start;
        return { label, elapsed };
      }
    };
  }

  /**
   * Structured logging for performance analysis
   */
  logPerformance(accountName, timings, error = null) {
    console.log(`\n[Account: ${accountName}]`);
    
    if (error) {
      console.log(`❌ Error: ${error.type} after ${error.elapsed}ms`);
      console.log(`   Step: ${error.step}`);
      if (error.proxy) console.log(`   Proxy: ${error.proxy}`);
      console.log(`   Total Time: ${error.totalTime}ms`);
      return;
    }

    // Log individual step timings
    timings.forEach(timing => {
      console.log(`   ${timing.label}: ${timing.elapsed}ms`);
    });
    
    const totalTime = timings[timings.length - 1]?.elapsed || 0;
    console.log(`   Total Time: ${totalTime}ms`);
    console.log(`   Status: ${timings.find(t => t.status)?.status || 'Unknown'}`);
  }

  /**
   * Enhanced validation with precise timing measurements
   */
  async validateCookieWithTiming(liAtCookie, proxyConfig = null, accountId = null, accountName = 'Unknown') {
    const globalTimer = this.createTimer();
    const timings = [];
    let browser = null;
    let context = null;
    
    try {
      console.log(`\n🔍 [${accountName}] Starting performance-optimized validation...`);
      console.log(`   Headless mode: ENABLED`);
      console.log(`   Proxy: ${proxyConfig ? proxyConfig.url : 'None'}`);
      
      // Step 1: Browser Launch
      const browserTimer = this.createTimer();
      const launchOptions = {
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
          '--disable-renderer-backgrounding'
        ]
      };
      
      browser = await chromium.launch(launchOptions);
      timings.push({ label: 'Browser Launch', elapsed: browserTimer.elapsed() });
      
      // Step 2: Proxy Setup (if configured)
      const proxyTimer = this.createTimer();
      const contextOptions = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US'
      };
      
      if (proxyConfig && proxyConfig.url) {
        contextOptions.proxy = {
          server: proxyConfig.url,
          username: proxyConfig.username || undefined,
          password: proxyConfig.password || undefined
        };
      }
      
      context = await browser.newContext(contextOptions);
      timings.push({ label: 'Proxy Setup', elapsed: proxyTimer.elapsed() });
      
      // Step 3: Cookie Injection
      const cookieTimer = this.createTimer();
      await context.addCookies([{
        name: 'li_at',
        value: liAtCookie,
        domain: '.linkedin.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      }]);
      timings.push({ label: 'Cookie Injection', elapsed: cookieTimer.elapsed() });
      
      const page = await context.newPage();
      
      // Step 4: Navigation to LinkedIn Feed
      const navTimer = this.createTimer();
      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle',
        timeout: 15000
      });
      timings.push({ label: 'Navigation', elapsed: navTimer.elapsed() });
      
      // Step 5: Session Validation
      const validationTimer = this.createTimer();
      const finalUrl = page.url();
      const pageTitle = await page.title();
      
      // Check for login redirect
      const isLoginPage = finalUrl.includes('/login') || 
                         finalUrl.includes('/uas/login') || 
                         finalUrl.includes('/checkpoint/') ||
                         pageTitle.toLowerCase().includes('sign in');
      
      let isAuthenticated = false;
      let validationStatus = 'INVALID';
      
      if (!isLoginPage) {
        // Look for authenticated page indicators
        try {
          // Check for feed-specific elements
          const feedElements = await Promise.race([
            page.waitForSelector('.feed-identity-module', { timeout: 3000 }).then(() => 'feed-identity'),
            page.waitForSelector('[data-test-id="nav-user-menu"]', { timeout: 3000 }).then(() => 'nav-menu'),
            page.waitForSelector('.global-nav__me', { timeout: 3000 }).then(() => 'global-nav'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ]).catch(() => null);
          
          if (feedElements) {
            isAuthenticated = true;
            validationStatus = 'ACTIVE';
          }
        } catch (elementError) {
          // Fallback: check URL and title patterns
          isAuthenticated = finalUrl.includes('/feed/') && 
                           pageTitle.toLowerCase().includes('linkedin') &&
                           !pageTitle.toLowerCase().includes('sign in');
          validationStatus = isAuthenticated ? 'ACTIVE' : 'INVALID';
        }
      }
      
      timings.push({ 
        label: 'Validation Check', 
        elapsed: validationTimer.elapsed(),
        status: validationStatus
      });
      
      // Log performance results
      this.logPerformance(accountName, timings);
      
      return {
        isValid: validationStatus === 'ACTIVE',
        status: validationStatus,
        message: isAuthenticated ? 'LinkedIn authentication successful' : 'Authentication failed - redirected to login',
        finalUrl: finalUrl,
        pageTitle: pageTitle,
        timestamp: new Date().toISOString(),
        accountId: accountId,
        timings: timings,
        totalTime: globalTimer.elapsed()
      };
      
    } catch (error) {
      const errorInfo = {
        type: error.name || 'ValidationError',
        step: error.message.includes('goto') ? 'page.goto("https://www.linkedin.com/feed/")' : 
              error.message.includes('launch') ? 'browser.launch()' :
              error.message.includes('cookie') ? 'context.addCookies()' : 'Unknown',
        elapsed: globalTimer.elapsed(),
        proxy: proxyConfig?.url || 'None',
        totalTime: globalTimer.elapsed()
      };
      
      this.logPerformance(accountName, [], errorInfo);
      
      return {
        isValid: false,
        status: 'INVALID',
        message: `Validation failed: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString(),
        accountId: accountId,
        timings: timings,
        totalTime: globalTimer.elapsed()
      };
      
    } finally {
      try {
        if (context) await context.close();
        if (browser) await browser.close();
      } catch (cleanupError) {
        console.error(`⚠️ [${accountName}] Cleanup error:`, cleanupError.message);
      }
    }
  }

  /**
   * Validate with proxy comparison (proxy vs no-proxy)
   */
  async validateWithProxyComparison(liAtCookie, proxyConfig, accountId, accountName) {
    console.log(`\n🔄 [${accountName}] Running proxy comparison validation...`);
    
    // Test without proxy first
    console.log(`\n📊 Testing WITHOUT proxy:`);
    const noProxyResult = await this.validateCookieWithTiming(liAtCookie, null, accountId, `${accountName}-NoProxy`);
    
    // Test with proxy
    console.log(`\n📊 Testing WITH proxy:`);
    const proxyResult = await this.validateCookieWithTiming(liAtCookie, proxyConfig, accountId, `${accountName}-WithProxy`);
    
    // Compare results
    console.log(`\n📈 [${accountName}] Proxy Comparison Results:`);
    console.log(`   No Proxy Total Time: ${noProxyResult.totalTime}ms`);
    console.log(`   With Proxy Total Time: ${proxyResult.totalTime}ms`);
    console.log(`   Proxy Overhead: ${proxyResult.totalTime - noProxyResult.totalTime}ms`);
    console.log(`   No Proxy Status: ${noProxyResult.status}`);
    console.log(`   With Proxy Status: ${proxyResult.status}`);
    
    // Return the proxy result (as that's what will be used in production)
    return proxyResult;
  }

  /**
   * Parallel validation with configurable concurrency
   */
  async validateMultipleCookiesParallel(validationConfigs, concurrency = this.defaultConcurrency) {
    console.log(`\n🚀 Starting parallel validation of ${validationConfigs.length} accounts`);
    console.log(`   Concurrency: ${concurrency}`);
    console.log(`   Proxy Comparison: ${this.enableProxyComparison ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Start Time: ${new Date().toISOString()}`);
    
    const results = [];
    const chunks = this.chunkArray(validationConfigs, concurrency);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n📦 Processing batch ${i + 1}/${chunks.length} (${chunk.length} accounts)`);
      
      const batchStartTime = Date.now();
      
      // Process chunk in parallel
      const chunkPromises = chunk.map(async (config, index) => {
        const accountName = config.accountName || `Account-${i * concurrency + index + 1}`;
        const startTime = Date.now();
        
        console.log(`⏱️  [${accountName}] Validation started at ${new Date(startTime).toISOString()}`);
        
        try {
          let result;
          
          if (this.enableProxyComparison && config.proxyConfig) {
            result = await this.validateWithProxyComparison(
              config.liAtCookie, 
              config.proxyConfig, 
              config.accountId, 
              accountName
            );
          } else {
            result = await this.validateCookieWithTiming(
              config.liAtCookie, 
              config.proxyConfig, 
              config.accountId, 
              accountName
            );
          }
          
          const endTime = Date.now();
          console.log(`✅ [${accountName}] Validation completed at ${new Date(endTime).toISOString()} (${endTime - startTime}ms)`);
          
          return result;
          
        } catch (error) {
          const endTime = Date.now();
          console.log(`❌ [${accountName}] Validation failed at ${new Date(endTime).toISOString()} (${endTime - startTime}ms)`);
          
          return {
            isValid: false,
            status: 'INVALID',
            message: `Validation failed: ${error.message}`,
            error: error.message,
            timestamp: new Date().toISOString(),
            accountId: config.accountId,
            totalTime: endTime - startTime
          };
        }
      });
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      // Process results
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const config = chunk[index];
          const accountName = config.accountName || `Account-${i * concurrency + index + 1}`;
          
          console.error(`❌ [${accountName}] Promise rejected:`, result.reason);
          
          results.push({
            isValid: false,
            status: 'INVALID',
            message: `Promise rejected: ${result.reason}`,
            error: result.reason,
            timestamp: new Date().toISOString(),
            accountId: config.accountId
          });
        }
      });
      
      const batchTime = Date.now() - batchStartTime;
      console.log(`📊 Batch ${i + 1} completed in ${batchTime}ms`);
      
      // Rate limiting between batches
      if (i < chunks.length - 1) {
        console.log(`⏳ Waiting 1 second before next batch...`);
        await this.sleep(1000);
      }
    }
    
    // Final summary
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.length - validCount;
    const avgTime = results.reduce((sum, r) => sum + (r.totalTime || 0), 0) / results.length;
    
    console.log(`\n🎯 Parallel validation complete:`);
    console.log(`   Total Accounts: ${results.length}`);
    console.log(`   ACTIVE: ${validCount}`);
    console.log(`   INVALID: ${invalidCount}`);
    console.log(`   Average Time: ${Math.round(avgTime)}ms`);
    console.log(`   End Time: ${new Date().toISOString()}`);
    
    return results;
  }

  /**
   * Main validation method (backwards compatible)
   */
  async validateCookie(liAtCookie, proxyConfig = null, accountId = null) {
    const accountName = accountId || 'Unknown';
    return await this.validateCookieWithTiming(liAtCookie, proxyConfig, accountId, accountName);
  }

  /**
   * Main multiple validation method (backwards compatible)
   */
  async validateMultipleCookies(validationConfigs, concurrency = this.defaultConcurrency) {
    return await this.validateMultipleCookiesParallel(validationConfigs, concurrency);
  }

  /**
   * Enable/disable proxy comparison mode
   */
  setProxyComparison(enabled) {
    this.enableProxyComparison = enabled;
    console.log(`🔧 Proxy comparison mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Set default concurrency
   */
  setConcurrency(concurrency) {
    this.defaultConcurrency = concurrency;
    console.log(`🔧 Default concurrency set to: ${concurrency}`);
  }

  /**
   * Utility methods
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log('🧹 Cleaning up validator resources...');
    
    for (const [id, browser] of this.browsers) {
      try {
        await browser.close();
        console.log(`✅ Closed browser for account: ${id}`);
      } catch (error) {
        console.error(`❌ Error closing browser for ${id}:`, error.message);
      }
    }
    
    this.browsers.clear();
    console.log('✅ Validator cleanup complete');
  }
}

module.exports = RealLinkedInValidator;