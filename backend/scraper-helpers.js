/**
 * Scraper Helper Functions
 * Cookie injection and validation for Playwright, Puppeteer, and HTTP clients
 */

const axios = require('axios');
const crypto = require('crypto');

// Local encryption functions (moved from deleted cookie-api)
const encryptCookies = (cookies) => {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(cookies, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decryptCookies = (encryptedCookies) => {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const parts = encryptedCookies.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Cookie validation configurations
const VALIDATION_CONFIGS = {
  linkedin: {
    testUrl: 'https://www.linkedin.com/feed/',
    successIndicators: ['linkedin.com/feed', 'linkedin.com/in/'],
    failureIndicators: ['linkedin.com/login', 'linkedin.com/uas/login', 'challenge'],
    requiredCookies: ['li_at']
  },
  salesnav: {
    testUrl: 'https://www.linkedin.com/sales/homepage',
    successIndicators: ['sales/homepage', 'sales/search'],
    failureIndicators: ['linkedin.com/login', 'linkedin.com/uas/login'],
    requiredCookies: ['li_at']
  },
  twitter: {
    testUrl: 'https://twitter.com/home',
    successIndicators: ['twitter.com/home', 'x.com/home'],
    failureIndicators: ['twitter.com/login', 'x.com/login'],
    requiredCookies: ['auth_token']
  }
};

/**
 * Apply cookies to Playwright browser context
 * @param {Object} context - Playwright browser context
 * @param {Array} cookies - Array of cookie objects
 * @param {string} integrationUid - Integration identifier (linkedin, twitter, etc.)
 * @returns {Promise<Object>} Result object with success status
 */
async function applyCookiesToPlaywright(context, cookies, integrationUid = 'linkedin') {
  try {
    console.log(`🍪 Applying ${cookies.length} cookies to Playwright context for ${integrationUid}`);
    
    // Validate required cookies
    const config = VALIDATION_CONFIGS[integrationUid];
    if (config && config.requiredCookies) {
      const cookieNames = cookies.map(c => c.name);
      const missingCookies = config.requiredCookies.filter(name => !cookieNames.includes(name));
      
      if (missingCookies.length > 0) {
        throw new Error(`Missing required cookies: ${missingCookies.join(', ')}`);
      }
    }
    
    // Convert cookies to Playwright format
    const playwrightCookies = cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      httpOnly: cookie.httpOnly || false,
      secure: cookie.secure || false,
      sameSite: cookie.sameSite || 'Lax',
      expires: cookie.expirationDate ? cookie.expirationDate : undefined
    }));
    
    // Add cookies to context
    await context.addCookies(playwrightCookies);
    
    console.log(`✅ Successfully applied ${playwrightCookies.length} cookies to Playwright`);
    
    return {
      success: true,
      cookieCount: playwrightCookies.length,
      appliedCookies: playwrightCookies.map(c => ({ name: c.name, domain: c.domain }))
    };
    
  } catch (error) {
    console.error('❌ Error applying cookies to Playwright:', error);
    throw error;
  }
}

/**
 * Apply cookies to Puppeteer page
 * @param {Object} page - Puppeteer page object
 * @param {Array} cookies - Array of cookie objects
 * @param {string} integrationUid - Integration identifier
 * @returns {Promise<Object>} Result object with success status
 */
async function applyCookiesToPuppeteer(page, cookies, integrationUid = 'linkedin') {
  try {
    console.log(`🍪 Applying ${cookies.length} cookies to Puppeteer page for ${integrationUid}`);
    
    // Validate required cookies
    const config = VALIDATION_CONFIGS[integrationUid];
    if (config && config.requiredCookies) {
      const cookieNames = cookies.map(c => c.name);
      const missingCookies = config.requiredCookies.filter(name => !cookieNames.includes(name));
      
      if (missingCookies.length > 0) {
        throw new Error(`Missing required cookies: ${missingCookies.join(', ')}`);
      }
    }
    
    // Convert cookies to Puppeteer format
    const puppeteerCookies = cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      httpOnly: cookie.httpOnly || false,
      secure: cookie.secure || false,
      sameSite: cookie.sameSite || 'Lax',
      expires: cookie.expirationDate ? cookie.expirationDate : undefined
    }));
    
    // Set cookies on page
    await page.setCookie(...puppeteerCookies);
    
    console.log(`✅ Successfully applied ${puppeteerCookies.length} cookies to Puppeteer`);
    
    return {
      success: true,
      cookieCount: puppeteerCookies.length,
      appliedCookies: puppeteerCookies.map(c => ({ name: c.name, domain: c.domain }))
    };
    
  } catch (error) {
    console.error('❌ Error applying cookies to Puppeteer:', error);
    throw error;
  }
}

