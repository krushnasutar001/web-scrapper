/**
 * HTTP-based LinkedIn Cookie Debug Script
 * Tests cookie validation using direct HTTP requests (faster than browser)
 */

const https = require('https');
const http = require('http');

// Real cookie provided by user
const REAL_COOKIE = 'AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mPiwZMannH_NVPXf8UzpbLO0_PEH0xLYEp9As3KuIf0C_OsNdZ2gxPBc4DEbk08-HytchRmqAgFVsbfYthSBRx3Kpg2nP7Gjnu4Q83';

class HTTPCookieDebugger {
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

  makeLinkedInRequest(url, cookie) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.linkedin.com',
        path: url,
        method: 'GET',
        headers: {
          'Cookie': `li_at=${cookie}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            finalUrl: res.headers.location || url
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  async debugCookieHTTP() {
    console.log('🔍 === HTTP-BASED LINKEDIN COOKIE DEBUG ===');
    console.log(`Cookie: ${REAL_COOKIE.substring(0, 20)}...${REAL_COOKIE.substring(REAL_COOKIE.length - 10)}`);
    console.log(`Cookie Length: ${REAL_COOKIE.length} characters`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    console.log('\n📊 HTTP REQUEST TIMING ANALYSIS:');
    
    const globalStart = Date.now();
    
    try {
      // Test 1: LinkedIn Feed Request
      console.log('\n🌐 Test 1: LinkedIn Feed Request');
      const feedStart = Date.now();
      
      try {
        const feedResponse = await this.makeLinkedInRequest('/feed/', REAL_COOKIE);
        this.logTiming('Feed Request', feedStart);
        
        console.log(`   📊 Status Code: ${feedResponse.statusCode}`);
        console.log(`   🔗 Final URL: ${feedResponse.finalUrl}`);
        
        // Check for redirects
        if (feedResponse.statusCode === 302 || feedResponse.statusCode === 301) {
          const location = feedResponse.headers.location;
          console.log(`   🔄 Redirected to: ${location}`);
          
          if (location && (location.includes('/login') || location.includes('/uas/login'))) {
            console.log('   ❌ REDIRECTED TO LOGIN - Cookie is INVALID/EXPIRED');
          } else {
            console.log('   ❓ Redirected to unknown location');
          }
        } else if (feedResponse.statusCode === 200) {
          console.log('   ✅ SUCCESS - Got 200 response');
          
          // Check response body for authentication indicators
          const bodyLower = feedResponse.body.toLowerCase();
          
          if (bodyLower.includes('sign in') || bodyLower.includes('login')) {
            console.log('   ⚠️  Response contains login indicators - Cookie may be invalid');
          } else if (bodyLower.includes('feed') || bodyLower.includes('linkedin')) {
            console.log('   ✅ Response appears to be authenticated LinkedIn content');
          }
          
          // Check for specific LinkedIn authenticated elements
          const authIndicators = [
            'feed-identity-module',
            'global-nav',
            'artdeco-dropdown',
            'nav-user-menu'
          ];
          
          const foundIndicators = authIndicators.filter(indicator => 
            bodyLower.includes(indicator)
          );
          
          if (foundIndicators.length > 0) {
            console.log(`   ✅ Found ${foundIndicators.length} authentication indicators: ${foundIndicators.join(', ')}`);
          } else {
            console.log('   ❌ No authentication indicators found in response');
          }
        } else {
          console.log(`   ❓ Unexpected status code: ${feedResponse.statusCode}`);
        }
        
      } catch (error) {
        this.logError('Feed Request', error, Date.now() - feedStart);
      }
      
      // Test 2: LinkedIn Me Request
      console.log('\n👤 Test 2: LinkedIn Me Request');
      const meStart = Date.now();
      
      try {
        const meResponse = await this.makeLinkedInRequest('/me/', REAL_COOKIE);
        this.logTiming('Me Request', meStart);
        
        console.log(`   📊 Status Code: ${meResponse.statusCode}`);
        
        if (meResponse.statusCode === 302 || meResponse.statusCode === 301) {
          const location = meResponse.headers.location;
          console.log(`   🔄 Redirected to: ${location}`);
        } else if (meResponse.statusCode === 200) {
          console.log('   ✅ SUCCESS - Got 200 response for /me/');
        }
        
      } catch (error) {
        this.logError('Me Request', error, Date.now() - meStart);
      }
      
      // Test 3: LinkedIn API Request
      console.log('\n🔌 Test 3: LinkedIn API Request');
      const apiStart = Date.now();
      
      try {
        const apiResponse = await this.makeLinkedInRequest('/voyager/api/me', REAL_COOKIE);
        this.logTiming('API Request', apiStart);
        
        console.log(`   📊 Status Code: ${apiResponse.statusCode}`);
        
        if (apiResponse.statusCode === 401) {
          console.log('   ❌ 401 Unauthorized - Cookie is INVALID');
        } else if (apiResponse.statusCode === 403) {
          console.log('   ⚠️  403 Forbidden - Cookie may be valid but access restricted');
        } else if (apiResponse.statusCode === 200) {
          console.log('   ✅ SUCCESS - API request successful, cookie is VALID');
        }
        
      } catch (error) {
        this.logError('API Request', error, Date.now() - apiStart);
      }
      
      // Performance Analysis
      console.log('\n📈 === HTTP PERFORMANCE ANALYSIS ===');
      const totalTime = Date.now() - globalStart;
      console.log(`Total HTTP Test Time: ${totalTime}ms`);
      
      if (this.timings.length > 0) {
        const avgTime = this.timings.reduce((sum, t) => sum + t.elapsed, 0) / this.timings.length;
        console.log(`Average Request Time: ${Math.round(avgTime)}ms`);
        
        const slowestRequest = this.timings.reduce((prev, current) => 
          (prev.elapsed > current.elapsed) ? prev : current
        );
        console.log(`Slowest Request: ${slowestRequest.step} (${slowestRequest.elapsed}ms)`);
      }
      
      // Compare with browser-based validation
      console.log('\n🔄 === BROWSER vs HTTP COMPARISON ===');
      console.log(`HTTP Total Time: ${totalTime}ms`);
      console.log('Browser-based validation typically takes: 3000-8000ms');
      
      if (totalTime < 1000) {
        console.log('✅ HTTP validation is MUCH FASTER than browser-based');
        console.log('💡 Consider using HTTP-based validation for better performance');
      } else if (totalTime > 5000) {
        console.log('⚠️  HTTP requests are slow - network or LinkedIn issues');
      }
      
    } catch (error) {
      console.log('\n❌ === HTTP VALIDATION FAILED ===');
      console.log(`Total time before failure: ${Date.now() - globalStart}ms`);
      console.log(`Final error: ${error.message}`);
    }
    
    console.log('\n🏁 === HTTP DEBUG SESSION COMPLETE ===');
    console.log(`End Time: ${new Date().toISOString()}`);
    
    // Final summary
    if (this.errors.length > 0) {
      console.log('\n🚨 ERRORS ENCOUNTERED:');
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.step}: ${error.error} (${error.elapsed}ms)`);
      });
    }
    
    console.log('\n📊 ALL HTTP TIMINGS:');
    this.timings.forEach(timing => {
      console.log(`   ${timing.step}: ${timing.elapsed}ms`);
    });
    
    // Recommendations
    console.log('\n💡 === PERFORMANCE RECOMMENDATIONS ===');
    
    if (this.timings.length > 0) {
      const maxTime = Math.max(...this.timings.map(t => t.elapsed));
      
      if (maxTime > 3000) {
        console.log('⚠️  Some requests are very slow (>3s):');
        console.log('   - Check network connectivity');
        console.log('   - LinkedIn may be rate limiting');
        console.log('   - Consider using different endpoints');
      } else if (maxTime < 500) {
        console.log('✅ All requests are fast (<500ms)');
        console.log('💡 HTTP-based validation is optimal for your use case');
      }
    }
    
    if (this.errors.length === 0) {
      console.log('✅ No HTTP errors - cookie appears to be working');
      console.log('💡 Browser-based validation slowness may be due to:');
      console.log('   - Browser startup time');
      console.log('   - Page rendering overhead');
      console.log('   - JavaScript execution delays');
      console.log('   - Playwright/Chromium performance');
    }
  }
}

// Run debug if this file is executed directly
if (require.main === module) {
  const httpDebugger = new HTTPCookieDebugger();
  httpDebugger.debugCookieHTTP().catch(console.error);
}

module.exports = HTTPCookieDebugger;