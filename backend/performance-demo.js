/**
 * LinkedIn Validation Performance Demo
 * Demonstrates the new timing and performance features
 */

const RealLinkedInValidator = require('./services/realLinkedInValidator');

class PerformanceDemo {
  constructor() {
    this.validator = new RealLinkedInValidator();
  }

  // Mock validation for demo purposes (simulates real timing without browser)
  async mockValidateWithTiming(accountName, withProxy = false) {
    console.log(`\n🔍 [${accountName}] Starting performance-optimized validation...`);
    console.log(`   Headless mode: ENABLED`);
    console.log(`   Proxy: ${withProxy ? 'http://demo-proxy.com:8080' : 'None'}`);
    
    const timings = [];
    const globalStart = Date.now();
    
    // Simulate Browser Launch (800-1200ms)
    const browserStart = Date.now();
    await this.sleep(800 + Math.random() * 400);
    timings.push({ label: 'Browser Launch', elapsed: Date.now() - browserStart });
    
    // Simulate Proxy Setup (100-300ms if proxy enabled)
    const proxyStart = Date.now();
    if (withProxy) {
      await this.sleep(100 + Math.random() * 200);
    } else {
      await this.sleep(10); // Minimal time for no proxy
    }
    timings.push({ label: 'Proxy Setup', elapsed: Date.now() - proxyStart });
    
    // Simulate Cookie Injection (20-50ms)
    const cookieStart = Date.now();
    await this.sleep(20 + Math.random() * 30);
    timings.push({ label: 'Cookie Injection', elapsed: Date.now() - cookieStart });
    
    // Simulate Navigation (1500-3000ms)
    const navStart = Date.now();
    await this.sleep(1500 + Math.random() * 1500);
    timings.push({ label: 'Navigation', elapsed: Date.now() - navStart });
    
    // Simulate Validation Check (200-600ms)
    const validationStart = Date.now();
    await this.sleep(200 + Math.random() * 400);
    const isValid = Math.random() > 0.3; // 70% success rate
    const status = isValid ? 'ACTIVE' : 'INVALID';
    timings.push({ 
      label: 'Validation Check', 
      elapsed: Date.now() - validationStart,
      status: status
    });
    
    // Log performance results
    this.logPerformance(accountName, timings);
    
    return {
      isValid,
      status,
      message: isValid ? 'LinkedIn authentication successful' : 'Authentication failed - redirected to login',
      accountName,
      timings,
      totalTime: Date.now() - globalStart
    };
  }

  logPerformance(accountName, timings) {
    console.log(`\n[Account: ${accountName}]`);
    
    // Log individual step timings
    timings.forEach(timing => {
      console.log(`   ${timing.label}: ${timing.elapsed}ms`);
    });
    
    const totalTime = timings[timings.length - 1]?.elapsed || 0;
    const status = timings.find(t => t.status)?.status || 'Unknown';
    console.log(`   Total Time: ${timings.reduce((sum, t) => sum + t.elapsed, 0)}ms`);
    console.log(`   Status: ${status}`);
  }

  async demonstrateSingleValidation() {
    console.log('\n🧪 === SINGLE VALIDATION PERFORMANCE DEMO ===');
    
    const result = await this.mockValidateWithTiming('DemoAccount1');
    
    console.log('\n📊 Single Validation Results:');
    console.log(`   Final Status: ${result.status}`);
    console.log(`   Total Time: ${result.totalTime}ms`);
    console.log(`   Valid: ${result.isValid}`);
    
    return result;
  }

  async demonstrateProxyComparison() {
    console.log('\n🔄 === PROXY COMPARISON DEMO ===');
    
    // Test without proxy
    console.log('\n📊 Testing WITHOUT proxy:');
    const noProxyResult = await this.mockValidateWithTiming('DemoAccount2-NoProxy', false);
    
    // Test with proxy
    console.log('\n📊 Testing WITH proxy:');
    const proxyResult = await this.mockValidateWithTiming('DemoAccount2-WithProxy', true);
    
    // Compare results
    console.log('\n📈 [DemoAccount2] Proxy Comparison Results:');
    console.log(`   No Proxy Total Time: ${noProxyResult.totalTime}ms`);
    console.log(`   With Proxy Total Time: ${proxyResult.totalTime}ms`);
    console.log(`   Proxy Overhead: ${proxyResult.totalTime - noProxyResult.totalTime}ms`);
    console.log(`   No Proxy Status: ${noProxyResult.status}`);
    console.log(`   With Proxy Status: ${proxyResult.status}`);
    
    return { noProxyResult, proxyResult };
  }

