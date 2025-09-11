/**
 * LinkedIn Automation Extension - Background Service Worker
 * Handles API communication, cookie management, and account validation
 */

const API_BASE_URL = 'http://localhost:5000';
let authToken = null;
let isLoggedIn = false;

// Extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LinkedIn Automation Extension installed');
  initializeExtension();
});

// Initialize extension
async function initializeExtension() {
  try {
    // Load saved auth token
    const result = await chrome.storage.local.get(['authToken', 'userInfo']);
    if (result.authToken) {
      authToken = result.authToken;
      isLoggedIn = true;
      console.log('✅ Auth token loaded from storage');
    }
  } catch (error) {
    console.error('❌ Error initializing extension:', error);
  }
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action, 'from:', sender.tab ? 'content script' : 'popup');
  
  // Ensure sendResponse is always called to prevent port closure
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
        return true; // Keep message channel open for async response
        
      case 'logout':
        handleLogout()
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'getAuthStatus':
        safeResponse({ isLoggedIn, authToken: !!authToken });
        break;
        
      case 'collectCookies':
        // Handle both popup and content script requests
        if (request.tabId) {
          // Request from popup with specific tab ID
          collectLinkedInCookies(request.tabId)
            .then(safeResponse)
            .catch(error => safeResponse({ success: false, error: error.message }));
        } else if (sender.tab && sender.tab.id) {
          // Request from content script
          collectLinkedInCookies(sender.tab.id)
            .then(safeResponse)
            .catch(error => safeResponse({ success: false, error: error.message }));
        } else {
          // Get current active tab
          chrome.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
              if (tabs[0] && tabs[0].url.includes('linkedin.com')) {
                return collectLinkedInCookies(tabs[0].id);
              } else {
                throw new Error('Please navigate to LinkedIn.com first');
              }
            })
            .then(safeResponse)
            .catch(error => safeResponse({ success: false, error: error.message }));
        }
        return true;
        
      case 'collectMultipleCookies':
        collectMultipleLinkedInCookies(request.accounts || [])
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'validateAccount':
        validateLinkedInAccount(request.cookies)
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'saveAccount':
        saveAccountToDatabase(request.accountData)
          .then(safeResponse)
          .catch(error => safeResponse({ success: false, error: error.message }));
        return true;
        
      case 'startScraping':
        startScrapingTask(request.accountId, request.taskType)
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

// Handle user login to backend
async function handleLogin(credentials) {
  try {
    console.log('🔐 Attempting login...');
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
    
    const data = await response.json();
    
    if (data.success) {
      authToken = data.token;
      isLoggedIn = true;
      
      // Save to storage
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

// Handle user logout
async function handleLogout() {
  try {
    authToken = null;
    isLoggedIn = false;
    
    // Clear storage
    await chrome.storage.local.clear();
    
    console.log('✅ Logout successful');
    return { success: true };
  } catch (error) {
    console.error('❌ Logout error:', error);
    throw error;
  }
}

// Collect LinkedIn cookies from current tab
async function collectLinkedInCookies(tabId) {
  try {
    console.log('🍪 Collecting LinkedIn cookies for tab:', tabId);
    
    // Verify tab exists and is accessible
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      throw new Error('Tab not found or not accessible');
    }
    
    if (!tab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to LinkedIn.com first');
    }
    
    // Get all LinkedIn cookies
    const cookies = await chrome.cookies.getAll({
      domain: '.linkedin.com'
    });
    
    // Filter important cookies
    const importantCookies = cookies.filter(cookie => 
      ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'].includes(cookie.name)
    );
    
    if (importantCookies.length === 0) {
      throw new Error('No LinkedIn cookies found. Please make sure you are logged in to LinkedIn.');
    }
    
    // Format cookies as string
    const cookieString = importantCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    console.log('✅ Cookies collected:', importantCookies.length);
    
    // Get account name from page
    const accountName = await getAccountNameFromTab(tabId);
    
    return {
      success: true,
      cookies: cookieString,
      accountName: accountName,
      cookieCount: importantCookies.length,
      tabId: tabId
    };
  } catch (error) {
    console.error('❌ Cookie collection error:', error);
    throw error;
  }
}

// Collect cookies from multiple LinkedIn accounts
async function collectMultipleLinkedInCookies(accounts) {
  try {
    console.log('🍪 Collecting cookies from multiple accounts:', accounts.length);
    
    const results = {
      successful: [],
      failed: [],
      total: accounts.length
    };
    
    for (const account of accounts) {
      try {
        console.log(`🔍 Processing account: ${account.name || 'Unknown'}`);
        
        // If account has tabId, use it; otherwise find LinkedIn tabs
        let tabId = account.tabId;
        
        if (!tabId) {
          // Find all LinkedIn tabs
          const linkedinTabs = await chrome.tabs.query({
            url: '*://*.linkedin.com/*'
          });
          
          if (linkedinTabs.length === 0) {
            throw new Error('No LinkedIn tabs found. Please open LinkedIn.com');
          }
          
          // Use the first LinkedIn tab
          tabId = linkedinTabs[0].id;
        }
        
        const result = await collectLinkedInCookies(tabId);
        
        results.successful.push({
          ...result,
          originalAccount: account
        });
        
        console.log(`✅ Successfully collected cookies for: ${result.accountName}`);
        
      } catch (error) {
        console.error(`❌ Failed to collect cookies for account:`, error);
        results.failed.push({
          account: account,
          error: error.message
        });
      }
    }
    
    console.log(`📊 Multiple cookie collection complete: ${results.successful.length} successful, ${results.failed.length} failed`);
    
    return {
      success: true,
      message: `Collected cookies from ${results.successful.length} of ${results.total} accounts`,
      data: results
    };
    
  } catch (error) {
    console.error('❌ Multiple cookie collection error:', error);
    throw error;
  }
}

// Get account name from LinkedIn page
async function getAccountNameFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: extractAccountName
    });
    
    return results[0]?.result || 'Unknown Account';
  } catch (error) {
    console.error('❌ Error getting account name:', error);
    return 'Unknown Account';
  }
}

