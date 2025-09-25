/**
 * Proxy Rotation Utility for LinkedIn Scraping
 * Helps rotate IP addresses and manage proxy pools
 */

class ProxyRotator {
  constructor(options = {}) {
    this.proxies = options.proxies || [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.proxyStats = new Map();
    this.maxFailures = options.maxFailures || 3;
    this.testTimeout = options.testTimeout || 10000;
    this.rotationStrategy = options.rotationStrategy || 'round-robin'; // 'round-robin', 'random', 'least-used'
  }

  /**
   * Add proxy to the pool
   * @param {Object} proxy - Proxy configuration
   */
  addProxy(proxy) {
    if (!this.proxies.find(p => p.host === proxy.host && p.port === proxy.port)) {
      this.proxies.push(proxy);
      this.proxyStats.set(this.getProxyKey(proxy), {
        requests: 0,
        failures: 0,
        lastUsed: null,
        responseTime: null
      });
    }
  }

  /**
   * Get proxy key for tracking
   * @param {Object} proxy - Proxy configuration
   * @returns {string} - Proxy key
   */
  getProxyKey(proxy) {
    return `${proxy.host}:${proxy.port}`;
  }

  /**
   * Get next available proxy
   * @returns {Object|null} - Next proxy or null if none available
   */
  getNextProxy() {
    const availableProxies = this.proxies.filter(proxy => 
      !this.failedProxies.has(this.getProxyKey(proxy))
    );

    if (availableProxies.length === 0) {
      console.warn('⚠️ No available proxies, resetting failed proxy list');
      this.failedProxies.clear();
      return this.proxies.length > 0 ? this.proxies[0] : null;
    }

    let selectedProxy;

    switch (this.rotationStrategy) {
      case 'random':
        selectedProxy = availableProxies[Math.floor(Math.random() * availableProxies.length)];
        break;
      
      case 'least-used':
        selectedProxy = availableProxies.reduce((least, current) => {
          const leastStats = this.proxyStats.get(this.getProxyKey(least));
          const currentStats = this.proxyStats.get(this.getProxyKey(current));
          return currentStats.requests < leastStats.requests ? current : least;
        });
        break;
      
      case 'round-robin':
      default:
        this.currentIndex = this.currentIndex % availableProxies.length;
        selectedProxy = availableProxies[this.currentIndex];
        this.currentIndex++;
        break;
    }

    // Update stats
    const stats = this.proxyStats.get(this.getProxyKey(selectedProxy));
    stats.requests++;
    stats.lastUsed = Date.now();

    return selectedProxy;
  }

  /**
   * Mark proxy as failed
   * @param {Object} proxy - Failed proxy
   */
  markProxyFailed(proxy) {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);
    
    if (stats) {
      stats.failures++;
      
      if (stats.failures >= this.maxFailures) {
        this.failedProxies.add(key);
        console.warn(`🚫 Proxy ${key} marked as failed after ${stats.failures} failures`);
      }
    }
  }

  /**
   * Mark proxy as successful
   * @param {Object} proxy - Successful proxy
   * @param {number} responseTime - Response time in ms
   */
  markProxySuccess(proxy, responseTime = null) {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);
    
    if (stats) {
      stats.failures = Math.max(0, stats.failures - 1); // Reduce failure count on success
      if (responseTime) {
        stats.responseTime = responseTime;
      }
    }
  }

  /**
   * Test proxy connectivity
   * @param {Object} proxy - Proxy to test
   * @returns {Promise<boolean>} - Whether proxy is working
   */
  async testProxy(proxy) {
    try {
      const puppeteer = require('puppeteer');
      
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          `--proxy-server=${proxy.protocol || 'http'}://${proxy.host}:${proxy.port}`,
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      });

      const page = await browser.newPage();
      
      // Set proxy authentication if provided
      if (proxy.username && proxy.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password
        });
      }

      const startTime = Date.now();
      
      // Test with a simple HTTP request
      await page.goto('https://httpbin.org/ip', { 
        waitUntil: 'networkidle2', 
        timeout: this.testTimeout 
      });
      
      const responseTime = Date.now() - startTime;
      await browser.close();
      
      this.markProxySuccess(proxy, responseTime);
      console.log(`✅ Proxy ${this.getProxyKey(proxy)} working (${responseTime}ms)`);
      return true;
      
    } catch (error) {
      this.markProxyFailed(proxy);
      console.warn(`❌ Proxy ${this.getProxyKey(proxy)} failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Test all proxies in the pool
   * @returns {Promise<Array>} - Array of working proxies
   */
  async testAllProxies() {
    console.log(`🔍 Testing ${this.proxies.length} proxies...`);
    
    const results = await Promise.allSettled(
      this.proxies.map(proxy => this.testProxy(proxy))
    );

    const workingProxies = this.proxies.filter((proxy, index) => 
      results[index].status === 'fulfilled' && results[index].value === true
    );

    console.log(`✅ ${workingProxies.length}/${this.proxies.length} proxies are working`);
    return workingProxies;
  }

  /**
   * Get proxy statistics
   * @returns {Object} - Proxy pool statistics
   */
  getStats() {
    const totalProxies = this.proxies.length;
    const failedProxies = this.failedProxies.size;
    const availableProxies = totalProxies - failedProxies;
    
    const proxyDetails = Array.from(this.proxyStats.entries()).map(([key, stats]) => ({
      proxy: key,
      ...stats,
      isFailed: this.failedProxies.has(key)
    }));

    return {
      totalProxies,
      availableProxies,
      failedProxies,
      rotationStrategy: this.rotationStrategy,
      proxyDetails
    };
  }

  /**
   * Reset failed proxies (give them another chance)
   */
  resetFailedProxies() {
    console.log(`🔄 Resetting ${this.failedProxies.size} failed proxies`);
    this.failedProxies.clear();
    
    // Reset failure counts
    for (const [key, stats] of this.proxyStats.entries()) {
      stats.failures = 0;
    }
  }

  /**
   * Configure Puppeteer browser with proxy
   * @param {Object} proxy - Proxy configuration
   * @returns {Object} - Puppeteer launch options
   */
  getPuppeteerProxyConfig(proxy) {
    const args = [
      `--proxy-server=${proxy.protocol || 'http'}://${proxy.host}:${proxy.port}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ];

    return {
      args,
      proxy: {
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password
      }
    };
  }
}

/**
 * Create a proxy rotator with common free proxy sources
 * Note: Free proxies are unreliable and should only be used for testing
 * @returns {ProxyRotator} - Configured proxy rotator
 */
function createFreeProxyRotator() {
  const freeProxies = [
    // Note: These are example proxies and may not work
    // Users should provide their own proxy list
    { host: '8.8.8.8', port: 8080, protocol: 'http' },
    { host: '1.1.1.1', port: 8080, protocol: 'http' }
  ];

  return new ProxyRotator({
    proxies: freeProxies,
    rotationStrategy: 'round-robin',
    maxFailures: 2
  });
}

/**
 * Utility function to add delay between proxy rotations
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 * @returns {Promise<void>}
 */
async function proxyRotationDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = {
  ProxyRotator,
  createFreeProxyRotator,
  proxyRotationDelay
};