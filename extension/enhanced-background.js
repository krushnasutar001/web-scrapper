/**
 * Enhanced LinkedIn Automation Extension - Background Script
 * Multi-account session cookie management with periodic refresh
 */

const API_BASE_URL = 'http://localhost:5000';
let authToken = null;
let isLoggedIn = false;
let cookieRefreshInterval = null;

// Integration configurations
const INTEGRATIONS = {
  linkedin: {
    domains: ['.linkedin.com'],
    cookieNames: ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'],
    baseUrl: 'https://www.linkedin.com'
  },
  salesnav: {
    domains: ['.linkedin.com'],
    cookieNames: ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc', 'sn_at'],
    baseUrl: 'https://www.linkedin.com/sales'
  },
  twitter: {
    domains: ['.twitter.com', '.x.com'],
    cookieNames: ['auth_token', 'ct0', 'twid'],
    baseUrl: 'https://twitter.com'
  }
};

// Extension installation and setup
chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 Enhanced LinkedIn Automation Extension installed');
  initializeExtension();
  setupPeriodicCookieRefresh();
});

// Initialize extension
async function initializeExtension() {
  try {
    // Load saved auth token
    const result = await chrome.storage.local.get(['authToken', 'userInfo', 'identities']);
    if (result.authToken) {
      authToken = result.authToken;
      isLoggedIn = true;
      console.log('✅ Auth token loaded from storage');
    }
    
    // Initialize identities storage if not exists
    if (!result.identities) {
      await chrome.storage.local.set({ identities: {} });
    }
  } catch (error) {
    console.error('❌ Error initializing extension:', error);
  }
}

// Setup periodic cookie refresh (every 2 hours)
function setupPeriodicCookieRefresh() {
  // Clear existing alarm
  chrome.alarms.clear('cookieRefresh');
  
  // Create new alarm for every 2 hours
  chrome.alarms.create('cookieRefresh', {
    delayInMinutes: 120, // 2 hours
    periodInMinutes: 120
  });
  
  console.log('⏰ Cookie refresh alarm set for every 2 hours');
}

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cookieRefresh') {
    console.log('🔄 Periodic cookie refresh triggered');
    refreshAllCookies();
  }
});

// Enhanced message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action, 'from:', sender.tab ? 'content script' : 'popup');
  
  let responseHandled = false;
  const safeResponse = (response) => {
    if (!responseHandled) {
      responseHandled = true;
      sendResponse(response);
    }
  };
  
  try {
    switch (request.action) {
      case 'login':
        handleLogin(request.credentials)
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'logout':
        handleLogout()
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'getAuthStatus':
        safeResponse({ isLoggedIn, authToken: !!authToken });
        break;
        
      case 'updateCookies':
        updateCookiesForIdentity(request.identityUid, request.integrationUid)
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'refreshAllCookies':
        refreshAllCookies()
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'getIdentities':
        getStoredIdentities()
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'createIdentity':
        createNewIdentity(request.name, request.integrations)
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      default:
        safeResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('❌ Error in message handler:', error);
    safeResponse({ success: false, error: error.message });
  }
});

