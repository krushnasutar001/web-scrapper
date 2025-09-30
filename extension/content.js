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
          
        case 'ping':
          sendResponse({ success: true, message: 'Content script is active' });
          break;
          
        case 'executeJob':
          executeJob(request.job)
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;
          
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
  
  // Execute job function
  async function executeJob(job) {
    try {
      console.log(`🔄 Executing job ${job.id}: ${job.type}`);
      
      // Ensure user is logged in
      if (!isLinkedInLoggedIn) {
        throw new Error('User not logged in to LinkedIn');
      }
      
      let results = {};
      
      switch (job.type) {
        case 'profile_scrape':
          results = await scrapeProfile(job.parameters);
          break;
          
        case 'connection_request':
          results = await sendConnectionRequest(job.parameters);
          break;
          
        case 'message_send':
          results = await sendMessage(job.parameters);
          break;
          
        case 'search_scrape':
          results = await scrapeSearch(job.parameters);
          break;
          
        case 'post_engagement':
          results = await engageWithPost(job.parameters);
          break;
          
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      
      return {
        success: true,
        data: {
          jobId: job.id,
          type: job.type,
          results: results,
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error(`❌ Error executing job ${job.id}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Profile scraping function
  async function scrapeProfile(parameters) {
    try {
      const profileUrl = parameters.profileUrl;
      
      // Navigate to profile if not already there
      if (!window.location.href.includes(profileUrl)) {
        window.location.href = profileUrl;
        await waitForPageLoad();
      }
      
      // Wait for profile to load
      await waitForElement('.pv-text-details__left-panel', 10000);
      
      const profile = {
        name: extractText('.text-heading-xlarge'),
        headline: extractText('.text-body-medium.break-words'),
        location: extractText('.text-body-small.inline.t-black--light.break-words'),
        about: extractText('.pv-about__text .inline-show-more-text__text'),
        experience: extractExperience(),
        education: extractEducation(),
        skills: extractSkills(),
        profileUrl: window.location.href,
        scrapedAt: new Date().toISOString()
      };
      
      return profile;
      
    } catch (error) {
      throw new Error(`Profile scraping failed: ${error.message}`);
    }
  }
  
  // Send connection request function
  async function sendConnectionRequest(parameters) {
    try {
      const { profileUrl, message } = parameters;
      
      // Navigate to profile
      if (!window.location.href.includes(profileUrl)) {
        window.location.href = profileUrl;
        await waitForPageLoad();
      }
      
      // Find and click connect button
      const connectButton = await waitForElement('button[aria-label*="Connect"], button[data-control-name="connect"]', 5000);
      connectButton.click();
      
      // Wait for modal
      await waitForElement('.send-invite', 3000);
      
      // Add note if provided
      if (message) {
        const addNoteButton = document.querySelector('button[aria-label="Add a note"]');
        if (addNoteButton) {
          addNoteButton.click();
          await sleep(500);
          
          const messageBox = document.querySelector('#custom-message');
          if (messageBox) {
            messageBox.value = message;
            messageBox.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
      
      // Send invitation
      const sendButton = document.querySelector('button[aria-label="Send invitation"], button[aria-label="Send now"]');
      if (sendButton && !sendButton.disabled) {
        sendButton.click();
        await sleep(2000);
        
        return {
          success: true,
          profileUrl: profileUrl,
          message: message || 'No message',
          sentAt: new Date().toISOString()
        };
      } else {
        throw new Error('Send button not available or disabled');
      }
      
    } catch (error) {
      throw new Error(`Connection request failed: ${error.message}`);
    }
  }
  
  // Helper functions
  function extractText(selector) {
    const element = document.querySelector(selector);
    return element ? element.textContent.trim() : '';
  }
  
  function extractExperience() {
    const experiences = [];
    const experienceItems = document.querySelectorAll('.pv-entity__summary-info');
    
    experienceItems.forEach(item => {
      const title = extractText('.pv-entity__summary-info h3');
      const company = extractText('.pv-entity__secondary-title');
      const duration = extractText('.pv-entity__bullet-item-v2');
      
      if (title) {
        experiences.push({ title, company, duration });
      }
    });
    
    return experiences;
  }
  
  function extractEducation() {
    const education = [];
    const educationItems = document.querySelectorAll('.pv-education-entity');
    
    educationItems.forEach(item => {
      const school = extractText('.pv-entity__school-name');
      const degree = extractText('.pv-entity__degree-name');
      const field = extractText('.pv-entity__fos');
      
      if (school) {
        education.push({ school, degree, field });
      }
    });
    
    return education;
  }
  
  function extractSkills() {
    const skills = [];
    const skillItems = document.querySelectorAll('.pv-skill-category-entity__name span');
    
    skillItems.forEach(item => {
      const skill = item.textContent.trim();
      if (skill) {
        skills.push(skill);
      }
    });
    
    return skills;
  }
  
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
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
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }
  
  function waitForPageLoad() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve, { once: true });
      }
    });
  }
  
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkLoginStatus,
    extractUserInfo,
    checkCookieAvailability
  };
}