/**
 * Rate Limiter Utility for LinkedIn Scraping
 * Implements token bucket algorithm with adaptive delays
 */

class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 10; // Max requests per window
    this.refillRate = options.refillRate || 1; // Tokens per second
    this.windowMs = options.windowMs || 60000; // 1 minute window
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.requestHistory = [];
    this.adaptiveDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.minDelay = options.minDelay || 500;
  }

  /**
   * Refill tokens based on time elapsed
   */
  refillTokens() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed / 1000) * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Check if request is allowed
   * @returns {boolean} - Whether request is allowed
   */
  isAllowed() {
    this.refillTokens();
    return this.tokens > 0;
  }

  /**
   * Consume a token for a request
   * @returns {boolean} - Whether token was consumed
   */
  consume() {
    this.refillTokens();
    
    if (this.tokens > 0) {
      this.tokens--;
      this.recordRequest();
      return true;
    }
    
    return false;
  }

  /**
   * Record request for adaptive delay calculation
   */
  recordRequest() {
    const now = Date.now();
    this.requestHistory.push(now);
    
    // Keep only recent history
    this.requestHistory = this.requestHistory.filter(
      time => now - time < this.windowMs
    );
  }

  /**
   * Calculate adaptive delay based on recent request patterns
   * @returns {number} - Delay in milliseconds
   */
  getAdaptiveDelay() {
    const now = Date.now();
    const recentRequests = this.requestHistory.filter(
      time => now - time < this.windowMs
    );

    // Increase delay if we're making too many requests
    const requestRate = recentRequests.length / (this.windowMs / 1000);
    const targetRate = this.maxTokens / (this.windowMs / 1000);
    
    if (requestRate > targetRate * 0.8) {
      this.adaptiveDelay = Math.min(this.adaptiveDelay * 1.5, this.maxDelay);
    } else if (requestRate < targetRate * 0.5) {
      this.adaptiveDelay = Math.max(this.adaptiveDelay * 0.8, this.minDelay);
    }

    return this.adaptiveDelay;
  }

  /**
   * Wait until a token is available
   * @returns {Promise<void>}
   */
  async waitForToken() {
    while (!this.consume()) {
      const delay = this.getAdaptiveDelay();
      console.log(`⏳ Rate limit reached, waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Get current rate limiter status
   * @returns {Object} - Status information
   */
  getStatus() {
    this.refillTokens();
    
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      requestsInWindow: this.requestHistory.length,
      adaptiveDelay: this.adaptiveDelay,
      nextRefill: this.lastRefill + (1000 / this.refillRate)
    };
  }
}

/**
 * LinkedIn-specific rate limiter with conservative settings
 */
class LinkedInRateLimiter extends RateLimiter {
  constructor(options = {}) {
    super({
      maxTokens: 5, // Very conservative for LinkedIn
      refillRate: 0.5, // 1 token every 2 seconds
      windowMs: 120000, // 2 minute window
      baseDelay: 2000,
      maxDelay: 60000,
      minDelay: 1000,
      ...options
    });
  }

  /**
   * Enhanced adaptive delay for LinkedIn with exponential backoff on errors
   * @param {boolean} hadError - Whether the last request had an error
   * @returns {number} - Delay in milliseconds
   */
  getLinkedInDelay(hadError = false) {
    let delay = this.getAdaptiveDelay();
    
    if (hadError) {
      // Exponential backoff on errors
      delay = Math.min(delay * 3, this.maxDelay);
      this.adaptiveDelay = delay;
    }

    // Add random jitter to avoid synchronized requests
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }
}

/**
 * Global rate limiter instances
 */
const globalRateLimiter = new RateLimiter();
const linkedInRateLimiter = new LinkedInRateLimiter();

/**
 * Rate limiting middleware for Express
 * @param {Object} options - Rate limiting options
 * @returns {Function} - Express middleware
 */
function createRateLimitMiddleware(options = {}) {
  const limiter = new RateLimiter(options);
  
  return async (req, res, next) => {
    if (!limiter.consume()) {
      const delay = limiter.getAdaptiveDelay();
      const status = limiter.getStatus();
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(delay / 1000),
        status: status
      });
    }
    
    next();
  };
}

/**
 * Utility function to add rate limiting to any async function
 * @param {Function} fn - Function to rate limit
 * @param {RateLimiter} limiter - Rate limiter instance
 * @returns {Function} - Rate limited function
 */
function withRateLimit(fn, limiter = globalRateLimiter) {
  return async function(...args) {
    await limiter.waitForToken();
    
    try {
      const result = await fn.apply(this, args);
      return result;
    } catch (error) {
      // Increase delay on errors if using LinkedIn rate limiter
      if (limiter instanceof LinkedInRateLimiter) {
        limiter.getLinkedInDelay(true);
      }
      throw error;
    }
  };
}

module.exports = {
  RateLimiter,
  LinkedInRateLimiter,
  globalRateLimiter,
  linkedInRateLimiter,
  createRateLimitMiddleware,
  withRateLimit
};