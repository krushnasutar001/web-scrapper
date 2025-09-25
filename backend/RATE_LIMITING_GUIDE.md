# Rate Limiting and Proxy Rotation Guide

## Overview

This guide explains how to use the enhanced rate limiting and proxy rotation features to avoid LinkedIn blocks and improve scraping reliability.

## Rate Limiting Features

### 1. Basic Rate Limiter (`utils/rateLimiter.js`)

```javascript
const { RateLimiter, linkedInRateLimiter } = require('./utils/rateLimiter');

// Use the global LinkedIn rate limiter
await linkedInRateLimiter.waitForToken();

// Or create a custom rate limiter
const customLimiter = new RateLimiter({
  maxTokens: 10,        // Max requests per window
  refillRate: 1,        // Tokens per second
  windowMs: 60000,      // 1 minute window
  baseDelay: 1000,      // Base delay between requests
  maxDelay: 30000,      // Maximum delay
  minDelay: 500         // Minimum delay
});
```

### 2. LinkedIn-Specific Rate Limiter

The `LinkedInRateLimiter` class provides conservative settings specifically for LinkedIn:

- **5 tokens maximum** (very conservative)
- **0.5 tokens per second** (1 token every 2 seconds)
- **2-minute window**
- **Adaptive delays** with exponential backoff on errors
- **Jitter** to prevent synchronized requests

### 3. Rate Limiting Middleware

```javascript
const { createRateLimitMiddleware } = require('./utils/rateLimiter');

// Add to Express routes
app.use('/api/scrape', createRateLimitMiddleware({
  maxTokens: 5,
  windowMs: 60000
}));
```

## Enhanced Retry Logic

### 1. Basic Retry with Enhanced Headers

```javascript
const { retryLinkedInRequest } = require('./utils/responseValidator');

const result = await retryLinkedInRequest(async () => {
  // Your scraping function here
  return await page.goto(url);
}, {
  maxRetries: 5,
  baseDelay: 2000,
  maxDelay: 30000
});
```

### 2. Features of Enhanced Retry

- **User Agent Rotation**: Cycles through different browser user agents
- **Header Enhancement**: Adds realistic browser headers
- **Exponential Backoff**: Increases delay between retries
- **Jitter**: Adds randomness to prevent thundering herd
- **LinkedIn-Specific Error Handling**: Doesn't retry on authentication failures

## Proxy Rotation

### 1. Basic Proxy Setup

```javascript
const { ProxyRotator } = require('./utils/proxyRotation');

const proxyRotator = new ProxyRotator({
  proxies: [
    { host: 'proxy1.com', port: 8080, username: 'user', password: 'pass' },
    { host: 'proxy2.com', port: 8080, username: 'user', password: 'pass' }
  ],
  rotationStrategy: 'round-robin', // 'round-robin', 'random', 'least-used'
  maxFailures: 3
});

// Get next proxy
const proxy = proxyRotator.getNextProxy();

// Configure Puppeteer with proxy
const proxyConfig = proxyRotator.getPuppeteerProxyConfig(proxy);
const browser = await puppeteer.launch(proxyConfig);
```

### 2. Proxy Testing

```javascript
// Test all proxies
const workingProxies = await proxyRotator.testAllProxies();

// Test individual proxy
const isWorking = await proxyRotator.testProxy(proxy);

// Get proxy statistics
const stats = proxyRotator.getStats();
console.log(`Available proxies: ${stats.availableProxies}/${stats.totalProxies}`);
```

## Implementation Examples

### 1. Enhanced Profile Scraping

```javascript
async function scrapeProfileWithRateLimit(page, profileUrl) {
  // Apply rate limiting
  await linkedInRateLimiter.waitForToken();
  
  const scrapeWithRetry = async () => {
    await page.goto(profileUrl, { waitUntil: 'networkidle2' });
    
    // Check for LinkedIn errors
    const pageContent = await page.content();
    const linkedInError = handleLinkedInResponse(null, pageContent);
    
    if (linkedInError.isLinkedInError) {
      throw new Error(`LinkedIn error: ${linkedInError.errorType}`);
    }
    
    return await page.evaluate(() => {
      // Extract profile data
    });
  };

  return await retryLinkedInRequest(scrapeWithRetry, {
    maxRetries: 3,
    baseDelay: linkedInRateLimiter.getLinkedInDelay()
  });
}
```

