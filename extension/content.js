/**
 * LinkedIn Automation Extension - Content Script
 * Runs on LinkedIn pages to detect login status and assist with data collection
 */

(function() {
  'use strict';
  
  console.log('🔗 LinkedIn Automation Extension - Content Script Loaded');
  
  let isLinkedInLoggedIn = false;
  let currentUser = null;
  let observerActive = false;
  
  // Initialize content script
  function initialize() {
    checkLoginStatus();
    setupLoginDetection();
    setupMessageListener();
    injectHelperScript();
    
    // Notify background script that page is ready
    chrome.runtime.sendMessage({
      action: 'pageReady',
      url: window.location.href,
      isLoggedIn: isLinkedInLoggedIn,
      user: currentUser
    }).catch(() => {
      // Background script might not be ready
    });
  }
  
  // Check if user is logged in to LinkedIn
  function checkLoginStatus() {
    try {
      // Multiple ways to detect login status
      const loginIndicators = [
        '.global-nav__me',
        '.global-nav__me-photo',
        '[data-control-name="identity_welcome_message"]',
        '.feed-identity-module',
        '.profile-photo-edit__preview'
      ];
      
      for (const selector of loginIndicators) {
        if (document.querySelector(selector)) {
          isLinkedInLoggedIn = true;
          break;
        }
      }
      
      // Check for login forms (indicates not logged in)
      const loginForms = [
        '.login-form',
        '#login-submit',
        '.sign-in-form',
        '[data-litms-control-urn="login-submit"]'
      ];
      
      for (const selector of loginForms) {
        if (document.querySelector(selector)) {
          isLinkedInLoggedIn = false;
          break;
        }
      }
      
      // Extract user information if logged in
      if (isLinkedInLoggedIn) {
        currentUser = extractUserInfo();
        console.log('✅ LinkedIn user detected:', currentUser?.name || 'Unknown');
      } else {
        console.log('❌ User not logged in to LinkedIn');
      }
      
    } catch (error) {
      console.error('❌ Error checking login status:', error);
    }
  }
  
  // Extract user information from page
  function extractUserInfo() {
    try {
      const userInfo = {
        name: null,
        profileUrl: null,
        headline: null,
        location: null,
        profileImage: null
      };
      
      // Try to get name from various selectors
      const nameSelectors = [
        '.global-nav__me-photo + .global-nav__me-text .t-16',
        '.global-nav__me .global-nav__me-text',
        '.feed-identity-module__actor-meta .feed-identity-module__actor-name',
        'h1.text-heading-xlarge',
        '.profile-photo-edit__preview img[alt]'
      ];
      
      for (const selector of nameSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          userInfo.name = element.textContent?.trim() || element.alt?.trim();
          if (userInfo.name && userInfo.name !== 'LinkedIn') {
            break;
          }
        }
      }
      
      // Try to get profile URL
      const profileLink = document.querySelector('.global-nav__me a, .feed-identity-module__actor-meta a');
      if (profileLink) {
        userInfo.profileUrl = profileLink.href;
      }
      
      // Try to get headline
      const headlineElement = document.querySelector('.text-body-medium.break-words, .feed-identity-module__actor-meta .t-12');
      if (headlineElement) {
        userInfo.headline = headlineElement.textContent?.trim();
      }
      
      // Try to get profile image
      const profileImage = document.querySelector('.global-nav__me-photo img, .feed-identity-module__actor-image img');
      if (profileImage) {
        userInfo.profileImage = profileImage.src;
      }
      
      return userInfo;
    } catch (error) {
      console.error('❌ Error extracting user info:', error);
      return null;
    }
  }
  
  // Setup login detection using MutationObserver
  function setupLoginDetection() {
    if (observerActive) return;
    
    const observer = new MutationObserver((mutations) => {
      let shouldRecheck = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Check if login/logout related elements were added/removed
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);
          
          const relevantSelectors = [
            '.global-nav__me',
            '.login-form',
            '.sign-in-form',
            '.feed-identity-module'
          ];
          
          for (const node of [...addedNodes, ...removedNodes]) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              for (const selector of relevantSelectors) {
                if (node.matches && node.matches(selector) || 
                    node.querySelector && node.querySelector(selector)) {
                  shouldRecheck = true;
                  break;
                }
              }
            }
            if (shouldRecheck) break;
          }
        }
      });
      
      if (shouldRecheck) {
        setTimeout(() => {
          const wasLoggedIn = isLinkedInLoggedIn;
          checkLoginStatus();
          
          if (wasLoggedIn !== isLinkedInLoggedIn) {
            console.log('🔄 Login status changed:', isLinkedInLoggedIn ? 'Logged In' : 'Logged Out');
            
            // Notify background script
            chrome.runtime.sendMessage({
              action: 'loginStatusChanged',
              isLoggedIn: isLinkedInLoggedIn,
              user: currentUser
            }).catch(() => {});
          }
        }, 1000);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    observerActive = true;
    console.log('👀 Login detection observer started');
  }
  
  // Setup message listener for communication with background script
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('📨 Content script received message:', request.action);
      
      switch (request.action) {
        case 'getLoginStatus':
          sendResponse({
            isLoggedIn: isLinkedInLoggedIn,
            user: currentUser,
            url: window.location.href
          });
          break;
          
        case 'extractUserInfo':
          const userInfo = extractUserInfo();
          sendResponse({ success: true, user: userInfo });
          break;
          
        case 'checkCookies':
          checkCookieAvailability()
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;
          
        case 'showNotification':
          showInPageNotification(request.message, request.type || 'info');
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    });
  }
  
  // Check if cookies are available
  async function checkCookieAvailability() {
    try {
      // Check if we can access document.cookie
      const cookies = document.cookie;
      const hasLinkedInCookies = cookies.includes('li_at') || cookies.includes('JSESSIONID');
      
      return {
        success: true,
        hasCookies: hasLinkedInCookies,
        cookieCount: cookies.split(';').length,
        isLoggedIn: isLinkedInLoggedIn
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        hasCookies: false
      };
    }
  }
  
  // Show in-page notification
  function showInPageNotification(message, type = 'info') {
    try {
      // Remove existing notifications
      const existing = document.querySelectorAll('.linkedin-automation-notification');
      existing.forEach(el => el.remove());
      
      // Create notification element
      const notification = document.createElement('div');
      notification.className = `linkedin-automation-notification linkedin-automation-${type}`;
      notification.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          max-width: 300px;
          animation: slideIn 0.3s ease-out;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                    style="background: none; border: none; color: white; cursor: pointer; margin-left: auto; font-size: 16px;">×</button>
          </div>
        </div>
      `;
      
      // Add CSS animation
      if (!document.querySelector('#linkedin-automation-styles')) {
        const styles = document.createElement('style');
        styles.id = 'linkedin-automation-styles';
        styles.textContent = `
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `;
        document.head.appendChild(styles);
      }
      
      document.body.appendChild(notification);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 5000);
      
    } catch (error) {
      console.error('❌ Error showing notification:', error);
    }
  }
  
  // Inject helper script for advanced functionality
  function injectHelperScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('❌ Error injecting helper script:', error);
    }
  }
  
  // Handle page navigation
  let currentUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      console.log('🔄 Page navigation detected:', currentUrl);
      
      // Re-check login status after navigation
      setTimeout(() => {
        checkLoginStatus();
        
        // Notify background script
        chrome.runtime.sendMessage({
          action: 'pageNavigated',
          url: currentUrl,
          isLoggedIn: isLinkedInLoggedIn,
          user: currentUser
        }).catch(() => {});
      }, 2000);
    }
  });
  
  urlObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // Also initialize after a short delay to catch dynamic content
  setTimeout(initialize, 2000);
  
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkLoginStatus,
    extractUserInfo,
    checkCookieAvailability
  };
}