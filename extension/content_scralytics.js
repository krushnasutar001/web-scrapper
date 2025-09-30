/**
 * Scralytics Content Script
 * Runs on Scralytics domain to detect user login status and facilitate SSO
 */

(function() {
  'use strict';
  
  console.log('🔗 Scralytics Content Script loaded');
  
  // Configuration
  const CONFIG = {
    CHECK_INTERVAL: 2000, // Check every 2 seconds
    TOKEN_SELECTORS: [
      'meta[name="csrf-token"]',
      'meta[name="auth-token"]',
      '[data-auth-token]',
      '[data-user-token]'
    ],
    USER_SELECTORS: [
      '[data-user-id]',
      '[data-user-email]',
      '.user-profile',
      '.user-info',
      '.navbar .user-menu',
      '.header .user-dropdown'
    ]
  };
  
  let isInitialized = false;
  let lastLoginState = null;
  let checkInterval = null;
  
  // Initialize content script
  function initialize() {
    if (isInitialized) return;
    
    console.log('🚀 Initializing Scralytics content script');
    isInitialized = true;
    
    // Start monitoring for login changes
    startLoginMonitoring();
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Initial login check
    checkLoginStatus();
  }
  
  // Start monitoring for login status changes
  function startLoginMonitoring() {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
    
    checkInterval = setInterval(() => {
      checkLoginStatus();
    }, CONFIG.CHECK_INTERVAL);
    
    // Also monitor for DOM changes that might indicate login/logout
    observeLoginChanges();
  }
  
  // Check current login status
  function checkLoginStatus() {
    const loginData = detectLoginStatus();
    
    // Only notify if login state changed
    if (JSON.stringify(loginData) !== JSON.stringify(lastLoginState)) {
      console.log('🔄 Login state changed:', loginData);
      lastLoginState = loginData;
      
      // Notify background script
      chrome.runtime.sendMessage({
        type: 'SCRALYTICS_LOGIN_STATUS',
        data: loginData,
        url: window.location.href,
        timestamp: Date.now()
      });
    }
  }
  
  // Detect if user is logged in and extract relevant data
  function detectLoginStatus() {
    const loginData = {
      isLoggedIn: false,
      authToken: null,
      userId: null,
      userEmail: null,
      userName: null,
      sessionData: null
    };
    
    try {
      // Method 1: Check for authentication tokens in meta tags
      const authToken = extractAuthToken();
      if (authToken) {
        loginData.authToken = authToken;
        loginData.isLoggedIn = true;
      }
      
      // Method 2: Check for user data in DOM
      const userData = extractUserData();
      if (userData.userId || userData.userEmail) {
        loginData.isLoggedIn = true;
        Object.assign(loginData, userData);
      }
      
      // Method 3: Check localStorage/sessionStorage for auth data
      const storageData = extractStorageData();
      if (storageData.authToken || storageData.userId) {
        loginData.isLoggedIn = true;
        Object.assign(loginData, storageData);
      }
      
      // Method 4: Check for cookies (accessible ones)
      const cookieData = extractCookieData();
      if (cookieData.authToken) {
        loginData.isLoggedIn = true;
        Object.assign(loginData, cookieData);
      }
      
      // Method 5: Check for specific UI elements that indicate logged-in state
      const uiIndicators = checkUIIndicators();
      if (uiIndicators.isLoggedIn) {
        loginData.isLoggedIn = true;
        Object.assign(loginData, uiIndicators);
      }
      
    } catch (error) {
      console.error('❌ Error detecting login status:', error);
    }
    
    return loginData;
  }
  
  // Extract authentication token from various sources
  function extractAuthToken() {
    // Check meta tags
    for (const selector of CONFIG.TOKEN_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        const token = element.getAttribute('content') || element.getAttribute('data-auth-token') || element.getAttribute('data-user-token');
        if (token && token.length > 10) {
          return token;
        }
      }
    }
    
    // Check for token in script tags (common pattern)
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || script.innerHTML;
      
      // Look for common token patterns
      const tokenPatterns = [
        /window\.authToken\s*=\s*["']([^"']+)["']/,
        /window\.token\s*=\s*["']([^"']+)["']/,
        /"authToken"\s*:\s*["']([^"']+)["']/,
        /"accessToken"\s*:\s*["']([^"']+)["']/,
        /Bearer\s+([A-Za-z0-9\-_\.]+)/
      ];
      
      for (const pattern of tokenPatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].length > 10) {
          return match[1];
        }
      }
    }
    
    return null;
  }
  
  // Extract user data from DOM
  function extractUserData() {
    const userData = {
      userId: null,
      userEmail: null,
      userName: null
    };
    
    // Check data attributes
    for (const selector of CONFIG.USER_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        userData.userId = element.getAttribute('data-user-id') || userData.userId;
        userData.userEmail = element.getAttribute('data-user-email') || userData.userEmail;
        userData.userName = element.textContent?.trim() || userData.userName;
      }
    }
    
    // Check for user info in common locations
    const userNameElements = document.querySelectorAll('.user-name, .username, .user-display-name, [data-testid="user-name"]');
    for (const element of userNameElements) {
      if (element.textContent?.trim()) {
        userData.userName = element.textContent.trim();
        break;
      }
    }
    
    // Check for email in various places
    const emailElements = document.querySelectorAll('[data-user-email], .user-email, input[type="email"][value]');
    for (const element of emailElements) {
      const email = element.getAttribute('data-user-email') || element.value || element.textContent;
      if (email && email.includes('@')) {
        userData.userEmail = email.trim();
        break;
      }
    }
    
    return userData;
  }
  
  // Extract data from localStorage/sessionStorage
  function extractStorageData() {
    const storageData = {
      authToken: null,
      userId: null,
      sessionData: null
    };
    
    try {
      // Common storage keys for auth data
      const authKeys = ['authToken', 'accessToken', 'token', 'jwt', 'auth', 'user_token'];
      const userKeys = ['userId', 'user_id', 'currentUser', 'user', 'userData'];
      
      // Check localStorage
      for (const key of authKeys) {
        const value = localStorage.getItem(key);
        if (value && value.length > 10) {
          storageData.authToken = value;
          break;
        }
      }
      
      for (const key of userKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            if (parsed.id || parsed.userId) {
              storageData.userId = parsed.id || parsed.userId;
              storageData.sessionData = parsed;
            }
          } catch (e) {
            if (value.length > 0) {
              storageData.userId = value;
            }
          }
        }
      }
      
      // Check sessionStorage
      for (const key of authKeys) {
        const value = sessionStorage.getItem(key);
        if (value && value.length > 10 && !storageData.authToken) {
          storageData.authToken = value;
          break;
        }
      }
      
    } catch (error) {
      console.error('Error accessing storage:', error);
    }
    
    return storageData;
  }
  
  // Extract data from accessible cookies
  function extractCookieData() {
    const cookieData = {
      authToken: null
    };
    
    try {
      const cookies = document.cookie.split(';');
      const authCookieNames = ['authToken', 'accessToken', 'token', 'jwt', 'auth'];
      
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (authCookieNames.includes(name) && value && value.length > 10) {
          cookieData.authToken = decodeURIComponent(value);
          break;
        }
      }
    } catch (error) {
      console.error('Error accessing cookies:', error);
    }
    
    return cookieData;
  }
  
  // Check UI indicators for logged-in state
  function checkUIIndicators() {
    const indicators = {
      isLoggedIn: false,
      userName: null
    };
    
    // Common indicators of logged-in state
    const loggedInSelectors = [
      '.user-menu',
      '.user-dropdown',
      '.user-avatar',
      '.profile-menu',
      '.logout-btn',
      '.sign-out',
      '[data-testid="user-menu"]',
      '.navbar .user',
      '.header .user'
    ];
    
    // Check if any logged-in indicators are present
    for (const selector of loggedInSelectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) { // Element is visible
        indicators.isLoggedIn = true;
        
        // Try to extract user name from the element
        const nameElement = element.querySelector('.name, .username, .user-name') || element;
        if (nameElement.textContent?.trim()) {
          indicators.userName = nameElement.textContent.trim();
        }
        break;
      }
    }
    
    // Check for login/register buttons (indicates NOT logged in)
    const loginSelectors = ['.login-btn', '.sign-in', '.register', '[href*="login"]', '[href*="signin"]'];
    const hasLoginButtons = loginSelectors.some(selector => {
      const element = document.querySelector(selector);
      return element && element.offsetParent !== null;
    });
    
    if (hasLoginButtons && !indicators.isLoggedIn) {
      indicators.isLoggedIn = false;
    }
    
    return indicators;
  }
  
  // Observe DOM changes that might indicate login/logout
  function observeLoginChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      for (const mutation of mutations) {
        // Check if any added/removed nodes might affect login state
        if (mutation.type === 'childList') {
          const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
          for (const node of nodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (element.matches && (
                element.matches('.user-menu, .user-dropdown, .login-btn, .logout-btn') ||
                element.querySelector('.user-menu, .user-dropdown, .login-btn, .logout-btn')
              )) {
                shouldCheck = true;
                break;
              }
            }
          }
        }
        
        if (shouldCheck) break;
      }
      
      if (shouldCheck) {
        // Debounce the check
        setTimeout(checkLoginStatus, 500);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Handle messages from background script
  function handleMessage(request, sender, sendResponse) {
    console.log('📨 Scralytics content script received message:', request);
    
    switch (request.type) {
      case 'GET_LOGIN_STATUS':
        const loginData = detectLoginStatus();
        sendResponse({ success: true, data: loginData });
        break;
        
      case 'FORCE_LOGIN_CHECK':
        checkLoginStatus();
        sendResponse({ success: true });
        break;
        
      default:
        console.log('❓ Unknown message type:', request.type);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // Also initialize on page navigation (for SPAs)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('🔄 Page navigation detected, reinitializing...');
      setTimeout(initialize, 1000); // Wait for SPA to load
    }
  }).observe(document, { subtree: true, childList: true });
  
})();