### 2. Bulk Scraping with Proxy Rotation

```javascript
async function bulkScrapeWithProxies(profileUrls) {
  const proxyRotator = new ProxyRotator({ proxies: yourProxies });
  
  for (let i = 0; i < profileUrls.length; i++) {
    try {
      // Get next proxy
      const proxy = proxyRotator.getNextProxy();
      
      // Create browser with proxy
      const proxyConfig = proxyRotator.getPuppeteerProxyConfig(proxy);
      const browser = await puppeteer.launch(proxyConfig);
      const page = await browser.newPage();
      
      // Scrape with rate limiting
      const result = await scrapeProfileWithRateLimit(page, profileUrls[i]);
      
      // Mark proxy as successful
      proxyRotator.markProxySuccess(proxy);
      
      await browser.close();
      
    } catch (error) {
      // Mark proxy as failed
      proxyRotator.markProxyFailed(proxy);
      console.error(`Failed to scrape ${profileUrls[i]}:`, error.message);
    }
    
    // Add delay between profiles
    await proxyRotationDelay(2000, 5000);
  }
}
```

## Best Practices

### 1. Rate Limiting

- **Start Conservative**: Begin with low request rates and increase gradually
- **Monitor Response Times**: Adjust delays based on LinkedIn's response times
- **Use Adaptive Delays**: Let the system automatically adjust delays based on errors
- **Respect Rate Limits**: Don't try to bypass LinkedIn's rate limiting

### 2. Proxy Usage

- **Use High-Quality Proxies**: Residential proxies work better than datacenter proxies
- **Rotate Regularly**: Don't use the same proxy for too many requests
- **Test Proxies**: Regularly test proxy health and remove failed ones
- **Geographic Distribution**: Use proxies from different locations

### 3. Error Handling

- **Detect LinkedIn Errors**: Use the LinkedIn response handler to detect blocks
- **Implement Backoff**: Increase delays when errors occur
- **Log Everything**: Keep detailed logs for debugging
- **Graceful Degradation**: Continue with remaining proxies when some fail

### 4. Monitoring

```javascript
// Monitor rate limiter status
const status = linkedInRateLimiter.getStatus();
console.log(`Tokens: ${status.tokens}/${status.maxTokens}`);
console.log(`Requests in window: ${status.requestsInWindow}`);
console.log(`Current delay: ${status.adaptiveDelay}ms`);

// Monitor proxy status
const proxyStats = proxyRotator.getStats();
console.log(`Working proxies: ${proxyStats.availableProxies}/${proxyStats.totalProxies}`);
```

## Configuration Recommendations

### Development Environment
```javascript
const devRateLimiter = new LinkedInRateLimiter({
  maxTokens: 2,
  refillRate: 0.25,  // 1 token every 4 seconds
  baseDelay: 3000
});
```

### Production Environment
```javascript
const prodRateLimiter = new LinkedInRateLimiter({
  maxTokens: 5,
  refillRate: 0.5,   // 1 token every 2 seconds
  baseDelay: 2000,
  maxDelay: 60000
});
```

## Troubleshooting

### Common Issues

1. **Too Many Rate Limit Errors**
   - Reduce `maxTokens` and `refillRate`
   - Increase `baseDelay`
   - Add more proxies

2. **Proxies Not Working**
   - Test proxies individually
   - Check proxy authentication
   - Verify proxy type (HTTP/HTTPS/SOCKS)

3. **LinkedIn Blocks**
   - Increase delays between requests
   - Use residential proxies
   - Rotate user agents more frequently
   - Implement CAPTCHA solving

### Debugging

Enable detailed logging:
```javascript
// Set environment variable
process.env.DEBUG_RATE_LIMITING = 'true';

// Or add console logs
linkedInRateLimiter.on('tokenConsumed', (status) => {
  console.log('Token consumed:', status);
});
```

## Security Considerations

1. **Proxy Credentials**: Store proxy credentials securely
2. **Rate Limiting**: Don't expose rate limiting endpoints publicly
3. **Logging**: Don't log sensitive information
4. **Compliance**: Ensure compliance with LinkedIn's Terms of Service

## Performance Tips

1. **Connection Pooling**: Reuse browser instances when possible
2. **Parallel Processing**: Use multiple browsers with different proxies
3. **Caching**: Cache results to avoid duplicate requests
4. **Monitoring**: Track success rates and adjust parameters accordingly