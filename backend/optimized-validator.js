/**
 * LinkedIn Cookie Manager
 * Integrated cookie validation and management system with database compatibility
 * Uses HTTP-first validation with browser fallback for maximum performance
 */

const https = require('https');
const { chromium } = require('playwright');

class LinkedInCookieManager {
  constructor() {
    this.httpTimeout = 5000; // 5 second timeout for HTTP requests
    this.browserTimeout = 15000; // 15 second timeout for browser validation
    this.useHttpFirst = true; // Use HTTP validation first, browser as fallback
  }

  /**
   * Fast HTTP-based cookie validation
   */
  async validateCookieHTTP(liAtCookie, accountId = null) {
    const startTime = Date.now();
    console.log(`🚀 [${accountId}] Starting HTTP validation...`);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.linkedin.com',
        path: '/feed/',
        method: 'GET',
        headers: {
          'Cookie': `li_at=${liAtCookie}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'DNT': '1',
          'Connection': 'close'
        },
        timeout: this.httpTimeout
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        
        res.on('end', () => {
          const elapsed = Date.now() - startTime;
          console.log(`⚡ [${accountId}] HTTP validation completed in ${elapsed}ms`);
          
          // Analyze response
          const isValid = this.analyzeHTTPResponse(res.statusCode, res.headers, data, accountId);
          
          resolve({
            isValid,
            status: isValid ? 'ACTIVE' : 'INVALID',
            method: 'HTTP',
            message: isValid ? 'HTTP validation successful' : 'HTTP validation failed',
            statusCode: res.statusCode,
            elapsed,
            accountId,
            timestamp: new Date().toISOString()
          });
        });
      });

      req.on('error', (error) => {
        const elapsed = Date.now() - startTime;
        console.log(`❌ [${accountId}] HTTP validation failed in ${elapsed}ms: ${error.message}`);
        
        resolve({
          isValid: false,
          status: 'INVALID',
          method: 'HTTP',
          message: `HTTP validation failed: ${error.message}`,
          error: error.message,
          elapsed,
          accountId,
          timestamp: new Date().toISOString()
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const elapsed = Date.now() - startTime;
        console.log(`⏰ [${accountId}] HTTP validation timeout after ${elapsed}ms`);
        
        resolve({
          isValid: false,
          status: 'INVALID',
          method: 'HTTP',
          message: 'HTTP validation timeout',
          elapsed,
          accountId,
          timestamp: new Date().toISOString()
        });
      });

      req.end();
    });
  }

  /**
   * Analyze HTTP response to determine if cookie is valid
   */
  analyzeHTTPResponse(statusCode, headers, body, accountId) {
    console.log(`📊 [${accountId}] HTTP Response Analysis:`);
    console.log(`   Status: ${statusCode}`);
    
    // Check for redirects
    if (statusCode === 302 || statusCode === 301) {
      const location = headers.location;
      console.log(`   Redirect: ${location}`);
      
      if (location && (location.includes('/login') || location.includes('/uas/login'))) {
        console.log(`   ❌ Redirected to login - Cookie INVALID`);
        return false;
      } else if (location && (location.includes('/feed/') || location.includes('linkedin.com'))) {
        console.log(`   ✅ Redirected to LinkedIn feed - Cookie ACTIVE`);
        return true;
      }
    }
    
    // Check for successful response
    if (statusCode === 200) {
      const bodyLower = body.toLowerCase();
      
      // Look for login indicators (bad)
      if (bodyLower.includes('sign in to linkedin') || 
          bodyLower.includes('join linkedin') ||
          bodyLower.includes('login-form')) {
        console.log(`   ❌ Response contains login form - Cookie INVALID`);
        return false;
      }
      
      // Look for authenticated indicators (good)
      const authIndicators = [
        'feed-identity-module',
        'global-nav',
        'artdeco-dropdown',
        'nav-user-menu',
        'linkedin.com/in/',
        'voyager'
      ];
      
      const foundIndicators = authIndicators.filter(indicator => 
        bodyLower.includes(indicator)
      );
      
      if (foundIndicators.length > 0) {
        console.log(`   ✅ Found ${foundIndicators.length} auth indicators - Cookie ACTIVE`);
        return true;
      }
      
      // If we get a 200 but no clear indicators, assume valid
      console.log(`   ✅ Got 200 response - Cookie likely ACTIVE`);
      return true;
    }
    
    // Other status codes
    if (statusCode === 401) {
      console.log(`   ❌ 401 Unauthorized - Cookie INVALID`);
      return false;
    }
    
    if (statusCode === 403) {
      console.log(`   ⚠️  403 Forbidden - Cookie may be valid but restricted`);
      return true; // Assume valid but restricted
    }
    
    console.log(`   ❓ Unexpected status ${statusCode} - assuming INVALID`);
    return false;
  }

  /**
   * Browser-based validation (fallback)
   */
  async validateCookieBrowser(liAtCookie, proxyConfig = null, accountId = null) {
    const startTime = Date.now();
    console.log(`🌐 [${accountId}] Starting browser validation (fallback)...`);
    
    let browser = null;
    let context = null;
    
    try {
      // Launch browser
      const browserStart = Date.now();
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-extensions'
        ]
      });
      console.log(`   🚀 Browser launched in ${Date.now() - browserStart}ms`);
      
      // Create context
      const contextStart = Date.now();
      const contextOptions = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      };
      
      if (proxyConfig && proxyConfig.url) {
        contextOptions.proxy = {
          server: proxyConfig.url,
          username: proxyConfig.username,
          password: proxyConfig.password
        };
      }
      
      context = await browser.newContext(contextOptions);
      console.log(`   🌐 Context created in ${Date.now() - contextStart}ms`);
      
      // Inject cookie
      const cookieStart = Date.now();
      await context.addCookies([{
        name: 'li_at',
        value: liAtCookie,
        domain: '.linkedin.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      }]);
      console.log(`   🍪 Cookie injected in ${Date.now() - cookieStart}ms`);
      
      // Navigate
      const navStart = Date.now();
      const page = await context.newPage();
      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle',
        timeout: this.browserTimeout
      });
      console.log(`   🌐 Navigation completed in ${Date.now() - navStart}ms`);
      
      // Validate
      const finalUrl = page.url();
      const isValid = !finalUrl.includes('/login') && !finalUrl.includes('/uas/login');
      
      const elapsed = Date.now() - startTime;
      console.log(`🎯 [${accountId}] Browser validation completed in ${elapsed}ms - ${isValid ? 'ACTIVE' : 'INVALID'}`);
      
      return {
        isValid,
        status: isValid ? 'ACTIVE' : 'INVALID',
        method: 'Browser',
        message: isValid ? 'Browser validation successful' : 'Browser validation failed',
        finalUrl,
        elapsed,
        accountId,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`❌ [${accountId}] Browser validation failed in ${elapsed}ms: ${error.message}`);
      
      return {
        isValid: false,
        status: 'INVALID',
        method: 'Browser',
        message: `Browser validation failed: ${error.message}`,
        error: error.message,
        elapsed,
        accountId,
        timestamp: new Date().toISOString()
      };
      
    } finally {
      try {
        if (context) await context.close();
        if (browser) await browser.close();
      } catch (cleanupError) {
        console.error(`⚠️ [${accountId}] Cleanup error:`, cleanupError.message);
      }
    }
  }

  /**
   * Main validation method - HTTP first, browser fallback
   */
  async validateCookie(liAtCookie, proxyConfig = null, accountId = null) {
    const globalStart = Date.now();
    console.log(`\n🔍 [${accountId}] Starting optimized validation...`);
    
    try {
      // Try HTTP validation first (much faster)
      if (this.useHttpFirst) {
        const httpResult = await this.validateCookieHTTP(liAtCookie, accountId);
        
        // If HTTP validation is conclusive, return it
        if (httpResult.isValid || httpResult.statusCode === 401) {
          console.log(`✅ [${accountId}] HTTP validation conclusive: ${httpResult.status}`);
          return httpResult;
        }
        
        // If HTTP validation is inconclusive, fall back to browser
        console.log(`⚠️ [${accountId}] HTTP validation inconclusive, trying browser...`);
      }
      
      // Browser validation (fallback or primary)
      const browserResult = await this.validateCookieBrowser(liAtCookie, proxyConfig, accountId);
      
      const totalTime = Date.now() - globalStart;
      console.log(`🏁 [${accountId}] Total validation time: ${totalTime}ms`);
      
      return browserResult;
      
    } catch (error) {
      const totalTime = Date.now() - globalStart;
      console.log(`❌ [${accountId}] Validation failed after ${totalTime}ms: ${error.message}`);
      
      return {
        isValid: false,
        status: 'INVALID',
        method: 'Error',
        message: `Validation failed: ${error.message}`,
        error: error.message,
        elapsed: totalTime,
        accountId,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate multiple cookies with optimized concurrency
   */
  async validateMultipleCookies(validationConfigs, concurrency = 5) {
    console.log(`\n🚀 Starting optimized batch validation of ${validationConfigs.length} accounts`);
    console.log(`   Method: ${this.useHttpFirst ? 'HTTP-first with browser fallback' : 'Browser-only'}`);
    console.log(`   Concurrency: ${concurrency}`);
    
    const startTime = Date.now();
    const results = [];
    
    // Process in chunks
    for (let i = 0; i < validationConfigs.length; i += concurrency) {
      const chunk = validationConfigs.slice(i, i + concurrency);
      console.log(`\n📦 Processing batch ${Math.floor(i / concurrency) + 1} (${chunk.length} accounts)`);
      
      const chunkPromises = chunk.map(config => 
        this.validateCookie(
          config.liAtCookie, 
          config.proxyConfig, 
          config.accountName || config.accountId
        )
      );
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const config = chunk[index];
          results.push({
            isValid: false,
            status: 'INVALID',
            method: 'Error',
            message: `Promise rejected: ${result.reason}`,
            error: result.reason,
            accountId: config.accountName || config.accountId,
            timestamp: new Date().toISOString()
          });
        }
      });
    }
    
    const totalTime = Date.now() - startTime;
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.length - validCount;
    const avgTime = results.reduce((sum, r) => sum + (r.elapsed || 0), 0) / results.length;
    
    console.log(`\n🎯 Optimized batch validation complete:`);
    console.log(`   Total Time: ${totalTime}ms`);
    console.log(`   Average Time per Account: ${Math.round(avgTime)}ms`);
    console.log(`   ACTIVE: ${validCount}`);
    console.log(`   INVALID: ${invalidCount}`);
    
    // Method breakdown
    const httpCount = results.filter(r => r.method === 'HTTP').length;
    const browserCount = results.filter(r => r.method === 'Browser').length;
    
    if (httpCount > 0) {
      console.log(`   HTTP Validations: ${httpCount}`);
    }
    if (browserCount > 0) {
      console.log(`   Browser Validations: ${browserCount}`);
    }
    
    return results;
  }

  /**
   * Configuration methods
   */
  setHttpFirst(enabled) {
    this.useHttpFirst = enabled;
    console.log(`🔧 HTTP-first validation: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  setTimeouts(httpTimeout, browserTimeout) {
    this.httpTimeout = httpTimeout;
    this.browserTimeout = browserTimeout;
    console.log(`🔧 Timeouts set - HTTP: ${httpTimeout}ms, Browser: ${browserTimeout}ms`);
  }
}

module.exports = OptimizedLinkedInValidator;