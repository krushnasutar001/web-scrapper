/**
 * LinkedIn Response Handler
 * Specialized handler for LinkedIn responses to detect blocks, captchas, and login redirects
 */

const { safeJsonParse, retryRequest } = require('./responseValidator');

/**
 * Detect LinkedIn error conditions from HTML content
 * @param {string} htmlContent - HTML content to analyze
 * @returns {Object} Detection result
 */
function detectLinkedInError(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return { isError: false };
  }

  const content = htmlContent.toLowerCase();
  
  // Check for login page
  if (content.includes('sign in to linkedin') || 
      content.includes('join linkedin') ||
      content.includes('linkedin login') ||
      content.includes('uas/login')) {
    return {
      isError: true,
      errorType: 'LOGIN_REQUIRED',
      message: 'LinkedIn login page detected - authentication failed',
      suggestion: 'Check and refresh LinkedIn cookies/session'
    };
  }

  // Check for CAPTCHA
  if (content.includes('captcha') || 
      content.includes('security challenge') ||
      content.includes('verify you are human')) {
    return {
      isError: true,
      errorType: 'CAPTCHA',
      message: 'LinkedIn CAPTCHA challenge detected',
      suggestion: 'Manual intervention required or wait before retrying'
    };
  }

  // Check for rate limiting
  if (content.includes('rate limit') || 
      content.includes('too many requests') ||
      content.includes('slow down')) {
    return {
      isError: true,
      errorType: 'RATE_LIMITED',
      message: 'LinkedIn rate limiting detected',
      suggestion: 'Implement delays between requests and consider using different accounts'
    };
  }

  // Check for blocked/restricted access
  if (content.includes('access denied') || 
      content.includes('blocked') ||
      content.includes('restricted') ||
      content.includes('unavailable')) {
    return {
      isError: true,
      errorType: 'ACCESS_BLOCKED',
      message: 'LinkedIn access blocked or restricted',
      suggestion: 'Account may be flagged - consider using different account or proxy'
    };
  }

  // Check for Cloudflare protection
  if (content.includes('cloudflare') || 
      content.includes('checking your browser') ||
      content.includes('ddos protection')) {
    return {
      isError: true,
      errorType: 'CLOUDFLARE_PROTECTION',
      message: 'Cloudflare protection detected',
      suggestion: 'Wait and retry with proper browser headers'
    };
  }

  // Check for maintenance page
  if (content.includes('maintenance') || 
      content.includes('temporarily unavailable') ||
      content.includes('service unavailable')) {
    return {
      isError: true,
      errorType: 'MAINTENANCE',
      message: 'LinkedIn maintenance or service unavailable',
      suggestion: 'Wait and retry later'
    };
  }

  return { isError: false };
}

/**
 * Handle LinkedIn response with error detection
 * @param {string} responseData - Response data to handle
 * @param {string} contentType - Content type header
 * @param {string} url - Request URL for context
 * @returns {Object} Handled response
 */
function handleLinkedInResponse(responseData, contentType = null, url = null) {
  // First try safe JSON parsing
  const parseResult = safeJsonParse(responseData, contentType);
  
  if (parseResult.success) {
    return {
      success: true,
      data: parseResult.data,
      source: 'json'
    };
  }

  // If JSON parsing failed and we have HTML, analyze it
  if (parseResult.isHtml) {
    const errorDetection = detectLinkedInError(responseData);
    
    return {
      success: false,
      error: parseResult.error,
      linkedInError: errorDetection,
      htmlContent: parseResult.htmlContent,
      url: url,
      source: 'html',
      shouldRetry: errorDetection.errorType === 'RATE_LIMITED' || 
                   errorDetection.errorType === 'MAINTENANCE',
      requiresManualIntervention: errorDetection.errorType === 'CAPTCHA' ||
                                  errorDetection.errorType === 'ACCESS_BLOCKED'
    };
  }

  // Return the original parse result if not HTML
  return {
    success: false,
    error: parseResult.error,
    source: 'unknown'
  };
}

/**
 * Create LinkedIn-specific retry configuration
 * @param {Object} options - Custom options
 * @returns {Object} Retry configuration
 */
function createLinkedInRetryConfig(options = {}) {
  return {
    maxRetries: options.maxRetries || 3,
    delay: options.delay || 2000, // Start with 2 seconds
    backoffMultiplier: options.backoffMultiplier || 2,
    shouldRetry: (error) => {
      // Retry on rate limiting, maintenance, or network errors
      if (error.linkedInError) {
        return error.linkedInError.errorType === 'RATE_LIMITED' ||
               error.linkedInError.errorType === 'MAINTENANCE' ||
               error.linkedInError.errorType === 'CLOUDFLARE_PROTECTION';
      }
      return error.isHtml || error.isHttpError;
    }
  };
}

/**
 * Enhanced LinkedIn request with automatic retry and error handling
 * @param {Function} requestFn - Function that makes the LinkedIn request
 * @param {Object} options - Request options
 * @returns {Promise} Request result
 */
async function makeLinkedInRequest(requestFn, options = {}) {
  const retryConfig = createLinkedInRetryConfig(options.retry);
  
  return retryRequest(async () => {
    try {
      const response = await requestFn();
      
      // If it's already a processed response, return it
      if (response.hasOwnProperty('success')) {
        return response;
      }
      
      // Handle raw response
      const responseText = typeof response === 'string' ? response : 
                          response.text ? await response.text() : 
                          JSON.stringify(response);
      
      const contentType = response.headers ? response.headers['content-type'] : null;
      const url = response.url || options.url;
      
      return handleLinkedInResponse(responseText, contentType, url);
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        source: 'network'
      };
    }
  }, retryConfig);
}

/**
 * Log LinkedIn error for monitoring and debugging
 * @param {Object} error - Error object from LinkedIn response
 * @param {string} context - Context where error occurred
 */
function logLinkedInError(error, context = 'unknown') {
  if (!error.linkedInError) return;
  
  const { errorType, message, suggestion } = error.linkedInError;
  
  console.error(`🚫 LinkedIn Error [${context}]:`);
  console.error(`   Type: ${errorType}`);
  console.error(`   Message: ${message}`);
  console.error(`   Suggestion: ${suggestion}`);
  
  if (error.url) {
    console.error(`   URL: ${error.url}`);
  }
  
  // Log first 200 characters of HTML for debugging
  if (error.htmlContent) {
    console.error(`   HTML Preview: ${error.htmlContent.substring(0, 200)}...`);
  }
}

module.exports = {
  detectLinkedInError,
  handleLinkedInResponse,
  createLinkedInRetryConfig,
  makeLinkedInRequest,
  logLinkedInError
};