// Authentication functions
async function handleLogin(credentials) {
  try {
    console.log('🔐 Attempting login...');
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    
    const data = await response.json();
    
    if (data.success) {
      authToken = data.token;
      isLoggedIn = true;
      
      await chrome.storage.local.set({
        authToken: authToken,
        userInfo: data.user
      });
      
      console.log('✅ Login successful');
      return { success: true, user: data.user };
    } else {
      throw new Error(data.message || 'Login failed');
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    throw error;
  }
}

async function handleLogout() {
  try {
    authToken = null;
    isLoggedIn = false;
    await chrome.storage.local.clear();
    console.log('✅ Logout successful');
    return { success: true };
  } catch (error) {
    console.error('❌ Logout error:', error);
    throw error;
  }
}

// Cookie management functions
async function updateCookiesForIdentity(identityUid, integrationUid) {
  try {
    if (!authToken) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    console.log(`🍪 Updating cookies for identity: ${identityUid}, integration: ${integrationUid}`);
    
    const integration = INTEGRATIONS[integrationUid];
    if (!integration) {
      throw new Error(`Unknown integration: ${integrationUid}`);
    }
    
    // Get cookies for all domains of this integration
    const allCookies = [];
    
    for (const domain of integration.domains) {
      const domainCookies = await chrome.cookies.getAll({ domain });
      
      // Filter by integration-specific cookie names or get all
      const filteredCookies = integration.cookieNames
        ? domainCookies.filter(cookie => integration.cookieNames.includes(cookie.name))
        : domainCookies;
      
      allCookies.push(...filteredCookies);
    }
    
    if (allCookies.length === 0) {
      throw new Error(`No cookies found for ${integrationUid}. Please login to the platform first.`);
    }
    
    // Format cookies for backend
    const cookieData = allCookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate
    }));
    
    // Upload to backend
    const response = await fetch(`${API_BASE_URL}/priv/identities/${identityUid}/integrations/${integrationUid}/cookies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ cookies: cookieData })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Update local storage
      const storage = await chrome.storage.local.get(['identities']);
      const identities = storage.identities || {};
      
      if (!identities[identityUid]) {
        identities[identityUid] = { integrations: {} };
      }
      
      identities[identityUid].integrations[integrationUid] = {
        lastUpdated: Date.now(),
        cookieCount: cookieData.length
      };
      
      await chrome.storage.local.set({ identities });
      
      console.log(`✅ Cookies updated successfully: ${cookieData.length} cookies`);
      return {
        success: true,
        cookieCount: cookieData.length,
        lastUpdated: Date.now()
      };
    } else {
      throw new Error(result.message || 'Failed to upload cookies');
    }
  } catch (error) {
    console.error('❌ Cookie update error:', error);
    throw error;
  }
}

// Refresh all cookies for all identities
async function refreshAllCookies() {
  try {
    console.log('🔄 Starting refresh of all cookies...');
    
    const storage = await chrome.storage.local.get(['identities']);
    const identities = storage.identities || {};
    
    const results = {
      successful: [],
      failed: [],
      total: 0
    };
    
    for (const [identityUid, identity] of Object.entries(identities)) {
      for (const integrationUid of Object.keys(identity.integrations || {})) {
        results.total++;
        
        try {
          await updateCookiesForIdentity(identityUid, integrationUid);
          results.successful.push({ identityUid, integrationUid });
        } catch (error) {
          console.error(`Failed to refresh cookies for ${identityUid}/${integrationUid}:`, error);
          results.failed.push({ identityUid, integrationUid, error: error.message });
        }
      }
    }
    
    console.log(`📊 Cookie refresh complete: ${results.successful.length}/${results.total} successful`);
    return {
      success: true,
      message: `Refreshed ${results.successful.length} of ${results.total} cookie sets`,
      results
    };
  } catch (error) {
    console.error('❌ Refresh all cookies error:', error);
    throw error;
  }
}

// Identity management
async function getStoredIdentities() {
  try {
    const storage = await chrome.storage.local.get(['identities']);
    return {
      success: true,
      identities: storage.identities || {}
    };
  } catch (error) {
    console.error('❌ Get identities error:', error);
    throw error;
  }
}

async function createNewIdentity(name, integrations = []) {
  try {
    const identityUid = `identity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const storage = await chrome.storage.local.get(['identities']);
    const identities = storage.identities || {};
    
    identities[identityUid] = {
      name,
      created: Date.now(),
      integrations: {}
    };
    
    // Initialize integrations
    for (const integrationUid of integrations) {
      identities[identityUid].integrations[integrationUid] = {
        lastUpdated: null,
        cookieCount: 0
      };
    }
    
    await chrome.storage.local.set({ identities });
    
    console.log(`✅ Created new identity: ${identityUid}`);
    return {
      success: true,
      identityUid,
      identity: identities[identityUid]
    };
  } catch (error) {
    console.error('❌ Create identity error:', error);
    throw error;
  }
}

// Tab monitoring for automatic cookie updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if tab matches any integration
    for (const [integrationUid, integration] of Object.entries(INTEGRATIONS)) {
      if (integration.domains.some(domain => tab.url.includes(domain.replace('.', '')))) {
        console.log(`🔗 ${integrationUid} page detected:`, tab.url);
        
        // Notify popup if open
        chrome.runtime.sendMessage({
          action: 'integrationPageDetected',
          integrationUid,
          tabId,
          url: tab.url
        }).catch(() => {
          // Popup might not be open, ignore error
        });
        break;
      }
    }
  }
});

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    updateCookiesForIdentity,
    refreshAllCookies,
    createNewIdentity,
    getStoredIdentities,
    INTEGRATIONS
  };
}