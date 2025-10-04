/**
 * LinkedIn Content Script
 * Handles job execution, data capture, and automation on LinkedIn
 */

(function() {
  'use strict';
  
  console.log('🔗 LinkedIn Content Script loaded');
  
  // Safe messaging wrapper to handle invalidated extension context and avoid uncaught errors
  function safeSendMessage(message) {
    return new Promise((resolve) => {
      try {
        if (!chrome?.runtime?.id) {
          resolve({ success: false, error: 'Extension context invalidated' });
          return;
        }
        chrome.runtime.sendMessage(message, (response) => {
          const lastErr = chrome.runtime.lastError && chrome.runtime.lastError.message;
          if (lastErr) {
            resolve({ success: false, error: lastErr });
          } else {
            resolve(response || { success: true });
          }
        });
      } catch (err) {
        resolve({ success: false, error: String(err.message || err) });
      }
    });
  }
  
  // Configuration
  const CONFIG = {
    SELECTORS: {
      // Profile selectors
      profileName: 'h1.text-heading-xlarge, .pv-text-details__left-panel h1, .ph5 h1',
      profileHeadline: '.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium',
      profileLocation: '.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small',
      profileImage: '.pv-top-card-profile-picture__image, .presence-entity__image',
      
      // Connection selectors
      connectButton: 'button[aria-label*="Invite"][aria-label*="connect"], button[data-control-name="connect"]',
      sendButton: 'button[aria-label="Send invitation"], button[data-control-name="send_invitation"]',
      messageButton: 'button[aria-label*="Message"], button[data-control-name="message"]',
      
      // Search selectors
      searchResults: '.reusable-search__result-container, .search-result__wrapper',
      searchResultName: '.entity-result__title-text a, .search-result__result-link',
      searchResultHeadline: '.entity-result__primary-subtitle, .search-result__snippet',
      
      // Navigation
      nextButton: 'button[aria-label="Next"], .artdeco-pagination__button--next',
      
      // Modal/Dialog selectors
      modal: '.artdeco-modal, .msg-overlay-bubble-header',
      modalClose: 'button[aria-label="Dismiss"], .artdeco-modal__dismiss',
      
      // Input fields
      messageInput: '.msg-form__contenteditable, #custom-message',
      noteInput: '#custom-message, .connect-button-send-invite__custom-message'
    },
    
    DELAYS: {
      SHORT: 1000,    // 1 second
      MEDIUM: 2000,   // 2 seconds
      LONG: 3000,     // 3 seconds
      VERY_LONG: 5000 // 5 seconds
    },
    
    MAX_RETRIES: 3,
    SCROLL_DELAY: 1000
  };
  
  let currentJob = null;
  let isExecutingJob = false;
  let jobResults = [];
  
  // Initialize content script
  function initialize() {
    console.log('🚀 Initializing LinkedIn content script');
    
    // Listen for messages from background script with error handling
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      try {
        handleMessage(message, sender, sendResponse);
      } catch (error) {
        console.error('❌ Error handling message:', error);
        sendResponse({ error: error.message });
      }
      return true; // Keep the message channel open for async responses
    });
    
    // Multiple detection attempts to ensure we capture the account
    const detectAttempts = [1000, 3000, 5000, 10000];
    detectAttempts.forEach(delay => {
      setTimeout(() => {
        console.log(`Attempting account detection after ${delay}ms`);
        detectLinkedInAccount();
      }, delay);
    });
    
    // Multiple cookie collection attempts
    const cookieAttempts = [1500, 4000, 8000];
    cookieAttempts.forEach(delay => {
      setTimeout(() => {
        console.log(`Collecting cookies after ${delay}ms`);
        collectAndSendCookies();
      }, delay);
    });
    
    // Notify background script that LinkedIn is ready with error handling (use safeSendMessage)
    try {
      safeSendMessage({
        type: 'LINKEDIN_READY',
        url: window.location.href,
        timestamp: Date.now()
      }).then((res) => {
        if (!res || res.success !== true) {
          console.log('Communication error:', (res && res.error) || 'Unknown error');
          setTimeout(() => {
            safeSendMessage({
              type: 'LINKEDIN_READY',
              url: window.location.href,
              timestamp: Date.now()
            });
          }, 3000);
        }
      });
    } catch (error) {
      console.error('❌ Failed to send ready message:', error);
    }
    
    // Set up periodic cookie collection
    setInterval(collectAndSendCookies, CONFIG.DELAYS.VERY_LONG); // Check periodically

    // Robust flush triggers: when tab gains focus, becomes visible, or network returns
    try {
      const tryFlush = () => { try { flushCookieQueue(); } catch (_) { /* ignore */ } };
      window.addEventListener('focus', tryFlush, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tryFlush();
      }, { passive: true });
      window.addEventListener('online', tryFlush, { passive: true });
    } catch (e) {
      // Non-fatal; environment may not support these events
      console.warn('⚠️ Flush triggers setup warning:', e && (e.message || e));
    }
  }
  
  // Collect and send LinkedIn cookies to background script
  function collectAndSendCookies() {
    if (!isLinkedInDomain(window.location.hostname)) {
      console.log('Not on LinkedIn domain, skipping cookie collection');
      return;
    }
    
    try {
      console.log('🍪 Collecting LinkedIn cookies...');
      
      // Use document.cookie to get cookies for the current domain
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split('=');
        acc[name] = value;
        return acc;
      }, {});
      
      // Check for essential LinkedIn cookies
      const essentialCookies = {
        li_at: cookies.li_at || '',
        JSESSIONID: cookies.JSESSIONID || '',
        liap: cookies.liap || '',
        li_rm: cookies.li_rm || '',
        lang: cookies.lang || 'en_US'
      };
      
      // Get Chrome profile ID
      const profileId = getCurrentChromeProfile();
      
      // Normalize and persist cookies locally so popup can use them even if messaging is down
      try {
        const normalizedCookies = Object.keys(essentialCookies).map((name) => ({ name, value: String(essentialCookies[name] || '') }));
        chrome.storage.local.set({ latestCookies: { accountName: 'LinkedIn Account', cookies: normalizedCookies, ts: Date.now(), url: window.location.href } });
      } catch (_) { /* non-fatal */ }
      
      // Helper: check extension context availability
      function isExtensionContextAvailable() {
        try {
          return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
        } catch (_) {
          return false;
        }
      }

      // Helper: wait for extension context to become available
      function waitForExtensionContext(maxMs = 5000, intervalMs = 250) {
        return new Promise((resolve) => {
          const start = Date.now();
          const timer = setInterval(() => {
            if (isExtensionContextAvailable() || (Date.now() - start) >= maxMs) {
              clearInterval(timer);
              resolve(isExtensionContextAvailable());
            }
          }, intervalMs);
        });
      }

      // Helper: queue payloads when context is invalidated
      async function enqueueCookiePayload(payload) {
        try {
          const existing = await new Promise((resolve) => {
            try { chrome.storage.local.get(['pendingCookiePayloads'], (items) => resolve(items?.pendingCookiePayloads || [])); }
            catch { resolve([]); }
          });
          existing.push(payload);
          await new Promise((resolve) => {
            try { chrome.storage.local.set({ pendingCookiePayloads: existing }, () => resolve()); }
            catch { resolve(); }
          });
          // Also persist latest cookies immediately for popup/local use
          try {
            const cookiePayload = payload?.cookies;
            const normalized = Array.isArray(cookiePayload)
              ? cookiePayload
              : Object.keys(cookiePayload || {}).map((k) => ({ name: k, value: String(cookiePayload?.[k] || '') }));
            chrome.storage.local.set({ latestCookies: { accountName: payload?.accountName || 'LinkedIn Account', cookies: normalized, ts: Date.now(), url: payload?.url || window.location.href } });
          } catch (_) { /* ignore */ }
        } catch (_) { /* swallow */ }
      }

      // Helper: flush queued payloads once context is available
      async function flushCookieQueue() {
        if (!isExtensionContextAvailable()) return false;
        const queued = await new Promise((resolve) => {
          try { chrome.storage.local.get(['pendingCookiePayloads'], (items) => resolve(items?.pendingCookiePayloads || [])); }
          catch { resolve([]); }
        });
        if (!queued.length) return true;
        for (const payload of queued) {
          try {
            await new Promise((resolve) => {
              try {
                chrome.runtime.sendMessage(payload, () => resolve());
              } catch (_) { resolve(); }
            });
          } catch (_) { /* swallow */ }
        }
        try { await new Promise((resolve) => chrome.storage.local.set({ pendingCookiePayloads: [] }, () => resolve())); } catch { /* ignore */ }
        return true;
      }

      // Track last invalidation log to avoid noisy warnings
      let lastInvalidationLog = 0;
      // Maintain a long-lived port to keep background awake and deliver messages
      let cookiePort = null;
      function ensureCookiePort() {
        if (!isExtensionContextAvailable()) return null;
        try {
          if (!cookiePort) {
            cookiePort = chrome.runtime.connect({ name: 'linkedin-cookie-port' });
            // Auto-reconnect if the port drops
            try {
              cookiePort.onDisconnect.addListener(() => {
                cookiePort = null;
                setTimeout(() => { ensureCookiePort(); }, 2000);
              });
            } catch (_) {}
          }
          return cookiePort;
        } catch (_) { return null; }
      }
      function sendViaPort(payload) {
        const port = ensureCookiePort();
        if (!port) return false;
        try {
          port.postMessage(payload);
          return true;
        } catch (_) { return false; }
      }
      console.log('📤 sending cookies to background...');
      // Send cookies to background script with error handling and context validation
      function sendCookiesWithRetry(retryCount = 0, maxRetries = 10) {
        const payload = {
          type: 'LINKEDIN_COOKIES_COLLECTED',
          cookies: essentialCookies,
          url: window.location.href,
          timestamp: Date.now(),
          profileId: profileId
        };

        if (retryCount >= maxRetries) {
          console.debug(`Cookie send deferred after ${maxRetries} attempts; queued for flush.`);
          enqueueCookiePayload(payload);
          // Attempt a background flush when context returns
          waitForExtensionContext(8000).then((available) => { if (available) flushCookieQueue(); });
          return;
        }

        // Prefer port when possible; it keeps SW alive and avoids transient invalidation
        if (isExtensionContextAvailable()) {
          const sent = sendViaPort(payload);
          if (sent) {
            console.log('✅ cookies sent via port');
            // Opportunistically flush queued items
            flushCookieQueue();
            return;
          }
        }

        // If context invalidated, queue and retry once available
        if (!isExtensionContextAvailable()) {
          const shouldLog = (Date.now() - lastInvalidationLog > 60000) && (document.visibilityState === 'visible') && (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
          if (shouldLog) {
            console.debug('Context unavailable; queued cookies. Will retry when active.');
            lastInvalidationLog = Date.now();
          }
          enqueueCookiePayload(payload);
          waitForExtensionContext(4000).then((available) => {
            if (available) {
              flushCookieQueue();
            } else {
              setTimeout(() => sendCookiesWithRetry(retryCount + 1, maxRetries), 500 * Math.pow(2, retryCount));
            }
          });
          return;
        }

        try {
          chrome.runtime.sendMessage(payload, (response) => {
            if (chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError.message || 'Unknown error';
              // Queue on context errors and exponential backoff
              if (/context|closed|invalid/i.test(errMsg)) {
                enqueueCookiePayload(payload);
              }
              console.debug('Cookie send failed (transient):', errMsg);
              const delay = Math.min(8000, 800 * Math.pow(2, retryCount));
              setTimeout(() => sendCookiesWithRetry(retryCount + 1, maxRetries), delay);
            } else {
              const ok = response && (response.success === true || response.ok === true);
              if (ok) {
                console.log('✅ LinkedIn cookies collected and sent successfully');
                // Try to flush any queued items opportunistically
                flushCookieQueue();
              } else {
                console.debug('Cookie send response not confirmed. Retrying...');
                const delay = Math.min(8000, 800 * Math.pow(2, retryCount));
                setTimeout(() => sendCookiesWithRetry(retryCount + 1, maxRetries), delay);
              }
            }
          });
        } catch (e) {
          console.debug('Cookie send threw error:', String(e?.message || e));
          const delay = Math.min(8000, 800 * Math.pow(2, retryCount));
          setTimeout(() => sendCookiesWithRetry(retryCount + 1, maxRetries), delay);
        }
      }
      
      // Start the retry process (initialize port early for reliability)
      ensureCookiePort();
      sendCookiesWithRetry();
    } catch (error) {
      console.error('❌ Error collecting cookies:', error);
    }
  }
  
  // Check if domain is LinkedIn
  function isLinkedInDomain(hostname) {
    return hostname.includes('linkedin.com');
  }
  
  // Get current Chrome profile ID
  function getCurrentChromeProfile() {
    // This is a placeholder - in a real implementation, you would need to
    // communicate with the background script to get the actual profile ID
    // For now, we'll use a timestamp + random number as a unique identifier
    return `profile_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }
  
  // Detect LinkedIn account across multiple Chrome profiles
  function detectLinkedInAccount() {
    try {
      console.log('🔍 Checking for LinkedIn login status...');
      
      // Always attempt to extract profile info
      const accountInfo = {
        name: extractProfileName(),
        profileUrl: window.location.href,
        headline: extractProfileHeadline() || 'LinkedIn User',
        location: extractProfileLocation() || 'Unknown',
        profileImage: extractProfileImage() || '',
        timestamp: Date.now()
      };
      
      console.log('📝 Extracted account info:', accountInfo);
      
      // Send account info to background script with error handling
      try {
        safeSendMessage({
          type: 'LINKEDIN_ACCOUNT_DETECTED',
          accountInfo: accountInfo,
          url: window.location.href,
          timestamp: Date.now(),
          profileId: getCurrentChromeProfile() || 'default'
        }).then((res) => {
          if (!res || res.success !== true) {
            console.log('Communication error:', (res && res.error) || 'Unknown error');
            // Attempt to reconnect or handle the error
            setTimeout(detectLinkedInAccount, 5000); // Try again after 5 seconds
          } else {
            console.log('✅ accounts detected and reported successfully');
          }
        });
      } catch (commError) {
        console.error('❌ Failed to communicate with background script:', commError);
        // Retry after a delay
        setTimeout(detectLinkedInAccount, 3000);
      }
      
      console.log('✅ LinkedIn account detection attempt completed');
      
      // Schedule another detection attempt after a delay
      setTimeout(detectLinkedInAccount, 30000); // Try again every 30 seconds
    } catch (error) {
      console.error('❌ Error detecting LinkedIn account:', error);
      // Retry after a delay even if there was an error
      setTimeout(detectLinkedInAccount, 5000);
    }
  }
  
  // Extract profile name from LinkedIn page
  function extractProfileName() {
    try {
      for (const selector of CONFIG.SELECTORS.profileName.split(', ')) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      
      // Fallback to other potential selectors
      const nameElement = document.querySelector('.profile-rail-card__actor-link span');
      if (nameElement) {
        return nameElement.textContent.trim();
      }
      
      // If we still can't find it, check for the user's name in the nav bar
      const navNameElement = document.querySelector('.global-nav__me-photo');
      if (navNameElement && navNameElement.alt) {
        return navNameElement.alt.replace('Photo of ', '');
      }
      
      return 'LinkedIn User';
    } catch (error) {
      console.error('Error extracting profile name:', error);
      return 'LinkedIn User';
    }
  }
  
  // Extract profile headline from LinkedIn page
  function extractProfileHeadline() {
    try {
      for (const selector of CONFIG.SELECTORS.profileHeadline.split(', ')) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      return '';
    } catch (error) {
      console.error('Error extracting profile headline:', error);
      return '';
    }
  }
  
  // Extract profile location from LinkedIn page
  function extractProfileLocation() {
    try {
      for (const selector of CONFIG.SELECTORS.profileLocation.split(', ')) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      return '';
    } catch (error) {
      console.error('Error extracting profile location:', error);
      return '';
    }
  }
  
  // Extract profile image from LinkedIn page
  function extractProfileImage() {
    try {
      for (const selector of CONFIG.SELECTORS.profileImage.split(', ')) {
        const element = document.querySelector(selector);
        if (element && element.src) {
          return element.src;
        }
      }
      
      // Fallback to nav bar photo
      const navPhoto = document.querySelector('.global-nav__me-photo');
      if (navPhoto && navPhoto.src) {
        return navPhoto.src;
      }
      
      return '';
    } catch (error) {
      console.error('Error extracting profile image:', error);
      return '';
    }
  }
  // Initialize content script
  function initialize() {
    console.log('🚀 Initializing LinkedIn content script');
    
    // Listen for messages from background script with error handling
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        handleMessage(message, sender, sendResponse);
        return true; // Keep the message channel open for async responses
      } catch (error) {
        console.error('❌ Error handling message:', error);
        sendResponse({ error: error.message });
        return false;
      }
    });
    
    // Multiple detection attempts to ensure we capture the account
    const detectAttempts = [1000, 3000, 5000, 10000];
    detectAttempts.forEach(delay => {
      setTimeout(() => {
        console.log(`Attempting account detection after ${delay}ms`);
        detectLinkedInAccount();
      }, delay);
    });
    
    // Multiple cookie collection attempts
    const cookieAttempts = [1500, 4000, 8000];
    cookieAttempts.forEach(delay => {
      setTimeout(() => {
        console.log(`Collecting cookies after ${delay}ms`);
        collectAndSendCookies();
      }, delay);
    });
    
    // Notify background script that LinkedIn is ready with error handling
    try {
      safeSendMessage({
        type: 'LINKEDIN_READY',
        url: window.location.href,
        timestamp: Date.now()
      }).then((res) => {
        if (!res || res.success !== true) {
          console.log('Communication error:', (res && res.error) || 'Unknown error');
          setTimeout(() => {
            safeSendMessage({
              type: 'LINKEDIN_READY',
              url: window.location.href,
              timestamp: Date.now()
            });
          }, 3000);
        }
      });
    } catch (error) {
      console.error('❌ Failed to send ready message:', error);
    }
    
    // Set up periodic cookie collection
    setInterval(collectAndSendCookies, CONFIG.DELAYS.VERY_LONG); // Check periodically

    // Robust flush triggers: when tab gains focus, becomes visible, or network returns
    try {
      const tryFlush = () => { try { flushCookieQueue(); } catch (_) { /* ignore */ } };
      window.addEventListener('focus', tryFlush, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tryFlush();
      }, { passive: true });
      window.addEventListener('online', tryFlush, { passive: true });
    } catch (e) {
      // Non-fatal; environment may not support these events
      console.warn('⚠️ Flush triggers setup warning:', e && (e.message || e));
    }
  }
  
  // Check if user is logged in to LinkedIn
  function checkLinkedInLoginStatus() {
    // Check for LinkedIn-specific logged-in indicators
    const loginIndicators = [
      '.global-nav__me', // Me menu
      '.global-nav__primary-link-me-menu-trigger', // Me menu trigger
      '[data-control-name="nav.settings_and_privacy"]', // Settings link
      '.feed-identity-module', // Feed identity
      '.global-nav__me-photo', // Profile photo in nav
      '.ember-application' // LinkedIn app container when logged in
    ];
    
    return loginIndicators.some(selector => document.querySelector(selector) !== null);
  }
  
  // Extract LinkedIn account information
  function extractLinkedInAccountInfo() {
    const accountInfo = {
      isLoggedIn: true,
      profileUrl: null,
      name: null,
      headline: null,
      profileImage: null,
      email: null,
      detectedAt: new Date().toISOString()
    };
    
    try {
      // Try to get profile URL from navigation
      const meButton = document.querySelector('.global-nav__me, .global-nav__primary-link-me-menu-trigger');
      if (meButton) {
        const profileLink = meButton.querySelector('a') || meButton.closest('a');
        if (profileLink && profileLink.href) {
          accountInfo.profileUrl = profileLink.href;
        }
      }
      
      // Try to extract name from various locations
      const nameSelectors = [
        '.global-nav__me-photo img[alt]', // Nav photo alt text
        '.feed-identity-module__actor-meta h3', // Feed identity
        '.pv-text-details__left-panel h1', // Profile page
        '.text-heading-xlarge' // Profile page alternative
      ];
      
      for (const selector of nameSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          if (element.tagName === 'IMG') {
            accountInfo.name = element.alt;
          } else {
            accountInfo.name = element.textContent?.trim();
          }
          if (accountInfo.name) break;
        }
      }
      
      // Try to get profile image
      const imageSelectors = [
        '.global-nav__me-photo img', // Nav photo
        '.feed-identity-module__actor-meta img', // Feed identity
        '.pv-top-card-profile-picture__image' // Profile page
      ];
      
      for (const selector of imageSelectors) {
        const img = document.querySelector(selector);
        if (img && img.src) {
          accountInfo.profileImage = img.src;
          break;
        }
      }
      
      // Try to extract headline if on profile page
      const headlineElement = document.querySelector('.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium');
      if (headlineElement) {
        accountInfo.headline = headlineElement.textContent?.trim();
      }
      
    } catch (error) {
      console.error('Error extracting LinkedIn account info:', error);
    }
    
    return accountInfo;
  }
  
  // Get current Chrome profile identifier
  function getCurrentChromeProfile() {
    try {
      // Try to get stored profile ID first
      let profileId = localStorage.getItem('linkedInAutomationProfileId');
      
      // If no stored ID, generate a new one
      if (!profileId) {
        // Generate a unique identifier based on browser characteristics
        const userAgent = navigator.userAgent;
        const screenRes = `${screen.width}x${screen.height}`;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        profileId = 'profile_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
        
        // Store for future use
        try {
          localStorage.setItem('linkedInAutomationProfileId', profileId);
        } catch (e) {
          console.error('Failed to store profile ID in localStorage:', e);
        }
      }
      
      return profileId;
    } catch (error) {
      console.warn('Could not determine Chrome profile:', error);
      return 'profile_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
  }
  
  // Enhanced LinkedIn account detection across multiple profiles
  function detectLinkedInAccountAcrossProfiles() {
    try {
      const isLoggedIn = checkLinkedInLoginStatus();
      
      if (isLoggedIn) {
        const accountInfo = extractLinkedInAccountInfo();
        const profileId = getCurrentChromeProfile();
        
        // Enhanced account information with profile context
        const enhancedAccountInfo = {
          ...accountInfo,
          chromeProfileId: profileId,
          browserFingerprint: generateBrowserFingerprint(),
          sessionInfo: extractSessionInfo(),
          detectionMethod: 'content_script',
          multiProfileSupport: true
        };
        
        // Send to background script with profile context
        safeSendMessage({
          type: 'LINKEDIN_ACCOUNT_DETECTED',
          accountInfo: enhancedAccountInfo,
          url: window.location.href,
          timestamp: Date.now(),
          profileId: profileId,
          source: 'linkedin_content_script'
        }).then((res) => {
          if (!res || res.success !== true) {
            console.log('Communication error:', (res && res.error) || 'Unknown error');
          }
        });
        
        console.log('✅ LinkedIn account detected across profiles:', enhancedAccountInfo);
        return enhancedAccountInfo;
      } else {
        console.log('❌ No LinkedIn account detected - user not logged in');
        return null;
      }
    } catch (error) {
      console.error('❌ Error detecting LinkedIn account across profiles:', error);
      return null;
    }
  }
  
  // Generate browser fingerprint for profile identification
  function generateBrowserFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Browser fingerprint', 2, 2);
      
      return {
        canvasFingerprint: canvas.toDataURL().substring(0, 50),
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack
      };
    } catch (error) {
      return { error: 'Could not generate fingerprint' };
    }
  }
  
  // Extract session information
  function extractSessionInfo() {
    try {
      return {
        url: window.location.href,
        domain: window.location.hostname,
        path: window.location.pathname,
        timestamp: Date.now(),
        userAgent: navigator.userAgent.substring(0, 100), // Truncate for privacy
        referrer: document.referrer || 'direct',
        cookieCount: document.cookie.split(';').length
      };
    } catch (error) {
      return { error: 'Could not extract session info' };
    }
  }
  
  // Handle messages from background script
  function handleMessage(request, sender, sendResponse) {
    console.log('📨 LinkedIn content script received message:', request);
    
    const msgType = request.type || request.action;
    switch (msgType) {
      case 'NEW_JOB':
        handleNewJob(request.job);
        sendResponse({ success: true });
        break;
        
      case 'EXECUTE_JOB':
        executeJob(request.job).then(result => {
          sendResponse({ success: true, result });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        return true; // Keep message channel open for async response
        
      case 'GET_PROFILE_DATA':
        const profileData = extractProfileData();
        sendResponse({ success: true, data: profileData });
        break;
        
      case 'STOP_JOB':
        stopCurrentJob();
        sendResponse({ success: true });
        break;
      case 'getLoginStatus':
        try {
          const isLoggedIn = checkLinkedInLoginStatus();
          const userInfo = isLoggedIn ? extractLinkedInAccountInfo() : null;
          sendResponse({ isLoggedIn, user: userInfo, url: window.location.href });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      default:
        console.log('❓ Unknown message type:', msgType);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }
  
  // Handle new job assignment
  function handleNewJob(job) {
    console.log('📋 New job received:', job);
    currentJob = job;
    
    // Show notification to user
    showJobNotification(job);
    
    // Auto-execute if configured
    if (job.autoExecute) {
      setTimeout(() => {
        executeJob(job);
      }, CONFIG.DELAYS.MEDIUM);
    }
  }
  
  // Execute job based on type
  async function executeJob(job) {
    if (isExecutingJob) {
      throw new Error('Another job is already executing');
    }
    
    console.log('🚀 Executing job:', job);
    isExecutingJob = true;
    jobResults = [];
    
    try {
      let result;
      
      switch (job.type) {
        case 'connect':
          result = await executeConnectJob(job);
          break;
          
        case 'message':
          result = await executeMessageJob(job);
          break;
          
        case 'scrape_profile':
          result = await executeScrapeProfileJob(job);
          break;
          
        case 'search_and_connect':
          result = await executeSearchAndConnectJob(job);
          break;
          
        case 'bulk_connect':
          result = await executeBulkConnectJob(job);
          break;
          
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      
      // Report job completion (use safeSendMessage)
      safeSendMessage({
        type: 'JOB_COMPLETED',
        jobId: job.id,
        result: result
      }).then((res) => {
        if (!res || res.success !== true) {
          console.log('Communication error reporting job completion:', (res && res.error) || 'Unknown error');
        }
      });
      
      return result;
      
    } catch (error) {
      console.error('❌ Job execution failed:', error);
      
      // Report job failure (use safeSendMessage)
      safeSendMessage({
        type: 'JOB_FAILED',
        jobId: job.id,
        error: error.message
      }).then((res) => {
        if (!res || res.success !== true) {
          console.log('Communication error reporting job failure:', (res && res.error) || 'Unknown error');
        }
      });
      
      throw error;
    } finally {
      isExecutingJob = false;
      currentJob = null;
    }
  }
  
  // Execute connect job
  async function executeConnectJob(job) {
    const { profileUrl, message } = job.parameters;
    
    // Navigate to profile if not already there
    if (window.location.href !== profileUrl) {
      window.location.href = profileUrl;
      await waitForPageLoad();
    }
    
    // Extract profile data
    const profileData = extractProfileData();
    
    // Find and click connect button
    const connectButton = await waitForElement(CONFIG.SELECTORS.connectButton);
    if (!connectButton) {
      throw new Error('Connect button not found');
    }
    
    connectButton.click();
    await delay(CONFIG.DELAYS.MEDIUM);
    
    // Handle custom message if provided
    if (message) {
      const noteInput = document.querySelector(CONFIG.SELECTORS.noteInput);
      if (noteInput) {
        noteInput.value = message;
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(CONFIG.DELAYS.SHORT);
      }
    }
    
    // Click send button
    const sendButton = await waitForElement(CONFIG.SELECTORS.sendButton);
    if (sendButton) {
      sendButton.click();
      await delay(CONFIG.DELAYS.MEDIUM);
    }
    
    return {
      success: true,
      profileData,
      action: 'connect',
      message: message || null,
      timestamp: new Date().toISOString()
    };
  }
  
  // Execute message job
  async function executeMessageJob(job) {
    const { profileUrl, message } = job.parameters;
    
    // Navigate to profile if not already there
    if (window.location.href !== profileUrl) {
      window.location.href = profileUrl;
      await waitForPageLoad();
    }
    
    // Extract profile data
    const profileData = extractProfileData();
    
    // Find and click message button
    const messageButton = await waitForElement(CONFIG.SELECTORS.messageButton);
    if (!messageButton) {
      throw new Error('Message button not found');
    }
    
    messageButton.click();
    await delay(CONFIG.DELAYS.MEDIUM);
    
    // Wait for message input and send message
    const messageInput = await waitForElement(CONFIG.SELECTORS.messageInput);
    if (!messageInput) {
      throw new Error('Message input not found');
    }
    
    messageInput.textContent = message;
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(CONFIG.DELAYS.SHORT);
    
    // Find and click send button (in message context)
    const sendButton = document.querySelector('button[data-control-name="send_message"], .msg-form__send-button');
    if (sendButton) {
      sendButton.click();
      await delay(CONFIG.DELAYS.MEDIUM);
    }
    
    return {
      success: true,
      profileData,
      action: 'message',
      message,
      timestamp: new Date().toISOString()
    };
  }
  
  // Execute scrape profile job
  async function executeScrapeProfileJob(job) {
    const { profileUrl } = job.parameters;
    
    // Navigate to profile if not already there
    if (window.location.href !== profileUrl) {
      window.location.href = profileUrl;
      await waitForPageLoad();
    }
    
    // Extract comprehensive profile data
    const profileData = extractProfileData();
    const experienceData = extractExperienceData();
    const educationData = extractEducationData();
    const skillsData = extractSkillsData();
    
    return {
      success: true,
      profileData,
      experienceData,
      educationData,
      skillsData,
      scrapedAt: new Date().toISOString()
    };
  }
  
  // Execute search and connect job
  async function executeSearchAndConnectJob(job) {
    const { searchQuery, maxConnections, message } = job.parameters;
    const results = [];
    let connectionsCount = 0;
    
    // Navigate to search page
    const searchUrl = `https://www.linkedin.com/search/people/?keywords=${encodeURIComponent(searchQuery)}`;
    window.location.href = searchUrl;
    await waitForPageLoad();
    
    while (connectionsCount < maxConnections) {
      // Get search results on current page
      const searchResults = document.querySelectorAll(CONFIG.SELECTORS.searchResults);
      
      for (const result of searchResults) {
        if (connectionsCount >= maxConnections) break;
        
        try {
          // Extract profile info from search result
          const nameElement = result.querySelector(CONFIG.SELECTORS.searchResultName);
          const headlineElement = result.querySelector(CONFIG.SELECTORS.searchResultHeadline);
          
          if (!nameElement) continue;
          
          const profileData = {
            name: nameElement.textContent.trim(),
            headline: headlineElement ? headlineElement.textContent.trim() : '',
            profileUrl: nameElement.href
          };
          
          // Find connect button in search result
          const connectButton = result.querySelector(CONFIG.SELECTORS.connectButton);
          if (connectButton) {
            connectButton.click();
            await delay(CONFIG.DELAYS.MEDIUM);
            
            // Handle custom message if provided
            if (message) {
              const noteInput = document.querySelector(CONFIG.SELECTORS.noteInput);
              if (noteInput) {
                noteInput.value = message;
                noteInput.dispatchEvent(new Event('input', { bubbles: true }));
                await delay(CONFIG.DELAYS.SHORT);
              }
            }
            
            // Click send button
            const sendButton = document.querySelector(CONFIG.SELECTORS.sendButton);
            if (sendButton) {
              sendButton.click();
              await delay(CONFIG.DELAYS.MEDIUM);
              
              results.push({
                ...profileData,
                action: 'connect',
                success: true,
                timestamp: new Date().toISOString()
              });
              
              connectionsCount++;
            }
          }
          
        } catch (error) {
          console.error('Error processing search result:', error);
        }
      }
      
      // Go to next page if available and needed
      if (connectionsCount < maxConnections) {
        const nextButton = document.querySelector(CONFIG.SELECTORS.nextButton);
        if (nextButton && !nextButton.disabled) {
          nextButton.click();
          await waitForPageLoad();
        } else {
          break; // No more pages
        }
      }
    }
    
    return {
      success: true,
      results,
      totalConnections: connectionsCount,
      searchQuery,
      timestamp: new Date().toISOString()
    };
  }
  
  // Execute bulk connect job
  async function executeBulkConnectJob(job) {
    const { profileUrls, message } = job.parameters;
    const results = [];
    
    for (const profileUrl of profileUrls) {
      try {
        const result = await executeConnectJob({
          parameters: { profileUrl, message }
        });
        results.push(result);
        
        // Add delay between connections
        await delay(CONFIG.DELAYS.LONG);
        
      } catch (error) {
        results.push({
          success: false,
          profileUrl,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return {
      success: true,
      results,
      totalProcessed: profileUrls.length,
      successCount: results.filter(r => r.success).length,
      timestamp: new Date().toISOString()
    };
  }
  
  // Extract profile data from current page
  function extractProfileData() {
    const data = {
      name: null,
      headline: null,
      location: null,
      profileImage: null,
      url: window.location.href
    };
    
    // Extract name
    const nameElement = document.querySelector(CONFIG.SELECTORS.profileName);
    if (nameElement) {
      data.name = nameElement.textContent.trim();
    }
    
    // Extract headline
    const headlineElement = document.querySelector(CONFIG.SELECTORS.profileHeadline);
    if (headlineElement) {
      data.headline = headlineElement.textContent.trim();
    }
    
    // Extract location
    const locationElement = document.querySelector(CONFIG.SELECTORS.profileLocation);
    if (locationElement) {
      data.location = locationElement.textContent.trim();
    }
    
    // Extract profile image
    const imageElement = document.querySelector(CONFIG.SELECTORS.profileImage);
    if (imageElement) {
      data.profileImage = imageElement.src;
    }
    
    return data;
  }
  
  // Extract experience data
  function extractExperienceData() {
    const experiences = [];
    const experienceSection = document.querySelector('#experience');
    
    if (experienceSection) {
      const experienceItems = experienceSection.querySelectorAll('.pv-entity__position-group-pager li, .pvs-list__paged-list-item');
      
      experienceItems.forEach(item => {
        const titleElement = item.querySelector('.t-16.t-black.t-bold, .mr1.t-bold span');
        const companyElement = item.querySelector('.pv-entity__secondary-title, .t-14.t-black--light span');
        const durationElement = item.querySelector('.pv-entity__bullet-item-v2, .t-14.t-black--light.t-normal span');
        
        if (titleElement) {
          experiences.push({
            title: titleElement.textContent.trim(),
            company: companyElement ? companyElement.textContent.trim() : '',
            duration: durationElement ? durationElement.textContent.trim() : ''
          });
        }
      });
    }
    
    return experiences;
  }
  
  // Extract education data
  function extractEducationData() {
    const education = [];
    const educationSection = document.querySelector('#education');
    
    if (educationSection) {
      const educationItems = educationSection.querySelectorAll('.pv-entity__position-group-pager li, .pvs-list__paged-list-item');
      
      educationItems.forEach(item => {
        const schoolElement = item.querySelector('.pv-entity__school-name, .mr1.t-bold span');
        const degreeElement = item.querySelector('.pv-entity__degree-name, .t-14.t-black--light span');
        
        if (schoolElement) {
          education.push({
            school: schoolElement.textContent.trim(),
            degree: degreeElement ? degreeElement.textContent.trim() : ''
          });
        }
      });
    }
    
    return education;
  }
  
  // Extract skills data
  function extractSkillsData() {
    const skills = [];
    const skillsSection = document.querySelector('#skills');
    
    if (skillsSection) {
      const skillItems = skillsSection.querySelectorAll('.pv-skill-category-entity__name span, .pvs-list__paged-list-item span');
      
      skillItems.forEach(item => {
        const skillText = item.textContent.trim();
        if (skillText && !skills.includes(skillText)) {
          skills.push(skillText);
        }
      });
    }
    
    return skills;
  }
  
  // Utility functions
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // Timeout fallback
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }
  
  function waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      
      const checkReady = () => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      
      checkReady();
    });
  }
  
  function showJobNotification(job) {
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0077b5;
      color: white;
      padding: 15px;
      border-radius: 5px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    notification.innerHTML = `
      <strong>Scralytics Job</strong><br>
      ${job.type}: ${job.parameters?.searchQuery || job.parameters?.profileUrl || 'Processing...'}
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }
  
  function stopCurrentJob() {
    isExecutingJob = false;
    currentJob = null;
    console.log('🛑 Current job stopped');
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
})();