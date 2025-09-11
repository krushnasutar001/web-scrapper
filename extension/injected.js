/**
 * LinkedIn Automation Extension - Injected Script
 * Runs in the LinkedIn page context for advanced functionality
 */

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.linkedinAutomationInjected) {
    return;
  }
  window.linkedinAutomationInjected = true;
  
  console.log('🔗 LinkedIn Automation - Injected Script Loaded');
  
  // Enhanced user data extraction
  function extractEnhancedUserData() {
    try {
      const userData = {
        basic: extractBasicInfo(),
        profile: extractProfileInfo(),
        network: extractNetworkInfo(),
        activity: extractActivityInfo(),
        cookies: extractCookieInfo()
      };
      
      return userData;
    } catch (error) {
      console.error('❌ Error extracting enhanced user data:', error);
      return null;
    }
  }
  
  // Extract basic user information
  function extractBasicInfo() {
    const basic = {
      name: null,
      headline: null,
      location: null,
      profileUrl: null,
      profileImage: null,
      isVerified: false
    };
    
    // Name extraction
    const nameSelectors = [
      'h1.text-heading-xlarge',
      '.pv-text-details__left-panel h1',
      '.global-nav__me-text .t-16',
      '.feed-identity-module__actor-meta .feed-identity-module__actor-name'
    ];
    
    for (const selector of nameSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        basic.name = element.textContent.trim();
        break;
      }
    }
    
    // Headline extraction
    const headlineSelectors = [
      '.text-body-medium.break-words',
      '.pv-text-details__left-panel .text-body-medium',
      '.feed-identity-module__actor-meta .t-12'
    ];
    
    for (const selector of headlineSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        basic.headline = element.textContent.trim();
        break;
      }
    }
    
    // Location extraction
    const locationSelectors = [
      '.text-body-small.inline.t-black--light.break-words',
      '.pv-text-details__left-panel .text-body-small',
      '.profile-topcard__location-data'
    ];
    
    for (const selector of locationSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        basic.location = element.textContent.trim();
        break;
      }
    }
    
    // Profile URL
    basic.profileUrl = window.location.href.split('?')[0];
    
    // Profile image
    const imageSelectors = [
      '.pv-top-card-profile-picture__image',
      '.global-nav__me-photo img',
      '.feed-identity-module__actor-image img'
    ];
    
    for (const selector of imageSelectors) {
      const element = document.querySelector(selector);
      if (element && element.src) {
        basic.profileImage = element.src;
        break;
      }
    }
    
    // Verification status
    basic.isVerified = !!document.querySelector('.profile-topcard__verified-badge, .pv-member-badge');
    
    return basic;
  }
  
  // Extract profile information
  function extractProfileInfo() {
    const profile = {
      connections: null,
      followers: null,
      experience: [],
      education: [],
      skills: [],
      languages: []
    };
    
    // Connections count
    const connectionsElement = document.querySelector('.pv-top-card--list-bullet .t-black--light');
    if (connectionsElement) {
      const text = connectionsElement.textContent;
      const match = text.match(/(\d+[,\d]*)/); 
      if (match) {
        profile.connections = match[1].replace(/,/g, '');
      }
    }
    
    // Experience
    const experienceItems = document.querySelectorAll('.pv-entity__summary-info, .pvs-entity');
    experienceItems.forEach(item => {
      const title = item.querySelector('.t-16.t-black.t-bold, .mr1.t-bold span')?.textContent?.trim();
      const company = item.querySelector('.pv-entity__secondary-title, .t-14.t-normal span')?.textContent?.trim();
      const duration = item.querySelector('.pv-entity__bullet-item-v2, .pvs-entity__caption-wrapper')?.textContent?.trim();
      
      if (title) {
        profile.experience.push({ title, company, duration });
      }
    });
    
    // Skills
    const skillElements = document.querySelectorAll('.pv-skill-category-entity__name span, .pvs-entity__path');
    skillElements.forEach(skill => {
      const skillName = skill.textContent?.trim();
      if (skillName) {
        profile.skills.push(skillName);
      }
    });
    
    return profile;
  }
  
  // Extract network information
  function extractNetworkInfo() {
    const network = {
      mutualConnections: [],
      commonInterests: [],
      sharedExperience: []
    };
    
    // Mutual connections
    const mutualElements = document.querySelectorAll('.pv-shared-connections-module__content a');
    mutualElements.forEach(element => {
      const name = element.textContent?.trim();
      const url = element.href;
      if (name) {
        network.mutualConnections.push({ name, url });
      }
    });
    
    return network;
  }
  
  // Extract activity information
  function extractActivityInfo() {
    const activity = {
      recentPosts: [],
      recentActivity: [],
      engagementLevel: 'unknown'
    };
    
    // Recent posts
    const postElements = document.querySelectorAll('.feed-shared-update-v2, .occludable-update');
    postElements.forEach((post, index) => {
      if (index < 5) { // Limit to 5 recent posts
        const content = post.querySelector('.feed-shared-text')?.textContent?.trim();
        const timestamp = post.querySelector('.feed-shared-actor__sub-description')?.textContent?.trim();
        const likes = post.querySelector('.social-counts-reactions__count')?.textContent?.trim();
        
        if (content) {
          activity.recentPosts.push({ content: content.substring(0, 200), timestamp, likes });
        }
      }
    });
    
    return activity;
  }
  
  // Extract cookie information
  function extractCookieInfo() {
    const cookies = {
      hasSessionCookie: false,
      cookieCount: 0,
      importantCookies: []
    };
    
    try {
      const allCookies = document.cookie;
      cookies.cookieCount = allCookies.split(';').length;
      
      const importantCookieNames = ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'];
      
      importantCookieNames.forEach(name => {
        if (allCookies.includes(name)) {
          cookies.importantCookies.push(name);
          if (name === 'li_at') {
            cookies.hasSessionCookie = true;
          }
        }
      });
    } catch (error) {
      console.error('❌ Error extracting cookie info:', error);
    }
    
    return cookies;
  }
  
  // Monitor page changes
  function setupPageMonitoring() {
    let currentUrl = window.location.href;
    
    // Monitor URL changes
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log('🔄 LinkedIn page changed:', currentUrl);
        
        // Notify about page change
        window.postMessage({
          type: 'LINKEDIN_PAGE_CHANGED',
          url: currentUrl,
          timestamp: Date.now()
        }, '*');
        
        // Re-extract data after page change
        setTimeout(() => {
          const userData = extractEnhancedUserData();
          window.postMessage({
            type: 'LINKEDIN_USER_DATA_UPDATED',
            data: userData,
            timestamp: Date.now()
          }, '*');
        }, 2000);
      }
    });
    
    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Setup message listener for communication with content script
  function setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      switch (event.data.type) {
        case 'EXTRACT_USER_DATA':
          const userData = extractEnhancedUserData();
          window.postMessage({
            type: 'USER_DATA_EXTRACTED',
            data: userData,
            requestId: event.data.requestId
          }, '*');
          break;
          
        case 'CHECK_LOGIN_STATUS':
          const isLoggedIn = checkLoginStatus();
          window.postMessage({
            type: 'LOGIN_STATUS_CHECKED',
            isLoggedIn: isLoggedIn,
            requestId: event.data.requestId
          }, '*');
          break;
      }
    });
  }
  
  // Check login status
  function checkLoginStatus() {
    const loginIndicators = [
      '.global-nav__me',
      '.feed-identity-module',
      '.pv-top-card-profile-picture'
    ];
    
    return loginIndicators.some(selector => document.querySelector(selector));
  }
  
  // Auto-detect and extract data when page loads
  function autoExtractData() {
    setTimeout(() => {
      const userData = extractEnhancedUserData();
      if (userData && userData.basic.name) {
        console.log('✅ Auto-extracted LinkedIn data:', userData.basic.name);
        
        // Store in window for easy access
        window.linkedinUserData = userData;
        
        // Notify content script
        window.postMessage({
          type: 'LINKEDIN_DATA_READY',
          data: userData,
          timestamp: Date.now()
        }, '*');
      }
    }, 3000);
  }
  
  // Initialize injected script
  function initialize() {
    console.log('🚀 LinkedIn Automation - Injected Script Initializing...');
    
    setupMessageListener();
    setupPageMonitoring();
    autoExtractData();
    
    // Make functions available globally for debugging
    window.linkedinAutomation = {
      extractEnhancedUserData,
      extractBasicInfo,
      extractProfileInfo,
      extractNetworkInfo,
      extractActivityInfo,
      checkLoginStatus
    };
    
    console.log('✅ LinkedIn Automation - Injected Script Ready');
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
})();