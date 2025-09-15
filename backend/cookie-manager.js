// Cookie Manager Module
// Handles LinkedIn cookie parsing and validation

class CookieManager {
  // Parse cookie string into object
  static parseCookieString(cookieString) {
    if (!cookieString) return {};
    
    const cookies = {};
    cookieString.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        cookies[parts[0]] = parts[1];
      }
    });
    return cookies;
  }

  // Convert cookie object to string
  static cookieObjectToString(cookieObj) {
    if (!cookieObj || typeof cookieObj !== 'object') return '';
    
    return Object.entries(cookieObj)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  // Validate LinkedIn session cookie
  static validateLinkedInCookie(cookieString) {
    const cookies = this.parseCookieString(cookieString);
    
    // Check for essential LinkedIn cookies
    const requiredCookies = ['li_at', 'JSESSIONID'];
    const hasRequired = requiredCookies.some(name => cookies[name]);
    
    return {
      isValid: hasRequired,
      cookies: cookies,
      hasLiAt: !!cookies.li_at,
      hasJSessionId: !!cookies.JSESSIONID
    };
  }

  // Extract li_at cookie value
  static extractLiAtCookie(cookieString) {
    const cookies = this.parseCookieString(cookieString);
    return cookies.li_at || null;
  }
}

module.exports = CookieManager;