  async demonstrateParallelValidation() {
    console.log('\n🚀 === PARALLEL VALIDATION DEMO ===');
    
    const accounts = [
      { name: 'Account-1', hasProxy: false },
      { name: 'Account-2', hasProxy: true },
      { name: 'Account-3', hasProxy: false },
      { name: 'Account-4', hasProxy: true },
      { name: 'Account-5', hasProxy: false }
    ];
    
    console.log(`Processing ${accounts.length} accounts in parallel...`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    const startTime = Date.now();
    
    // Process accounts in parallel
    const promises = accounts.map(async (account, index) => {
      const accountStartTime = Date.now();
      console.log(`⏱️  [${account.name}] Validation started at ${new Date(accountStartTime).toISOString()}`);
      
      const result = await this.mockValidateWithTiming(account.name, account.hasProxy);
      
      const accountEndTime = Date.now();
      console.log(`${result.isValid ? '✅' : '❌'} [${account.name}] Validation completed at ${new Date(accountEndTime).toISOString()} (${accountEndTime - accountStartTime}ms)`);
      
      return result;
    });
    
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    // Analyze results
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.length - validCount;
    const avgTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
    
    console.log('\n🎯 Parallel validation complete:');
    console.log(`   Total Accounts: ${results.length}`);
    console.log(`   ACTIVE: ${validCount}`);
    console.log(`   INVALID: ${invalidCount}`);
    console.log(`   Average Time: ${Math.round(avgTime)}ms`);
    console.log(`   Total Execution Time: ${totalTime}ms`);
    console.log(`   End Time: ${new Date().toISOString()}`);
    
    // Timing breakdown
    const timingBreakdown = this.analyzeTimings(results);
    console.log('\n⏱️ Timing Breakdown (Average):');
    Object.entries(timingBreakdown).forEach(([step, avgTime]) => {
      console.log(`   ${step}: ${avgTime}ms`);
    });
    
    return results;
  }

  analyzeTimings(results) {
    const breakdown = {};
    const stepTotals = {};
    const stepCounts = {};
    
    results.forEach(result => {
      if (result.timings) {
        result.timings.forEach(timing => {
          if (!stepTotals[timing.label]) {
            stepTotals[timing.label] = 0;
            stepCounts[timing.label] = 0;
          }
          stepTotals[timing.label] += timing.elapsed;
          stepCounts[timing.label]++;
        });
      }
    });
    
    Object.keys(stepTotals).forEach(step => {
      breakdown[step] = Math.round(stepTotals[step] / stepCounts[step]);
    });
    
    return breakdown;
  }

  async demonstrateBottleneckAnalysis() {
    console.log('\n🔍 === BOTTLENECK ANALYSIS DEMO ===');
    
    // Test different scenarios
    const scenarios = [
      { name: 'Fast-Network', navDelay: 800, browserDelay: 600 },
      { name: 'Slow-Network', navDelay: 4000, browserDelay: 600 },
      { name: 'Slow-Hardware', navDelay: 1500, browserDelay: 2000 },
      { name: 'With-Proxy', navDelay: 2000, browserDelay: 800, proxy: true }
    ];
    
    for (const scenario of scenarios) {
      console.log(`\n📊 Testing scenario: ${scenario.name}`);
      const result = await this.mockValidateWithCustomTiming(
        scenario.name, 
        scenario.browserDelay, 
        scenario.navDelay, 
        scenario.proxy
      );
      
      // Identify bottleneck
      const slowestStep = result.timings.reduce((prev, current) => 
        (prev.elapsed > current.elapsed) ? prev : current
      );
      console.log(`   Bottleneck: ${slowestStep.label} (${slowestStep.elapsed}ms)`);
    }
    
    console.log('\n💡 === PERFORMANCE RECOMMENDATIONS ===');
    console.log('⚠️ Browser launch >1000ms: Consider browser reuse or faster hardware');
    console.log('⚠️ Navigation >3000ms: Check network connectivity or LinkedIn rate limiting');
    console.log('⚠️ Proxy overhead >100%: Consider faster proxy or direct connection');
    console.log('✅ Cookie injection <100ms: Optimal performance');
    console.log('✅ Validation check <500ms: Good response time');
  }

  async mockValidateWithCustomTiming(accountName, browserDelay, navDelay, withProxy = false) {
    console.log(`\n🔍 [${accountName}] Starting performance-optimized validation...`);
    console.log(`   Headless mode: ENABLED`);
    console.log(`   Proxy: ${withProxy ? 'http://demo-proxy.com:8080' : 'None'}`);
    
    const timings = [];
    const globalStart = Date.now();
    
    // Browser Launch
    const browserStart = Date.now();
    await this.sleep(browserDelay);
    timings.push({ label: 'Browser Launch', elapsed: Date.now() - browserStart });
    
    // Proxy Setup
    const proxyStart = Date.now();
    await this.sleep(withProxy ? 200 : 10);
    timings.push({ label: 'Proxy Setup', elapsed: Date.now() - proxyStart });
    
    // Cookie Injection
    const cookieStart = Date.now();
    await this.sleep(30);
    timings.push({ label: 'Cookie Injection', elapsed: Date.now() - cookieStart });
    
    // Navigation
    const navStart = Date.now();
    await this.sleep(navDelay);
    timings.push({ label: 'Navigation', elapsed: Date.now() - navStart });
    
    // Validation Check
    const validationStart = Date.now();
    await this.sleep(300);
    const status = 'ACTIVE';
    timings.push({ 
      label: 'Validation Check', 
      elapsed: Date.now() - validationStart,
      status: status
    });
    
    // Log performance results
    this.logPerformance(accountName, timings);
    
    return {
      isValid: true,
      status,
      accountName,
      timings,
      totalTime: Date.now() - globalStart
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runDemo() {
    console.log('🚀 === LINKEDIN VALIDATION PERFORMANCE DEMO ===');
    console.log('📝 This demo simulates the new performance monitoring features');
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    try {
      await this.demonstrateSingleValidation();
      await this.demonstrateProxyComparison();
      await this.demonstrateParallelValidation();
      await this.demonstrateBottleneckAnalysis();
      
      console.log('\n✅ === DEMO COMPLETED ===');
      console.log('🎯 Key Features Demonstrated:');
      console.log('   ✅ Step-by-step timing measurements');
      console.log('   ✅ Proxy vs no-proxy comparison');
      console.log('   ✅ Parallel validation with concurrency');
      console.log('   ✅ Bottleneck identification');
      console.log('   ✅ Structured performance logging');
      console.log('   ✅ Real-time validation tracking');
      console.log(`End Time: ${new Date().toISOString()}`);
      
    } catch (error) {
      console.error('❌ Demo execution failed:', error);
    }
  }
}

// Run demo if this file is executed directly
if (require.main === module) {
  const demo = new PerformanceDemo();
  demo.runDemo().catch(console.error);
}

module.exports = PerformanceDemo;