/**
 * Generate Cookie header string for HTTP requests
 * @param {Array} cookies - Array of cookie objects
 * @param {string} domain - Target domain (optional, filters cookies by domain)
 * @returns {string} Cookie header string
 */
function getCookieHeader(cookies, domain = null) {
  try {
    console.log(`🍪 Generating cookie header from ${cookies.length} cookies`);
    
    let filteredCookies = cookies;
    
    // Filter by domain if specified
    if (domain) {
      filteredCookies = cookies.filter(cookie => {
        if (!cookie.domain) return false;
        
        // Handle domain matching (including subdomain matching)
        const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        return domain.includes(cookieDomain) || cookieDomain.includes(domain);
      });
      
      console.log(`🔍 Filtered to ${filteredCookies.length} cookies for domain: ${domain}`);
    }
    
    // Generate cookie header string
    const cookieHeader = filteredCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    console.log(`✅ Generated cookie header with ${filteredCookies.length} cookies`);
    
    return cookieHeader;
    
  } catch (error) {
    console.error('❌ Error generating cookie header:', error);
    throw error;
  }
}

/**
 * Validate cookies by making a test request
 * @param {Array} cookies - Array of cookie objects
 * @param {string} integrationUid - Integration identifier
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
async function validateCookies(cookies, integrationUid = 'linkedin', options = {}) {
  try {
    console.log(`🔍 Validating cookies for ${integrationUid}`);
    
    const config = VALIDATION_CONFIGS[integrationUid];
    if (!config) {
      throw new Error(`Unknown integration: ${integrationUid}`);
    }
    
    // Check required cookies
    if (config.requiredCookies) {
      const cookieNames = cookies.map(c => c.name);
      const missingCookies = config.requiredCookies.filter(name => !cookieNames.includes(name));
      
      if (missingCookies.length > 0) {
        return {
          isValid: false,
          reason: 'missing_required_cookies',
          message: `Missing required cookies: ${missingCookies.join(', ')}`,
          missingCookies
        };
      }
    }
    
    // Check cookie expiration
    const now = Date.now() / 1000;
    const expiredCookies = cookies.filter(cookie => 
      cookie.expirationDate && cookie.expirationDate < now
    );
    
    if (expiredCookies.length > 0) {
      return {
        isValid: false,
        reason: 'expired_cookies',
        message: `${expiredCookies.length} cookies have expired`,
        expiredCookies: expiredCookies.map(c => c.name)
      };
    }
    
    // Make test request if enabled
    if (options.testRequest !== false) {
      const cookieHeader = getCookieHeader(cookies);
      
      try {
        const response = await axios.get(config.testUrl, {
          headers: {
            'Cookie': cookieHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: options.timeout || 10000,
          maxRedirects: 5,
          validateStatus: () => true // Don't throw on HTTP errors
        });
        
        const finalUrl = response.request.res.responseUrl || response.config.url;
        const responseText = response.data.toString().toLowerCase();
        
        // Check for success indicators
        const hasSuccessIndicator = config.successIndicators.some(indicator => 
          finalUrl.includes(indicator) || responseText.includes(indicator)
        );
        
        // Check for failure indicators
        const hasFailureIndicator = config.failureIndicators.some(indicator => 
          finalUrl.includes(indicator) || responseText.includes(indicator)
        );
        
        if (hasFailureIndicator) {
          return {
            isValid: false,
            reason: 'authentication_failed',
            message: 'Cookies are invalid - redirected to login page',
            testUrl: config.testUrl,
            finalUrl,
            statusCode: response.status
          };
        }
        
        if (hasSuccessIndicator || response.status === 200) {
          return {
            isValid: true,
            reason: 'validation_successful',
            message: 'Cookies are valid and working',
            testUrl: config.testUrl,
            finalUrl,
            statusCode: response.status
          };
        }
        
        return {
          isValid: false,
          reason: 'unexpected_response',
          message: `Unexpected response: ${response.status}`,
          testUrl: config.testUrl,
          finalUrl,
          statusCode: response.status
        };
        
      } catch (requestError) {
        console.error('❌ Test request failed:', requestError.message);
        return {
          isValid: false,
          reason: 'request_failed',
          message: `Test request failed: ${requestError.message}`,
          testUrl: config.testUrl
        };
      }
    }
    
    // If no test request, just validate format and expiration
    return {
      isValid: true,
      reason: 'format_validation_passed',
      message: 'Cookies format and expiration are valid',
      cookieCount: cookies.length
    };
    
  } catch (error) {
    console.error('❌ Cookie validation error:', error);
    return {
      isValid: false,
      reason: 'validation_error',
      message: `Validation error: ${error.message}`
    };
  }
}

/**
 * Fetch cookies from backend API
 * @param {string} identityUid - Identity identifier
 * @param {string} integrationUid - Integration identifier
 * @param {string} apiBaseUrl - Backend API base URL
 * @param {string} authToken - JWT authentication token
 * @returns {Promise<Array>} Array of cookie objects
 */
