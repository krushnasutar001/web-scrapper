/**
 * Response Validator Utility
 * Safely handles JSON parsing and response validation to prevent HTML parsing errors
 */

/**
 * Safely parse JSON with content-type validation
 * @param {string} data - The data to parse
 * @param {string} contentType - The content-type header (optional)
 * @returns {Object} Parsed data or error information
 */
function safeJsonParse(data, contentType = null) {
  try {
    // Check if data is null, undefined, or empty
    if (!data || data.trim() === '') {
      return {
        success: false,
        error: 'Empty or null data provided',
        data: null
      };
    }

    // Check if content-type indicates HTML (common when LinkedIn blocks/redirects)
    if (contentType && contentType.toLowerCase().includes('text/html')) {
      return {
        success: false,
        error: 'Received HTML response instead of JSON',
        data: null,
        isHtml: true,
        htmlContent: data.substring(0, 500) // First 500 chars for debugging
      };
    }

    // Check if data starts with HTML doctype or tags
    const trimmedData = data.trim();
    if (trimmedData.startsWith('<!DOCTYPE') || 
        trimmedData.startsWith('<html') || 
        trimmedData.startsWith('<HTML')) {
      return {
        success: false,
        error: 'Detected HTML content instead of JSON',
        data: null,
        isHtml: true,
        htmlContent: trimmedData.substring(0, 500)
      };
    }

    // Check for common LinkedIn error pages
    if (trimmedData.includes('LinkedIn') && 
        (trimmedData.includes('sign in') || 
         trimmedData.includes('Sign In') ||
         trimmedData.includes('captcha') ||
         trimmedData.includes('blocked') ||
         trimmedData.includes('rate limit'))) {
      return {
        success: false,
        error: 'LinkedIn authentication or rate limiting page detected',
        data: null,
        isHtml: true,
        isLinkedInError: true,
        htmlContent: trimmedData.substring(0, 500)
      };
    }

    // Attempt to parse JSON
    const parsed = JSON.parse(data);
    return {
      success: true,
      data: parsed,
      error: null
    };

  } catch (parseError) {
    // Check if the error is due to HTML content
    const isHtmlError = parseError.message.includes('Unexpected token \'<\'') ||
                       parseError.message.includes('<!DOCTYPE');
    
    return {
      success: false,
      error: `JSON parsing failed: ${parseError.message}`,
      data: null,
      isHtml: isHtmlError,
      parseError: parseError.message,
      htmlContent: isHtmlError ? data.substring(0, 500) : null
    };
  }
}

/**
 * Validate HTTP response before JSON parsing
 * @param {Object} response - HTTP response object
 * @returns {Object} Validation result
 */
function validateHttpResponse(response) {
  if (!response) {
    return {
      valid: false,
      error: 'No response object provided'
    };
  }

  // Check status code
  if (response.status && (response.status < 200 || response.status >= 300)) {
    return {
      valid: false,
      error: `HTTP error status: ${response.status}`,
      status: response.status,
      isHttpError: true
    };
  }

  // Check content-type header
  const contentType = response.headers && response.headers['content-type'];
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    return {
      valid: false,
      error: `Unexpected content-type: ${contentType}`,
      contentType: contentType,
      isContentTypeError: true
    };
  }

  return {
    valid: true,
    contentType: contentType
  };
}

/**
 * Safely handle fetch response with proper validation
 * @param {Response} response - Fetch response object
 * @returns {Object} Parsed response or error information
 */
async function safeFetchResponse(response) {
  try {
    // Validate response
    const validation = validateHttpResponse(response);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        status: response.status,
        ...validation
      };
    }

    // Get response text first
    const responseText = await response.text();
    
    // Parse JSON safely
    const parseResult = safeJsonParse(responseText, validation.contentType);
    
    return {
      success: parseResult.success,
      data: parseResult.data,
      error: parseResult.error,
      status: response.status,
      contentType: validation.contentType,
      ...parseResult
    };

  } catch (error) {
    return {
      success: false,
      error: `Response handling failed: ${error.message}`,
      data: null
    };
  }
}

/**
 * Enhanced retry mechanism for failed requests with proper headers and user agents
 * @param {Function} requestFn - Function that makes the request
 * @param {Object} options - Retry options
 * @returns {Promise<any>} - Response from successful request
 */
async function retryRequest(requestFn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    retryCondition = (error) => true,
    enhanceHeaders = false,
    rotateCookies = false,
    cookiePool = []
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Enhance request with better headers and user agents on retry
      if (attempt > 0 && enhanceHeaders) {
        const enhancedOptions = getEnhancedRequestOptions(attempt, options);
        return await requestFn(enhancedOptions);
      }
      
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !retryCondition(error)) {
        throw error;
      }
      
      const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
      console.log(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  throw lastError;
}

/**
 * Get enhanced request options for retry attempts
 * @param {number} attempt - Current attempt number
 * @param {Object} baseOptions - Base request options
 * @returns {Object} - Enhanced request options
 */
function getEnhancedRequestOptions(attempt, baseOptions = {}) {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
  ];

  const acceptLanguages = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.9',
    'en-US,en;q=0.8,es;q=0.6',
    'en-US,en;q=0.9,fr;q=0.8'
  ];

  const userAgent = userAgents[attempt % userAgents.length];
  const acceptLanguage = acceptLanguages[attempt % acceptLanguages.length];

  return {
    ...baseOptions,
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      ...baseOptions.headers
    }
  };
}

/**
 * Enhanced LinkedIn-specific retry with rate limiting awareness
 * @param {Function} requestFn - Function that makes the request
 * @param {Object} options - Retry options
 * @returns {Promise<any>} - Response from successful request
 */
async function retryLinkedInRequest(requestFn, options = {}) {
  const linkedInRetryCondition = (error) => {
    // Don't retry on authentication failures
    if (error.message && error.message.includes('authentication failed')) {
      return false;
    }
    
    // Don't retry on permanent blocks
    if (error.message && error.message.includes('permanently blocked')) {
      return false;
    }
    
    // Retry on rate limits, network errors, timeouts
    return true;
  };

  return retryRequest(requestFn, {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2.5,
    enhanceHeaders: true,
    retryCondition: linkedInRetryCondition,
    ...options
  });
}

module.exports = {
  safeJsonParse,
  validateHttpResponse,
  safeFetchResponse,
  retryRequest,
  getEnhancedRequestOptions,
  retryLinkedInRequest
};