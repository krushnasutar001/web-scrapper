/**
 * Test script for the optimized LinkedIn validator
 * Demonstrates performance improvements with real cookie
 */

const OptimizedLinkedInValidator = require('./optimized-validator');

// Real cookie provided by user
const REAL_COOKIE = 'AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mPiwZMannH_NVPXf8UzpbLO0_PEH0xLYEp9As3KuIf0C_OsNdZ2gxPBc4DEbk08-HytchRmqAgFVsbfYthSBRx3Kpg2nP7Gjnu4Q83';

async function testOptimizedValidator() {
  console.log('🚀 === OPTIMIZED LINKEDIN VALIDATOR TEST ===');
  console.log(`Testing with real cookie: ${REAL_COOKIE.substring(0, 20)}...${REAL_COOKIE.substring(REAL_COOKIE.length - 10)}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  
  const validator = new OptimizedLinkedInValidator();
  
  try {
    // Test 1: HTTP-first validation (default)
    console.log('\n🔥 === TEST 1: HTTP-FIRST VALIDATION ===');
    validator.setHttpFirst(true);
    validator.setTimeouts(3000, 10000); // 3s HTTP, 10s browser
    
    const httpFirstStart = Date.now();
    const httpFirstResult = await validator.validateCookie(REAL_COOKIE, null, 'RealCookie-HTTPFirst');
    const httpFirstTime = Date.now() - httpFirstStart;
    
    console.log('\n📊 HTTP-First Results:');
    console.log(`   Status: ${httpFirstResult.status}`);
    console.log(`   Method Used: ${httpFirstResult.method}`);
    console.log(`   Total Time: ${httpFirstTime}ms`);
    console.log(`   Message: ${httpFirstResult.message}`);
    
    // Test 2: Browser-only validation (for comparison)
    console.log('\n🌐 === TEST 2: BROWSER-ONLY VALIDATION ===');
    validator.setHttpFirst(false);
    
    const browserOnlyStart = Date.now();
    const browserOnlyResult = await validator.validateCookie(REAL_COOKIE, null, 'RealCookie-BrowserOnly');
    const browserOnlyTime = Date.now() - browserOnlyStart;
    
    console.log('\n📊 Browser-Only Results:');
    console.log(`   Status: ${browserOnlyResult.status}`);
    console.log(`   Method Used: ${browserOnlyResult.method}`);
    console.log(`   Total Time: ${browserOnlyTime}ms`);
    console.log(`   Message: ${browserOnlyResult.message}`);
    
    // Performance comparison
    console.log('\n⚡ === PERFORMANCE COMPARISON ===');
    console.log(`HTTP-First Time: ${httpFirstTime}ms`);
    console.log(`Browser-Only Time: ${browserOnlyTime}ms`);
    
    if (httpFirstTime < browserOnlyTime) {
      const improvement = Math.round(((browserOnlyTime - httpFirstTime) / browserOnlyTime) * 100);
      console.log(`✅ HTTP-First is ${improvement}% faster!`);
      console.log(`💡 Time saved: ${browserOnlyTime - httpFirstTime}ms`);
    } else {
      console.log(`⚠️ Browser validation was faster this time`);
    }
    
    // Test 3: Batch validation with multiple accounts
    console.log('\n📦 === TEST 3: BATCH VALIDATION ===');
    validator.setHttpFirst(true); // Use optimized method
    
    const testConfigs = [
      {
        liAtCookie: REAL_COOKIE,
        accountName: 'RealAccount-1',
        proxyConfig: null
      },
      {
        liAtCookie: REAL_COOKIE,
        accountName: 'RealAccount-2',
        proxyConfig: null
      },
      {
        liAtCookie: REAL_COOKIE,
        accountName: 'RealAccount-3',
        proxyConfig: null
      }
    ];
    
    const batchStart = Date.now();
    const batchResults = await validator.validateMultipleCookies(testConfigs, 3);
    const batchTime = Date.now() - batchStart;
    
    console.log('\n📊 Batch Results:');
    console.log(`   Total Time: ${batchTime}ms`);
    console.log(`   Average Time per Account: ${Math.round(batchTime / testConfigs.length)}ms`);
    console.log(`   Success Rate: ${batchResults.filter(r => r.isValid).length}/${batchResults.length}`);
    
    // Method breakdown
    const httpValidations = batchResults.filter(r => r.method === 'HTTP').length;
    const browserValidations = batchResults.filter(r => r.method === 'Browser').length;
    
    console.log(`   HTTP Validations: ${httpValidations}`);
    console.log(`   Browser Validations: ${browserValidations}`);
    
    if (httpValidations > 0) {
      console.log(`✅ ${Math.round((httpValidations / batchResults.length) * 100)}% of validations used fast HTTP method`);
    }
    
    // Final recommendations
    console.log('\n💡 === PERFORMANCE RECOMMENDATIONS ===');
    
    if (httpFirstResult.method === 'HTTP' && httpFirstResult.isValid) {
      console.log('✅ HTTP validation is working perfectly for your cookie!');
      console.log('🚀 Recommendation: Use HTTP-first validation for maximum speed');
      console.log(`⚡ Expected performance: ~1-3 seconds vs ~5-15 seconds for browser-only`);
    } else if (httpFirstResult.method === 'Browser') {
      console.log('⚠️ HTTP validation was inconclusive, fell back to browser');
      console.log('💡 This is still faster than browser-only as it tries HTTP first');
    }
    
    if (batchTime / testConfigs.length < 2000) {
      console.log('✅ Batch validation is very fast (<2s per account)');
    } else if (batchTime / testConfigs.length < 5000) {
      console.log('✅ Batch validation is reasonably fast (<5s per account)');
    } else {
      console.log('⚠️ Batch validation is slow (>5s per account)');
      console.log('💡 Consider increasing HTTP timeout or checking network connectivity');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
  
  console.log('\n🏁 === TEST COMPLETE ===');
  console.log(`End Time: ${new Date().toISOString()}`);
}

// Run test if this file is executed directly
if (require.main === module) {
  testOptimizedValidator().catch(console.error);
}

module.exports = testOptimizedValidator;