async function fetchCookiesFromBackend(identityUid, integrationUid, apiBaseUrl, authToken) {
  try {
    console.log(`🔍 Fetching cookies for ${identityUid}/${integrationUid}`);
    
    const response = await axios.get(
      `${apiBaseUrl}/identities/${identityUid}/integrations/${integrationUid}/cookies`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    if (response.data.success) {
      const cookies = response.data.data.cookies;
      console.log(`✅ Fetched ${cookies.length} cookies from backend`);
      return cookies;
    } else {
      throw new Error(response.data.message || 'Failed to fetch cookies');
    }
    
  } catch (error) {
    console.error('❌ Error fetching cookies from backend:', error.message);
    throw error;
  }
}

/**
 * Complete cookie injection workflow for scraping jobs
 * @param {Object} jobConfig - Job configuration
 * @param {Object} browserContext - Browser context (Playwright/Puppeteer)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Injection result
 */
async function injectCookiesForJob(jobConfig, browserContext = null, options = {}) {
  try {
    const {
      identityUid,
      integrationUid = 'linkedin',
      apiBaseUrl,
      authToken,
      browserType = 'playwright' // 'playwright', 'puppeteer', or 'http'
    } = jobConfig;
    
    console.log(`🚀 Starting cookie injection for job: ${identityUid}/${integrationUid}`);
    
    // 1. Fetch cookies from backend
    const cookies = await fetchCookiesFromBackend(identityUid, integrationUid, apiBaseUrl, authToken);
    
    // 2. Validate cookies
    const validationResult = await validateCookies(cookies, integrationUid, {
      testRequest: options.validateCookies !== false
    });
    
    if (!validationResult.isValid) {
      console.warn('⚠️ Cookie validation failed:', validationResult.message);
      
      // Update validation status in backend
      try {
        await axios.put(
          `${apiBaseUrl}/identities/${identityUid}/integrations/${integrationUid}/cookies/validate`,
          {
            status: 'invalid',
            message: validationResult.message
          },
          {
            headers: { 'Authorization': `Bearer ${authToken}` }
          }
        );
      } catch (updateError) {
        console.error('❌ Failed to update validation status:', updateError.message);
      }
      
      throw new Error(`Cookie validation failed: ${validationResult.message}`);
    }
    
    console.log('✅ Cookie validation passed');
    
    // 3. Apply cookies based on browser type
    let injectionResult;
    
    if (browserType === 'playwright' && browserContext) {
      injectionResult = await applyCookiesToPlaywright(browserContext, cookies, integrationUid);
    } else if (browserType === 'puppeteer' && browserContext) {
      injectionResult = await applyCookiesToPuppeteer(browserContext, cookies, integrationUid);
    } else if (browserType === 'http') {
      const cookieHeader = getCookieHeader(cookies);
      injectionResult = {
        success: true,
        cookieHeader,
        cookieCount: cookies.length
      };
    } else {
      throw new Error(`Invalid browser type or missing context: ${browserType}`);
    }
    
    // 4. Update validation status as valid
    try {
      await axios.put(
        `${apiBaseUrl}/identities/${identityUid}/integrations/${integrationUid}/cookies/validate`,
        {
          status: 'valid',
          message: 'Cookies successfully validated and applied'
        },
        {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      );
    } catch (updateError) {
      console.error('❌ Failed to update validation status:', updateError.message);
    }
    
    console.log('🎉 Cookie injection completed successfully');
    
    return {
      success: true,
      identityUid,
      integrationUid,
      cookieCount: cookies.length,
      validationResult,
      injectionResult,
      browserType
    };
    
  } catch (error) {
    console.error('❌ Cookie injection failed:', error);
    throw error;
  }
}

// Export all functions
module.exports = {
  applyCookiesToPlaywright,
  applyCookiesToPuppeteer,
  getCookieHeader,
  validateCookies,
  fetchCookiesFromBackend,
  injectCookiesForJob,
  VALIDATION_CONFIGS
};