// Function to inject into page to extract account name
function extractAccountName() {
  // Try multiple selectors to find account name
  const selectors = [
    '.global-nav__me-photo + .global-nav__me-text .t-16',
    '.global-nav__me .global-nav__me-text',
    '.feed-identity-module__actor-meta .feed-identity-module__actor-name',
    '.profile-photo-edit__preview img[alt]',
    'h1.text-heading-xlarge'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const name = element.textContent?.trim() || element.alt?.trim();
      if (name && name !== 'LinkedIn') {
        return name;
      }
    }
  }
  
  // Fallback: try to get from page title
  const title = document.title;
  if (title && !title.includes('LinkedIn')) {
    return title.split('|')[0].trim();
  }
  
  return 'LinkedIn User';
}

// Validate LinkedIn account with backend
async function validateLinkedInAccount(cookies) {
  try {
    if (!authToken) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    console.log('🔍 Validating LinkedIn account...');
    
    const response = await fetch(`${API_BASE_URL}/api/linkedin-accounts/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ cookies })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Account validation successful');
      return { success: true, isValid: data.isValid, message: data.message };
    } else {
      throw new Error(data.message || 'Validation failed');
    }
  } catch (error) {
    console.error('❌ Account validation error:', error);
    throw error;
  }
}

// Save account to backend database
async function saveAccountToDatabase(accountData) {
  try {
    if (!authToken) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    console.log('💾 Saving account to database...');
    
    const response = await fetch(`${API_BASE_URL}/api/extension/save-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ accountData })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Account saved successfully:', data.accountId);
      return { success: true, accountId: data.accountId };
    } else {
      throw new Error(data.message || 'Failed to save account');
    }
  } catch (error) {
    console.error('❌ Save account error:', error);
    throw error;
  }
}

// Start scraping task
async function startScrapingTask(accountId, taskType = 'profile_scraping') {
  try {
    if (!authToken) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    console.log('🚀 Starting scraping task...');
    
    const response = await fetch(`${API_BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        type: taskType,
        accountId: accountId,
        status: 'pending'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Scraping task started:', data.data.id);
      return { success: true, jobId: data.data.id, job: data.data };
    } else {
      throw new Error(data.message || 'Failed to start scraping task');
    }
  } catch (error) {
    console.error('❌ Start scraping error:', error);
    throw error;
  }
}

// Listen for tab updates to detect LinkedIn pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('linkedin.com')) {
    console.log('🔗 LinkedIn page detected:', tab.url);
    
    // Notify popup if it's open
    chrome.runtime.sendMessage({
      action: 'linkedinPageDetected',
      tabId: tabId,
      url: tab.url
    }).catch(() => {
      // Popup might not be open, ignore error
    });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.url?.includes('linkedin.com')) {
    // If on LinkedIn, collect cookies automatically
    collectLinkedInCookies(tab.id)
      .then(result => {
        console.log('✅ Auto-collected cookies:', result);
        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'LinkedIn Cookies Collected',
          message: `Collected cookies for ${result.accountName}`
        });
      })
      .catch(error => {
        console.error('❌ Auto-collection failed:', error);
      });
  }
});

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleLogin,
    handleLogout,
    collectLinkedInCookies,
    validateLinkedInAccount,
    saveAccountToDatabase,
    startScrapingTask
  };
}