/**
 * Cookie Management Utilities
 * Comprehensive cookie handling for raw session authentication
 */

const crypto = require('crypto');
const axios = require('axios');

class CookieManager {
  constructor(encryptionKey = null) {
    this.encryptionKey = encryptionKey || process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key-123';
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Parse raw cookies into standardized format
   * @param {string|Array|Object} rawCookies - Raw cookie input
   * @returns {Array} Standardized cookie array
   */
  parseCookies(rawCookies) {
    if (typeof rawCookies === 'string') {
      // Handle cookie string formats
      if (rawCookies.includes(';')) {
        // Format: "name=value; name2=value2"
        return rawCookies.split(';').map(cookie => {
          const [name, ...valueParts] = cookie.trim().split('=');
          return {
            name: name.trim(),
            value: valueParts.join('=').trim(),
            domain: '.linkedin.com',
            path: '/'
          };
        }).filter(cookie => cookie.name && cookie.value);
      } else if (rawCookies.length > 50) {
        // Assume it's a raw li_at cookie value
        return [{
          name: 'li_at',
          value: rawCookies.trim(),
          domain: '.linkedin.com',
          path: '/'
        }];
      }
    }
    
    if (Array.isArray(rawCookies)) {
      // Handle array format from extensions
      return rawCookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.linkedin.com',
        path: cookie.path || '/'
      }));
    }
    
    if (typeof rawCookies === 'object' && rawCookies !== null) {
      // Handle object format {name: value, name2: value2}
      return Object.entries(rawCookies).map(([name, value]) => ({
        name,
        value,
        domain: '.linkedin.com',
        path: '/'
      }));
    }
    
    throw new Error('Invalid cookie format');
  }

  /**
   * Build Cookie header for HTTP requests
   * @param {string|Array|Object} rawCookies - Raw cookie input
   * @returns {string} Cookie header value
   */
  buildCookieHeader(rawCookies) {
    const cookies = this.parseCookies(rawCookies);
    return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  }

  /**
   * Format cookies for Playwright/Puppeteer browser context
   * @param {string|Array|Object} rawCookies - Raw cookie input
   * @param {string} url - Target URL for domain extraction
   * @returns {Array} Browser-compatible cookie array
   */
  formatForBrowser(rawCookies, url = 'https://www.linkedin.com') {
    const cookies = this.parseCookies(rawCookies);
    const urlObj = new URL(url);
    
    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || urlObj.hostname,
      path: cookie.path || '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None'
    }));
  }

  /**
   * Encrypt cookies for secure database storage
   * @param {string|Array|Object} rawCookies - Raw cookie input
   * @returns {string} Encrypted cookie string
   */
  encryptCookies(rawCookies) {
    try {
      const cookieString = typeof rawCookies === 'string' ? rawCookies : JSON.stringify(rawCookies);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      
      let encrypted = cipher.update(cookieString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag ? cipher.getAuthTag().toString('hex') : '';
      
      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
      console.error('Cookie encryption failed:', error);
      throw new Error('Failed to encrypt cookies');
    }
  }

  /**
   * Decrypt cookies from database storage
   * @param {string} encryptedCookies - Encrypted cookie string
   * @returns {string} Decrypted cookie string
   */
  decryptCookies(encryptedCookies) {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedCookies.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      
      if (authTagHex && decipher.setAuthTag) {
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      }
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Cookie decryption failed:', error);
      throw new Error('Failed to decrypt cookies');
    }
  }

  /**
   * Validate cookies by making a test request
   * @param {string|Array|Object} rawCookies - Raw cookie input
   * @param {string} testUrl - URL to test against
   * @returns {Promise<Object>} Validation result
   */
  async validateCookies(rawCookies, testUrl = 'https://www.linkedin.com/feed/') {
    try {
      const cookieHeader = this.buildCookieHeader(rawCookies);
      
      const response = await axios.get(testUrl, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400
      });

      // Check if redirected to login page
      if (response.request.res.responseUrl && response.request.res.responseUrl.includes('/login')) {
        return {
          valid: false,
          expired: true,
          message: 'Cookies expired - redirected to login'
        };
      }

      // Check for LinkedIn-specific indicators
      const isLinkedInPage = response.data.includes('linkedin.com') || 
                            response.data.includes('voyager') ||
                            response.data.includes('feed');

      return {
        valid: isLinkedInPage,
        expired: false,
        message: isLinkedInPage ? 'Cookies are valid' : 'Invalid response content',
        statusCode: response.status
      };

    } catch (error) {
      if (error.response && error.response.status === 302) {
        // Redirect usually means expired cookies
        return {
          valid: false,
          expired: true,
          message: 'Cookies expired - received redirect'
        };
      }

      return {
        valid: false,
        expired: false,
        message: `Validation failed: ${error.message}`,
        error: error.code
      };
    }
  }

  /**
   * Extract cookies from browser extension format
   * @param {Array} extensionCookies - Cookies from Chrome extension
   * @returns {Array} Filtered LinkedIn cookies
   */
  extractLinkedInCookies(extensionCookies) {
    const linkedInCookieNames = ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc', 'liap', 'lang'];
    
    return extensionCookies.filter(cookie => 
      linkedInCookieNames.includes(cookie.name) && 
      (cookie.domain.includes('linkedin.com') || cookie.domain.includes('.linkedin.com'))
    );
  }

  /**
   * Create Axios instance with cookies pre-configured
   * @param {string|Array|Object} rawCookies - Raw cookie input
   * @param {Object} options - Additional Axios options
   * @returns {Object} Configured Axios instance
   */
  createAxiosInstance(rawCookies, options = {}) {
    const cookieHeader = this.buildCookieHeader(rawCookies);
    
    return axios.create({
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...options.headers
      },
      timeout: 30000,
      maxRedirects: 5,
      ...options
    });
  }

  /**
   * Generate cookie configuration for different platforms
   * @param {string|Array|Object} rawCookies - Raw cookie input
   * @returns {Object} Platform-specific configurations
   */
  generateConfigurations(rawCookies) {
    const cookieHeader = this.buildCookieHeader(rawCookies);
    const browserCookies = this.formatForBrowser(rawCookies);
    
    return {
      // For Axios/Fetch HTTP requests
      http: {
        headers: {
          'Cookie': cookieHeader
        }
      },
      
      // For Playwright
      playwright: {
        cookies: browserCookies
      },
      
      // For Puppeteer
      puppeteer: {
        cookies: browserCookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path
        }))
      },
      
      // For Python requests
      python: {
        cookies: Object.fromEntries(
          this.parseCookies(rawCookies).map(cookie => [cookie.name, cookie.value])
        )
      }
    };
  }
}

module.exports = CookieManager;