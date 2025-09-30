/**
 * LinkedIn Automation Extension - Background Service Worker
 * Handles API communication, cookie management, and account validation
 */

// Global variables
let detectedAccounts = [];
const API_BASE_URL = 'http://localhost:5001';

// Load crypto utilities using importScripts
try {
  importScripts('crypto.js');
  console.log('✅ Crypto module loaded successfully');
} catch (err) {
  console.error('❌ Failed to load crypto module:', err);
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('📨 Message received:', message.type);
    
    switch (message.type) {
      case 'LINKEDIN_ACCOUNT_DETECTED':
        handleAccountDetection(message, sender);
        break;
      case 'LINKEDIN_COOKIES_COLLECTED':
        handleCookieCollection(message, sender);
        break;
      case 'LINKEDIN_READY':
        console.log('LinkedIn page ready:', sender.tab.url);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
  
  return true; // Keep the message channel open for async responses
});

// Handle LinkedIn account detection
async function handleAccountDetection(message, sender) {
  try {
    const { accountInfo, profileId } = message;
    console.log('LinkedIn account detected:', accountInfo);
    
    // Always update the account to ensure we have the latest data
    const existingIndex = detectedAccounts.findIndex(acc => 
      acc.profileUrl === accountInfo.profileUrl);
    
    if (existingIndex >= 0) {
      // Update existing account
      detectedAccounts[existingIndex] = {
        ...detectedAccounts[existingIndex],
        ...accountInfo,
        profileId,
        tabId: sender.tab.id,
        updatedAt: Date.now()
      };
      console.log('Updated existing LinkedIn account');
    } else {
      // Add new account
      detectedAccounts.push({
        ...accountInfo,
        profileId,
        tabId: sender.tab.id,
        detectedAt: Date.now()
      });
      console.log('New LinkedIn account added to detected accounts');
    }
    
    // Always send account to backend to ensure it's up to date
    await sendAccountToBackend(accountInfo, profileId);
    
    // Notify any open extension popups about the account update
    chrome.runtime.sendMessage({
      type: 'ACCOUNTS_UPDATED',
      accounts: detectedAccounts
    }).catch(err => console.log('No listeners for ACCOUNTS_UPDATED'));
  } catch (error) {
    console.error('Error handling account detection:', error);
  }
}

// Handle LinkedIn cookie collection
async function handleCookieCollection(message, sender) {
  try {
    const { cookies, profileId } = message;
    console.log('LinkedIn cookies collected for profile:', profileId);
    
    // Validate essential cookies
    if (!cookies.li_at || !cookies.JSESSIONID) {
      console.warn('Missing essential LinkedIn cookies');
      return;
    }
    
    // Find the account associated with this profile
    const accountIndex = detectedAccounts.findIndex(acc => acc.profileId === profileId);
    
    if (accountIndex >= 0) {
      // Update cookies for existing account
      detectedAccounts[accountIndex].cookies = cookies;
      detectedAccounts[accountIndex].cookiesUpdatedAt = Date.now();
      
      console.log('Cookies updated for existing account');
    } else {
      // Create a new account entry with cookies
      detectedAccounts.push({
        profileId,
        cookies,
        tabId: sender.tab.id,
        detectedAt: Date.now(),
        cookiesUpdatedAt: Date.now()
      });
      
      console.log('New account created from cookies');
    }
    
    // Send cookies to backend
    await sendCookiesToBackend(cookies, profileId);
  } catch (error) {
    console.error('Error handling cookie collection:', error);
  }
}

// Send account to backend
async function sendAccountToBackend(accountInfo, profileId) {
  try {
    console.log('Sending account to backend:', accountInfo);
    
    const response = await fetch(`${API_BASE_URL}/api/accounts/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        account: accountInfo,
        profileId
      })
    });
    
    if (!response.ok) {
      console.warn(`Backend response not OK: ${response.status}`);
      // Continue execution even if backend fails
      return null;
    }
    
    const data = await response.json();
    console.log('Account sent to backend successfully:', data);
    return data;
  } catch (error) {
    // Log error but don't throw to prevent breaking the extension
    console.error('Error sending account to backend:', error);
    return null;
  }
}

// Send cookies to backend
async function sendCookiesToBackend(cookies, profileId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/accounts/cookies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cookies,
        profileId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Cookies sent to backend successfully:', data);
    return data;
  } catch (error) {
    console.error('Error sending cookies to backend:', error);
    throw error;
  }
}

// Job Poller functionality (inline to avoid dynamic import issues)
class JobPoller {
  constructor() {
    this.isPolling = false;
    this.pollInterval = 30000; // 30 seconds
    this.alarmName = 'jobPoller';
  }

  async startPolling() {
    if (this.isPolling) {
      console.log('📊 Job polling already active');
      return;
    }

    console.log('🚀 Starting job polling service');
    this.isPolling = true;

    chrome.alarms.create(this.alarmName, {
      delayInMinutes: 0.5,
      periodInMinutes: 0.5
    });

    this.pollForJobs().catch(error => {
      console.error('❌ Error during initial job polling:', error);
    });
  }

  stopPolling() {
    console.log('⏹️ Stopping job polling service');
    this.isPolling = false;
    chrome.alarms.clear(this.alarmName);
  }

  async pollForJobs() {
    try {
      const authToken = await this.getAuthToken();
      if (!authToken) {
        console.log('⚠️ No auth token available, skipping job poll');
        return;
      }

      console.log('🔍 Polling for assigned jobs...');

      const response = await fetch(`${API_BASE_URL}/api/extension/jobs/assigned`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.jobs && data.jobs.length > 0) {
        console.log(`📋 Found ${data.jobs.length} assigned jobs`);
        
        for (const job of data.jobs) {
          await this.processJob(job);
        }
      } else {
        console.log('📭 No jobs assigned');
      }

    } catch (error) {
      console.error('❌ Error polling for jobs:', error);
    }
  }

  async processJob(job) {
    try {
      console.log(`🔄 Processing job ${job.id}: ${job.type}`);
      const result = await this.executeJob(job);

      if (result.success) {
        await this.completeJob(job.id, result.data);
      } else {
        await this.failJob(job.id, result.error);
      }

    } catch (error) {
      console.error(`❌ Error processing job ${job.id}:`, error);
      await this.failJob(job.id, error.message);
    }
  }

  async executeJob(job) {
    try {
      const tabId = await this.getLinkedInTab();
      await this.ensureContentScript(tabId);

  // Use a safe sendMessage helper that retries after injecting the content script
  const response = await sendMessageToTab(tabId, { action: 'executeJob', job }, { retries: 3, wait: 1000 });

      return response;

    } catch (error) {
      console.error('❌ Error executing job:', error);
      return { success: false, error: error.message };
    }
  }

  async completeJob(jobId, results) {
    try {
      const authToken = await this.getAuthToken();
      
      const response = await fetch(`${API_BASE_URL}/api/extension/jobs/${jobId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ results })
      });

      if (response.ok) {
        console.log(`✅ Job ${jobId} completed successfully`);
      } else {
        console.error(`❌ Failed to complete job ${jobId}`);
      }

    } catch (error) {
      console.error(`❌ Error completing job ${jobId}:`, error);
    }
  }

  async failJob(jobId, errorMessage) {
    try {
      const authToken = await this.getAuthToken();
      
      const response = await fetch(`${API_BASE_URL}/api/extension/jobs/${jobId}/fail`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: errorMessage })
      });

      if (response.ok) {
        console.log(`❌ Job ${jobId} marked as failed`);
      } else {
        console.error(`❌ Failed to mark job ${jobId} as failed`);
      }

    } catch (error) {
      console.error(`❌ Error failing job ${jobId}:`, error);
    }
  }

  async getLinkedInTab() {
    const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
    
    if (tabs.length > 0) {
      return tabs[0].id;
    }

    const tab = await chrome.tabs.create({
      url: 'https://www.linkedin.com',
      active: false
    });

    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    return tab.id;
  }

  async ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content_linkedin.js']
      });
    }
  }

  async getAuthToken() {
    const result = await chrome.storage.local.get(['authToken']);
    return result.authToken;
  }
}

// Create global instance
const jobPoller = new JobPoller();

// Global variables for authentication
let authToken = null;
let isLoggedIn = false;
let detectedLinkedInAccounts = new Map(); // Store detected accounts by profile ID
let managedAccounts = new Map(); // Store managed accounts with full details
let accountSyncInterval = null;

// Enhanced Authentication Functions with proper error handling
async function handleGetAuthStatus() {
  try {
    console.log('🔐 Checking authentication status...');
    
    // Check if we have a stored token
    const stored = await chrome.storage.local.get(['authToken', 'userInfo', 'isLoggedIn']);
    
    if (stored.authToken && stored.isLoggedIn) {
      // Verify token with backend
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${stored.authToken}`,
            'Content-Type': 'application/json',
            'X-Extension-Version': chrome.runtime.getManifest().version
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Update global state
          authToken = stored.authToken;
          isLoggedIn = true;
          
          console.log('✅ Authentication verified');
          return {
            success: true,
            isLoggedIn: true,
            userInfo: data.user || stored.userInfo,
            token: stored.authToken
          };
        } else {
          // Token is invalid, clear it
          console.warn('⚠️ Token verification failed, clearing auth state');
          await clearAuthState();
          return { success: true, isLoggedIn: false };
        }
      } catch (error) {
        console.error('❌ Token verification error:', error);
        // Network error, assume token is still valid
        authToken = stored.authToken;
        isLoggedIn = true;
        
        return {
          success: true,
          isLoggedIn: true,
          userInfo: stored.userInfo,
          token: stored.authToken,
          warning: 'Could not verify token with server'
        };
      }
    } else {
      console.log('📭 No authentication found');
      return { success: true, isLoggedIn: false };
    }
  } catch (error) {
    console.error('❌ Auth status check failed:', error);
    return { success: false, error: error.message };
  }
}

async function clearAuthState() {
  try {
    // Clear global variables
    authToken = null;
    isLoggedIn = false;
    
    // Clear storage
    await chrome.storage.local.remove(['authToken', 'userInfo', 'isLoggedIn', 'loginTime']);
    
    // Clear managed accounts
    managedAccounts.clear();
    
    console.log('🧹 Auth state cleared');
  } catch (error) {
    console.error('❌ Failed to clear auth state:', error);
  }
}

async function handleLogin(credentials) {
  try {
    console.log('🔑 Attempting login...');
    
    if (!credentials || !credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version,
        'X-Client-Type': 'extension'
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        source: 'extension'
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Login failed:', data.message || response.statusText);
      throw new Error(data.message || `Login failed: ${response.status}`);
    }
    
    if (!data.success || !data.token) {
      throw new Error(data.message || 'Invalid login response');
    }
    
    // Store authentication data
    authToken = data.token;
    isLoggedIn = true;
    
    const authData = {
      authToken: data.token,
      userInfo: data.user,
      isLoggedIn: true,
      loginTime: Date.now()
    };
    
    await chrome.storage.local.set(authData);
    
    // Start job polling
    if (jobPoller && !jobPoller.isPolling) {
      jobPoller.startPolling();
    }
    
    console.log('✅ Login successful');
    
    return {
      success: true,
      message: 'Login successful',
      userInfo: data.user,
      token: data.token
    };
    
  } catch (error) {
    console.error('❌ Login error:', error);
    
    // Clear any partial auth state
    await clearAuthState();
    
    return {
      success: false,
      error: error.message || 'Login failed'
    };
  }
}

async function handleLogout() {
  try {
    console.log('🚪 Logging out...');
    
    // Stop job polling
    if (jobPoller && jobPoller.isPolling) {
      jobPoller.stopPolling();
    }
    
    // Notify backend if we have a token
    if (authToken) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.warn('⚠️ Backend logout notification failed:', error.message);
      }
    }
    
    // Clear all auth state
    await clearAuthState();
    
    console.log('✅ Logout successful');
    
    return {
      success: true,
      message: 'Logged out successfully'
    };
    
  } catch (error) {
    console.error('❌ Logout error:', error);
    
    // Force clear auth state even if there's an error
    await clearAuthState();
    
    return {
      success: false,
      error: error.message || 'Logout failed'
    };
  }
}
// Enhanced LinkedIn tab detection and automatic refresh
async function detectAndRefreshLinkedInAccounts() {
  try {
    console.log('🔍 Starting LinkedIn account detection and refresh...');
    
    // Find all LinkedIn tabs
    const linkedinTabs = await chrome.tabs.query({
      url: '*://*.linkedin.com/*'
    });
    
    if (linkedinTabs.length === 0) {
      console.log('📭 No LinkedIn tabs found');
      return { success: true, message: 'No LinkedIn tabs found', tabCount: 0 };
    }
    
    console.log(`🔗 Found ${linkedinTabs.length} LinkedIn tabs`);
    
    const results = {
      successful: [],
      failed: [],
      total: linkedinTabs.length
    };
    
    // Process each LinkedIn tab
    for (const tab of linkedinTabs) {
      try {
        console.log(`🔄 Processing LinkedIn tab: ${tab.id} - ${tab.url}`);
        
        // Inject content script if not already present
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content_linkedin.js']
          });
          console.log(`✅ Content script injected into tab ${tab.id}`);
        } catch (scriptError) {
          console.warn(`⚠️ Content script injection failed for tab ${tab.id}:`, scriptError.message);
        }
        
        // Collect cookies from this tab
        try {
          const cookieResult = await collectLinkedInCookies(tab.id);
          
          if (cookieResult.success) {
            results.successful.push({
              tabId: tab.id,
              url: tab.url,
              accountName: cookieResult.accountName,
              cookieCount: cookieResult.cookieCount,
              isEncrypted: cookieResult.isEncrypted,
              timestamp: Date.now()
            });
            
            console.log(`✅ Successfully processed tab ${tab.id}: ${cookieResult.accountName}`);
            
            // Auto-sync with backend if authenticated
            if (authToken && isLoggedIn) {
              try {
                await syncCookiesWithBackend(cookieResult);
                console.log(`🔄 Auto-synced cookies for ${cookieResult.accountName}`);
              } catch (syncError) {
                console.warn(`⚠️ Auto-sync failed for ${cookieResult.accountName}:`, syncError.message);
              }
            }
          }
          
        } catch (cookieError) {
          console.error(`❌ Cookie collection failed for tab ${tab.id}:`, cookieError.message);
          results.failed.push({
            tabId: tab.id,
            url: tab.url,
            error: cookieError.message
          });
        }
        
      } catch (tabError) {
        console.error(`❌ Tab processing failed for ${tab.id}:`, tabError.message);
        results.failed.push({
          tabId: tab.id,
          url: tab.url,
          error: tabError.message
        });
      }
    }
    
    // Update detected accounts storage
    await chrome.storage.local.set({
      detectedAccounts: Object.fromEntries(detectedLinkedInAccounts),
      lastAccountDetection: Date.now(),
      detectionResults: results
    });
    
    console.log(`📊 LinkedIn detection complete: ${results.successful.length} successful, ${results.failed.length} failed`);
    
    // Notify popup about updated accounts
    try {
      await chrome.runtime.sendMessage({
        action: 'accountsUpdated',
        accounts: results.successful,
        totalDetected: results.successful.length,
        timestamp: Date.now()
      });
    } catch (error) {
      console.log('📱 Popup not open for account update notification');
    }
    
    return {
      success: true,
      message: `Detected ${results.successful.length} LinkedIn accounts`,
      results: results
    };
    
  } catch (error) {
    console.error('❌ LinkedIn detection and refresh failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Sync cookies with backend
async function syncCookiesWithBackend(cookieData) {
  try {
    if (!authToken || !isLoggedIn) {
      throw new Error('Not authenticated with backend');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version
      },
      body: JSON.stringify({
        accountName: cookieData.accountName,
        cookies: cookieData.cookies,
        isEncrypted: cookieData.isEncrypted,
        domain: cookieData.domain,
        timestamp: cookieData.timestamp,
        source: 'extension_auto_sync'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Backend sync failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Cookies synced with backend:', result);
    
    return result;
    
  } catch (error) {
    console.error('❌ Backend sync error:', error);
    throw error;
  }
}

// Auto-refresh LinkedIn accounts periodically
function startAutoRefresh() {
  // Clear any existing interval
  if (window.linkedinRefreshInterval) {
    clearInterval(window.linkedinRefreshInterval);
  }
  
  // Start new interval (every 5 minutes)
  window.linkedinRefreshInterval = setInterval(async () => {
    if (chrome.runtime?.id && isLoggedIn) {
      console.log('🔄 Auto-refreshing LinkedIn accounts...');
      await detectAndRefreshLinkedInAccounts();
    }
  }, 5 * 60 * 1000);
  
  console.log('⏰ Auto-refresh started (5 minute intervals)');
}

// Stop auto-refresh
function stopAutoRefresh() {
  if (window.linkedinRefreshInterval) {
    clearInterval(window.linkedinRefreshInterval);
    window.linkedinRefreshInterval = null;
    console.log('⏹️ Auto-refresh stopped');
  }
}

// Handle account management functions
async function handleGetAccounts() {
  try {
    console.log('📋 Getting managed accounts...');
    
    // Get from local storage first
    const stored = await chrome.storage.local.get(['managedAccounts', 'detectedAccounts']);
    
    const accounts = [];
    
    // Add managed accounts
    if (stored.managedAccounts) {
      Object.entries(stored.managedAccounts).forEach(([key, account]) => {
        accounts.push({
          ...account,
          isManaged: true,
          source: 'managed'
        });
      });
    }
    
    // Add detected accounts
    if (stored.detectedAccounts) {
      Object.entries(stored.detectedAccounts).forEach(([key, account]) => {
        if (!accounts.find(a => a.accountName === account.accountName)) {
          accounts.push({
            ...account,
            isManaged: false,
            source: 'detected'
          });
        }
      });
    }
    
    // If authenticated, also fetch from backend
    if (authToken && isLoggedIn) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const backendData = await response.json();
          if (backendData.success && backendData.accounts) {
            // Merge backend accounts
            backendData.accounts.forEach(backendAccount => {
              const existingIndex = accounts.findIndex(a => a.accountName === backendAccount.accountName);
              if (existingIndex >= 0) {
                // Update existing account with backend data
                accounts[existingIndex] = {
                  ...accounts[existingIndex],
                  ...backendAccount,
                  isManaged: true,
                  source: 'backend'
                };
              } else {
                // Add new backend account
                accounts.push({
                  ...backendAccount,
                  isManaged: true,
                  source: 'backend'
                });
              }
            });
          }
        }
      } catch (backendError) {
        console.warn('⚠️ Failed to fetch accounts from backend:', backendError.message);
      }
    }
    
    console.log(`✅ Retrieved ${accounts.length} accounts`);
    
    return {
      success: true,
      accounts: accounts,
      totalCount: accounts.length,
      managedCount: accounts.filter(a => a.isManaged).length,
      detectedCount: accounts.filter(a => !a.isManaged).length
    };
    
  } catch (error) {
    console.error('❌ Get accounts error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function handleSyncAccounts() {
  try {
    console.log('🔄 Syncing accounts...');
    
    // First, detect current LinkedIn accounts
    const detectionResult = await detectAndRefreshLinkedInAccounts();
    
    if (!detectionResult.success) {
      throw new Error(detectionResult.error || 'Account detection failed');
    }
    
    return {
      success: true,
      message: 'Accounts synced successfully',
      detectedCount: detectionResult.results?.successful?.length || 0,
      failedCount: detectionResult.results?.failed?.length || 0
    };
    
  } catch (error) {
    console.error('❌ Sync accounts error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
  try {
    const result = await chrome.storage.local.get(['authToken', 'userInfo']);
    if (result.authToken) {
      authToken = result.authToken;
      isLoggedIn = true;
      console.log('✅ Auth token found in storage');
      return true;
    }
    console.log('⚠️ No auth token in storage');
    return false;
  } catch (e) {
    console.error('❌ Auth check failed:', e);
    return false;
  }
}

// Extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LinkedIn Automation Extension installed');
  initializeExtension().catch(error => {
    console.error('❌ Error during extension initialization:', error);
  });
});

// Initialize extension on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Extension startup');
  await initializeExtension();
});

// Initialize extension
async function initializeExtension() {
  try {
    // First try to get auth token from Scralytics domain cookies
    await checkScralyticsAuth();
    
    // Load saved auth state as fallback
    const result = await chrome.storage.local.get(['authToken', 'userInfo', 'managedAccounts']);
    if (result.authToken && !authToken) {
      authToken = result.authToken;
      isLoggedIn = true;
      console.log('✅ Restored authentication state from storage');
      
      // Restore managed accounts
      if (result.managedAccounts) {
        managedAccounts = new Map(Object.entries(result.managedAccounts));
        console.log(`✅ Restored ${managedAccounts.size} managed accounts`);
      }
      
      // Start job polling if authenticated and jobPoller is available
      if (jobPoller && typeof jobPoller.startPolling === 'function') {
        jobPoller.startPolling();
      }
      
      // Start account sync
      startAccountSync();
    }
  } catch (error) {
    console.error('❌ Error initializing extension:', error);
  }
}

// Message listener to avoid "Receiving end does not exist" errors
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    const type = request?.type || request?.action;
    if (!type) {
      sendResponse({ ok: false, error: 'Invalid message' });
      return true;
    }

    if (type === 'PING') {
      sendResponse({ ok: true, message: 'Background is alive' });
      return true;
    }

    if (type === 'START_POLLING') {
      if (jobPoller && typeof jobPoller.startPolling === 'function') {
        jobPoller.startPolling();
        sendResponse({ started: true });
      } else {
        sendResponse({ started: false, error: 'JobPoller unavailable' });
      }
      return true;
    }

    if (type === 'STOP_POLLING') {
      if (jobPoller && typeof jobPoller.stopPolling === 'function') {
        jobPoller.stopPolling();
        sendResponse({ stopped: true });
      } else {
        sendResponse({ stopped: false, error: 'JobPoller unavailable' });
      }
      return true;
    }

    if (type === 'CHECK_BACKEND') {
      fetch(`${API_BASE_URL}/health`).then(r => {
        sendResponse({ ok: r.ok });
      }).catch(() => {
        sendResponse({ ok: false });
      });
      return true; // async response
    }

    if (type === 'LOGIN') {
      handleLogin(request.credentials)
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'LOGOUT') {
      handleLogout()
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'VALIDATE_ACCOUNT') {
      validateLinkedInAccount(request.cookies)
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'SAVE_ACCOUNT') {
      saveAccountToDatabase(request.accountData)
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'START_SCRAPING') {
      startScrapingTask(request.accountId, request.taskType)
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'COLLECT_COOKIES') {
      const targetTabId = request.tabId;
      collectLinkedInCookies(targetTabId)
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'COLLECT_COOKIES_MULTIPLE') {
      collectMultipleLinkedInCookies(request.accounts || [])
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'LINKEDIN_ACCOUNT_DETECTED' || type === 'accountDetected') {
      handleLinkedInAccountDetected(request)
        .then(res => sendResponse({ ok: true, data: res }))
        .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }

    // Handle popup.js message types
    if (type === 'getAuthStatus') {
      getAuthStatus()
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'getAccounts') {
      getAccounts()
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'addAccount') {
      addAccount(request.account)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'updateAccount') {
      updateAccount(request.accountId, request.updates)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'deleteAccount') {
      deleteAccount(request.accountId)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'validateAccount') {
      validateLinkedInAccount(request.cookies)
        .then(res => sendResponse({ success: true, data: res }))
        .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
      return true;
    }

    if (type === 'getLoginStatus') {
      // Forward to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getLoginStatus' })
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
        } else {
          sendResponse({ success: false, error: 'No active tab found' });
        }
      });
      return true;
    }

    // Unknown message type
    sendResponse({ ok: false, error: 'Unknown message type' });
    return true;
  } catch (e) {
    console.error('onMessage handler error:', e);
    sendResponse({ ok: false, error: String(e) });
    return true;
  }
});

// Handle LinkedIn account detection from content script with enhanced multi-profile support
async function handleLinkedInAccountDetected(request) {
  try {
    const { accountInfo, profileId, url, timestamp, source } = request;
    
    console.log('🔍 Enhanced LinkedIn account detected:', {
      name: accountInfo.name,
      profileUrl: accountInfo.profileUrl,
      profileId: profileId,
      chromeProfileId: accountInfo.chromeProfileId,
      multiProfileSupport: accountInfo.multiProfileSupport,
      detectionMethod: accountInfo.detectionMethod,
      url: url,
      source: source
    });
    
    // Create enhanced account key for better profile separation
    const accountKey = generateAccountKey(accountInfo, profileId);
    
    // Store the detected account with enhanced information
    const enhancedAccountData = {
      ...accountInfo,
      profileId,
      detectedUrl: url,
      lastDetected: timestamp,
      chromeProfileId: accountInfo.chromeProfileId || profileId,
      browserFingerprint: accountInfo.browserFingerprint,
      sessionInfo: accountInfo.sessionInfo,
      detectionSource: source || 'content_script',
      multiProfileCapable: true,
      accountKey: accountKey
    };
    
    detectedLinkedInAccounts.set(accountKey, enhancedAccountData);
    
    // Store in Chrome storage for persistence across sessions
    await storeDetectedAccountsPersistently();
    
    // If authenticated, sync with backend with enhanced profile context
    if (authToken && isLoggedIn) {
      try {
        await syncDetectedAccountWithBackendEnhanced(enhancedAccountData);
      } catch (error) {
        console.warn('⚠️ Failed to sync enhanced account with backend:', error.message);
      }
    }
    
    // Notify popup with enhanced account information
    chrome.runtime.sendMessage({
      action: 'accountDetected',
      accountInfo: enhancedAccountData,
      profileId: profileId,
      accountKey: accountKey,
      totalAccounts: detectedLinkedInAccounts.size,
      profilesDetected: getUniqueProfilesCount()
    }).catch(() => {
      // Popup might not be open, ignore error
    });
    
    console.log(`✅ Account stored with key: ${accountKey}. Total accounts: ${detectedLinkedInAccounts.size}`);
    
    return { 
      success: true, 
      message: 'Enhanced account detected and stored',
      accountsCount: detectedLinkedInAccounts.size,
      profilesCount: getUniqueProfilesCount(),
      accountKey: accountKey
    };
  } catch (error) {
    console.error('❌ Error handling enhanced LinkedIn account detection:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Generate unique account key for multi-profile support
function generateAccountKey(accountInfo, profileId) {
  const profileUrl = accountInfo.profileUrl || 'unknown';
  const chromeProfileId = accountInfo.chromeProfileId || profileId || 'default';
  const name = accountInfo.name || 'unnamed';
  
  // Create a more robust key that includes multiple identifiers
  const keyComponents = [
    chromeProfileId,
    profileUrl.split('/').pop() || 'unknown', // LinkedIn profile ID from URL
    name.replace(/\s+/g, '_').toLowerCase()
  ];
  
  return keyComponents.join('_');
}

// Store detected accounts persistently
async function storeDetectedAccountsPersistently() {
  try {
    const accountsObject = Object.fromEntries(detectedLinkedInAccounts);
    await chrome.storage.local.set({ 
      detectedLinkedInAccounts: accountsObject,
      lastAccountSync: Date.now()
    });
    console.log(`💾 Stored ${detectedLinkedInAccounts.size} detected accounts persistently`);
  } catch (error) {
    console.error('❌ Error storing detected accounts:', error);
  }
}

// Load detected accounts from storage
async function loadDetectedAccountsFromStorage() {
  try {
    const result = await chrome.storage.local.get(['detectedLinkedInAccounts']);
    if (result.detectedLinkedInAccounts) {
      detectedLinkedInAccounts = new Map(Object.entries(result.detectedLinkedInAccounts));
      console.log(`📂 Loaded ${detectedLinkedInAccounts.size} detected accounts from storage`);
    }
  } catch (error) {
    console.error('❌ Error loading detected accounts:', error);
  }
}

// Get count of unique Chrome profiles detected
function getUniqueProfilesCount() {
  const uniqueProfiles = new Set();
  for (const [key, account] of detectedLinkedInAccounts) {
    uniqueProfiles.add(account.chromeProfileId || account.profileId || 'default');
  }
  return uniqueProfiles.size;
}

// Enhanced sync with backend including profile context
async function syncDetectedAccountWithBackendEnhanced(accountData) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/linkedin-accounts/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        accountInfo: accountData,
        profileContext: {
          chromeProfileId: accountData.chromeProfileId,
          browserFingerprint: accountData.browserFingerprint,
          sessionInfo: accountData.sessionInfo,
          detectionMethod: accountData.detectionMethod,
          multiProfileSupport: true
        },
        syncTimestamp: Date.now()
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Enhanced account synced with backend:', result);
      
      // Update managed accounts if backend returned account ID
      if (result.accountId) {
        managedAccounts.set(accountData.accountKey, {
          ...accountData,
          backendId: result.accountId,
          syncedAt: Date.now(),
          managedByBackend: true
        });
        
        // Store updated managed accounts
        await chrome.storage.local.set({
          managedAccounts: Object.fromEntries(managedAccounts)
        });
      }
      
      return result;
    } else {
      throw new Error(`Backend sync failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ Enhanced backend sync error:', error);
    throw error;
  }
}

// Get all detected accounts across profiles
function getAllDetectedAccounts() {
  const accounts = [];
  for (const [key, account] of detectedLinkedInAccounts) {
    accounts.push({
      key: key,
      ...account,
      isManaged: managedAccounts.has(key)
    });
  }
  return accounts;
}

// Get accounts by Chrome profile
function getAccountsByProfile(chromeProfileId) {
  const accounts = [];
  for (const [key, account] of detectedLinkedInAccounts) {
    if (account.chromeProfileId === chromeProfileId || account.profileId === chromeProfileId) {
      accounts.push({
        key: key,
        ...account,
        isManaged: managedAccounts.has(key)
      });
    }
  }
  return accounts;
}

// Handle Scralytics login status updates
async function handleScralyticsLoginStatus(loginData) {
  try {
    console.log('🔐 Scralytics login status update:', loginData);
    
    if (loginData.isLoggedIn && loginData.authToken) {
      // User is logged into Scralytics
      authToken = loginData.authToken;
      isLoggedIn = true;
      
      // Save to storage
      await chrome.storage.local.set({
        authToken: authToken,
        userInfo: {
          userId: loginData.userId,
          userEmail: loginData.userEmail,
          userName: loginData.userName
        },
        scralyticsSession: loginData
      });
      
      console.log('✅ Scralytics authentication detected and saved');
      
      // Notify popup if open
      chrome.runtime.sendMessage({
        action: 'authStatusChanged',
        isLoggedIn: true,
        userInfo: {
          userId: loginData.userId,
          userEmail: loginData.userEmail,
          userName: loginData.userName
        }
      }).catch(() => {
        // Popup might not be open, ignore error
      });
      
      return { success: true, message: 'Authentication updated' };
      
    } else if (!loginData.isLoggedIn && isLoggedIn) {
      // User logged out of Scralytics
      console.log('🚪 Scralytics logout detected');
      
      authToken = null;
      isLoggedIn = false;
      
      // Clear storage
      await chrome.storage.local.clear();
      
      // Notify popup if open
      chrome.runtime.sendMessage({
        action: 'authStatusChanged',
        isLoggedIn: false
      }).catch(() => {
        // Popup might not be open, ignore error
      });
      
      return { success: true, message: 'Logged out' };
    }
    
    return { success: true, message: 'Status unchanged' };
    
  } catch (error) {
    console.error('❌ Error handling Scralytics login status:', error);
    throw error;
  }
}

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
      
      // Start job polling after successful login
      if (jobPoller) {
        jobPoller.startPolling();
      }
      
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
    // Stop job polling
    if (jobPoller) {
      jobPoller.stopPolling();
    }
    
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

// Enhanced cookie collection with persistence and retry logic
async function collectLinkedInCookies(tabId) {
  try {
    console.log('🍪 Starting enhanced cookie collection for tab:', tabId);
    
    // Validate tab exists and is accessible
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      throw new Error('Tab not found or inaccessible');
    }
    
    // Accept linkedin domains and local dev proxies (e.g., localhost and subdomains)
    const url = tab.url || '';
    if (!/linkedin\.com|linkedin\.local|localhost/.test(url)) {
      // Instead of throwing, try to open LinkedIn in a new background tab and retry collection
      console.warn('⚠️ Tab is not on LinkedIn. Attempting to open LinkedIn and retry collection. URL:', url);
      const createdTab = await chrome.tabs.create({ url: 'https://www.linkedin.com', active: false }).catch(() => null);
      if (createdTab) {
        // Wait for load
        await new Promise(resolve => {
          const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === createdTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);

          setTimeout(() => {
            try { chrome.tabs.onUpdated.removeListener(listener); } catch(e){}
            resolve();
          }, 8000);
        });
        tabId = createdTab.id;
      } else {
        throw new Error('Tab is not on LinkedIn. Please navigate to LinkedIn.com first.');
      }
    }
    
    // Check if tab is fully loaded
    if (tab.status !== 'complete') {
      console.log('⏳ Waiting for tab to finish loading...');
      await new Promise(resolve => {
        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 10000);
      });
    }
    
    // Retry logic for cookie collection
    let cookies = [];
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && cookies.length === 0) {
      attempts++;
      console.log(`🔄 Cookie collection attempt ${attempts}/${maxAttempts}`);
      
      try {
  // Get all LinkedIn cookies with retry (try multiple domain patterns)
  cookies = await chrome.cookies.getAll({ domain: '.linkedin.com' });
  if (!cookies || cookies.length === 0) cookies = await chrome.cookies.getAll({ domain: 'linkedin.com' });
  if (!cookies || cookies.length === 0) cookies = await chrome.cookies.getAll({ domain: 'www.linkedin.com' });
        
        if (cookies.length === 0) {
          // Try alternative domain
          cookies = await chrome.cookies.getAll({
            domain: 'linkedin.com'
          });
        }
        
        if (cookies.length === 0 && attempts < maxAttempts) {
          console.log('⏳ No cookies found, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.warn(`⚠️ Cookie collection attempt ${attempts} failed:`, error);
        if (attempts === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Filter important cookies
    const importantCookies = cookies.filter(cookie => 
      ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc', 'li_rm', 'liap'].includes(cookie.name)
    );
    
    if (importantCookies.length === 0) {
      throw new Error('No LinkedIn authentication cookies found. Please make sure you are logged in to LinkedIn.');
    }
    
    // Validate essential cookies
    const hasAuthCookie = importantCookies.some(cookie => cookie.name === 'li_at');
    if (!hasAuthCookie) {
      throw new Error('LinkedIn authentication cookie (li_at) not found. Please log in to LinkedIn.');
    }
    
    // Format cookies as string
    const cookieString = importantCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');

    console.log('✅ Enhanced cookies collected:', importantCookies.length);

    // Encrypt cookies before returning
    let encryptedCookies = null;
    try {
      if (typeof CookieEncryption !== 'undefined') {
        encryptedCookies = await CookieEncryption.encryptForTransmission(cookieString);
        console.log('🔒 Cookies encrypted for secure transmission');
      }
    } catch (error) {
      console.warn('⚠️ Cookie encryption failed, using plain text:', error);
    }

    // Get account name from page with retry, injecting content script if needed
    let accountName = 'Unknown Account';
    try {
      try {
        accountName = await getAccountNameFromTab(tabId);
      } catch (e) {
        // Try to inject content script then retry
        console.log('🔄 Injecting content script to extract account name');
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content_linkedin.js'] });
        } catch (injectErr) {
          console.warn('⚠️ Failed to inject content script for account name extraction:', injectErr.message || injectErr);
        }
        accountName = await getAccountNameFromTab(tabId).catch(err => {
          console.warn('⚠️ Retry account name extraction failed:', err && err.message);
          return 'Unknown Account';
        });
      }
    } catch (error) {
      console.warn('⚠️ Failed to get account name:', error && (error.message || error));
    }

    // Store cookies in local cache for persistence
    const cookieData = {
      cookies: encryptedCookies || cookieString,
      isEncrypted: !!encryptedCookies,
      accountName: accountName,
      cookieCount: importantCookies.length,
      tabId: tabId,
      timestamp: Date.now(),
      domain: tab.url
    };
    
    // Cache cookies for persistence across reloads
    await chrome.storage.local.set({
      [`cookies_${tabId}`]: cookieData,
      lastCookieCollection: Date.now()
    });
    
    console.log('💾 Cookies cached for persistence');

    return {
      success: true,
      ...cookieData
    };
    
  } catch (error) {
    console.error('❌ Enhanced cookie collection error:', error);
    
    // Try to recover from cache if available
    try {
      const cached = await chrome.storage.local.get([`cookies_${tabId}`]);
      if (cached[`cookies_${tabId}`]) {
        console.log('🔄 Recovering cookies from cache');
        return {
          success: true,
          ...cached[`cookies_${tabId}`],
          fromCache: true,
          cacheWarning: 'Using cached cookies due to collection failure'
        };
      }
    } catch (cacheError) {
      console.warn('⚠️ Cache recovery failed:', cacheError);
    }
    
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
      console.error('❌ Authentication required for account validation');
      throw new Error('Not authenticated. Please login first.');
    }
    
    if (!cookies || cookies.length === 0) {
      throw new Error('No cookies provided for validation');
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
    
    if (!response.ok) {
      if (response.status === 401) {
        // Clear invalid token
        authToken = null;
        isLoggedIn = false;
        await chrome.storage.local.clear();
        throw new Error('Authentication expired. Please login again.');
      }
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Account validation successful');
      return { success: true, isValid: data.isValid, message: data.message };
    } else {
      throw new Error(data.message || 'Validation failed');
    }
  } catch (error) {
    console.error('❌ Account validation error:', error);
    
    // Handle specific error types
    if (error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Please check if the server is running.');
    }
    
    throw error;
  }
}

// Save account to backend database
async function saveAccountToDatabase(accountData) {
  try {
    if (!authToken) {
      console.error('❌ Authentication required for saving account');
      throw new Error('Not authenticated. Please login first.');
    }
    
    if (!accountData) {
      throw new Error('No account data provided');
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
    
    if (!response.ok) {
      if (response.status === 401) {
        // Clear invalid token
        authToken = null;
        isLoggedIn = false;
        await chrome.storage.local.clear();
        throw new Error('Authentication expired. Please login again.');
      }
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Account saved successfully:', data.accountId);
      return { success: true, accountId: data.accountId };
    } else {
      throw new Error(data.message || 'Failed to save account');
    }
  } catch (error) {
    console.error('❌ Save account error:', error);
    
    // Handle specific error types
    if (error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Please check if the server is running.');
    }
    
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

// Get authentication status
async function getAuthStatus() {
  try {
    const result = await chrome.storage.local.get(['authToken', 'userInfo']);
    return {
      success: true,
      isLoggedIn: !!result.authToken,
      userInfo: result.userInfo || null
    };
  } catch (error) {
    console.error('❌ Error getting auth status:', error);
    return {
      success: false,
      isLoggedIn: false,
      error: error.message
    };
  }
}

// Get all accounts
async function getAccounts() {
  try {
    const result = await chrome.storage.local.get(['managedAccounts', 'detectedLinkedInAccounts']);
    
    const managed = result.managedAccounts ? Object.values(result.managedAccounts) : [];
    const detected = result.detectedLinkedInAccounts ? Object.values(result.detectedLinkedInAccounts) : [];
    
    return {
      success: true,
      accounts: [...managed, ...detected]
    };
  } catch (error) {
    console.error('❌ Error getting accounts:', error);
    return {
      success: false,
      error: error.message,
      accounts: []
    };
  }
}

// Add new account
async function addAccount(account) {
  try {
    if (!account || !account.name) {
      throw new Error('Invalid account data');
    }

    const accountId = `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const accountData = {
      id: accountId,
      ...account,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const result = await chrome.storage.local.get(['managedAccounts']);
    const managedAccounts = result.managedAccounts || {};
    managedAccounts[accountId] = accountData;

    await chrome.storage.local.set({ managedAccounts });

    return {
      success: true,
      account: accountData
    };
  } catch (error) {
    console.error('❌ Error adding account:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Update existing account
async function updateAccount(accountId, updates) {
  try {
    if (!accountId || !updates) {
      throw new Error('Invalid parameters');
    }

    const result = await chrome.storage.local.get(['managedAccounts']);
    const managedAccounts = result.managedAccounts || {};

    if (!managedAccounts[accountId]) {
      throw new Error('Account not found');
    }

    managedAccounts[accountId] = {
      ...managedAccounts[accountId],
      ...updates,
      updatedAt: Date.now()
    };

    await chrome.storage.local.set({ managedAccounts });

    return {
      success: true,
      account: managedAccounts[accountId]
    };
  } catch (error) {
    console.error('❌ Error updating account:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Delete account
async function deleteAccount(accountId) {
  try {
    if (!accountId) {
      throw new Error('Account ID required');
    }

    const result = await chrome.storage.local.get(['managedAccounts']);
    const managedAccounts = result.managedAccounts || {};

    if (!managedAccounts[accountId]) {
      throw new Error('Account not found');
    }

    delete managedAccounts[accountId];
    await chrome.storage.local.set({ managedAccounts });

    return {
      success: true,
      message: 'Account deleted successfully'
    };
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Handle alarm events for job polling
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === jobPoller.alarmName && jobPoller.isPolling) {
    jobPoller.pollForJobs().catch(error => {
      console.error('❌ Error during alarm-triggered job polling:', error);
    });
  }
});
// Service Worker Lifecycle Management
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Extension startup - initializing service worker');
  await initializeServiceWorker();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('📦 Extension installed/updated:', details.reason);
  await initializeServiceWorker();
  
  // Clear any stale data on install/update
  if (details.reason === 'install' || details.reason === 'update') {
    console.log('🧹 Clearing stale extension data');
    await chrome.storage.local.clear();
  }
});

// Initialize service worker state
async function initializeServiceWorker() {
  try {
    console.log('🔧 Initializing service worker state...');
    
    // Restore authentication state
    const stored = await chrome.storage.local.get(['authToken', 'userInfo', 'managedAccounts', 'detectedAccounts']);
    
    if (stored.authToken) {
      authToken = stored.authToken;
      isLoggedIn = true;
      console.log('✅ Authentication state restored');
      
      // Start job polling if authenticated
      if (jobPoller && !jobPoller.isPolling) {
        jobPoller.startPolling();
      }
      
      // Start auto-refresh for LinkedIn accounts
      startAutoRefresh();
    }
    
    // Restore managed accounts
    if (stored.managedAccounts) {
      managedAccounts.clear();
      Object.entries(stored.managedAccounts).forEach(([key, account]) => {
        managedAccounts.set(key, account);
      });
      console.log(`✅ Restored ${managedAccounts.size} managed accounts`);
    }
    
    // Restore detected accounts
    if (stored.detectedAccounts) {
      detectedLinkedInAccounts.clear();
      Object.entries(stored.detectedAccounts).forEach(([key, account]) => {
        detectedLinkedInAccounts.set(key, account);
      });
      console.log(`✅ Restored ${detectedLinkedInAccounts.size} detected accounts`);
    }
    
    console.log('✅ Service worker initialized successfully');
    
  } catch (error) {
    console.error('❌ Failed to initialize service worker:', error);
  }
}

// Persist state before service worker unloads
chrome.runtime.onSuspend.addListener(async () => {
  console.log('💤 Service worker suspending - persisting state');
  await persistServiceWorkerState();
});

// Persist current state to storage
async function persistServiceWorkerState() {
  try {
    const stateData = {
      authToken,
      isLoggedIn,
      managedAccounts: Object.fromEntries(managedAccounts),
      detectedAccounts: Object.fromEntries(detectedLinkedInAccounts),
      lastPersisted: Date.now()
    };
    
    await chrome.storage.local.set(stateData);
    console.log('✅ Service worker state persisted');
    
  } catch (error) {
    console.error('❌ Failed to persist service worker state:', error);
  }
}

// Enhanced message handling with context validation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Message received:', message.type || message.action, 'from:', sender.tab?.url || 'popup');
  
  // Validate service worker context (best-effort). In some contexts chrome.runtime.id can be temporarily undefined
  // — don't treat that as fatal. Log a warning instead and continue handling the message.
  try {
    if (!chrome || !chrome.runtime) {
      console.warn('⚠️ chrome.runtime not available in this context; continuing cautiously');
    }
  } catch (ctxErr) {
    console.warn('⚠️ Error checking chrome.runtime:', ctxErr && (ctxErr.message || ctxErr));
  }
  
  // Handle different message types
  const messageType = message?.type || message?.action || message?.messageType || message?.msgType || 'UNKNOWN';
  
  try {
    switch (messageType) {
      case 'PING':
        sendResponse({ success: true, message: 'Service worker is alive', timestamp: Date.now() });
        return true;
        
      case 'getAuthStatus':
        handleGetAuthStatus()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'login':
        handleLogin(message.credentials)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'logout':
        handleLogout()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'collectCookies':
        collectLinkedInCookies(message.tabId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'getAccounts':
        handleGetAccounts()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'syncAccounts':
        handleSyncAccounts()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'detectLinkedInAccounts':
        detectAndRefreshLinkedInAccounts()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'startAutoRefresh':
        try {
          startAutoRefresh();
          sendResponse({ success: true, message: 'Auto-refresh started' });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return true;
        
      case 'stopAutoRefresh':
        try {
          stopAutoRefresh();
          sendResponse({ success: true, message: 'Auto-refresh stopped' });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return true;
        
      case 'addAccount':
        handleAddAccount(message.accountData)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'updateAccount':
        handleUpdateAccount(message.accountId, message.accountData)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'deleteAccount':
        handleDeleteAccount(message.accountId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'validateAccount':
        handleValidateAccount(message.cookies)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'saveAccount':
        handleSaveAccount(message.cookies, message.accountName)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'startScraping':
        handleStartScraping(message.accountId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'LINKEDIN_ACCOUNT_DETECTED':
        handleLinkedInAccountDetected(message.accountData, sender.tab)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'SCRALYTICS_LOGIN_STATUS':
        handleScralyticsLoginStatus(message.loginData)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      default:
        console.warn('⚠️ Unknown message type received (will ignore):', messageType, message);
        // Respond with a friendly default instead of an error so callers don't get noisy failures
        sendResponse({ success: false, ignored: true, error: 'Unknown message type: ' + messageType });
        return true;
    }
  } catch (error) {
    console.error('❌ Message handler error:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// Enhanced tab monitoring with context validation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Validate context before processing
  if (!chrome.runtime?.id) {
    console.error('❌ Service worker context invalidated during tab update');
    return;
  }
  
  if (changeInfo.status === 'complete' && tab.url?.includes('linkedin.com')) {
    console.log('🔗 LinkedIn page detected:', tab.url);
    
    // Auto-detect LinkedIn account if logged in
    if (isLoggedIn) {
      try {
        // Inject content script if not already present
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content_linkedin.js']
        });
        
        console.log('✅ Content script injected into LinkedIn tab');
      } catch (error) {
        console.warn('⚠️ Failed to inject content script:', error.message);
      }
    }
    
    // Notify popup if it's open (with error handling)
    try {
      await chrome.runtime.sendMessage({
        action: 'linkedinPageDetected',
        tabId: tabId,
        url: tab.url
      });
    } catch (error) {
      // Popup might not be open, this is expected
      console.log('📱 Popup not open for LinkedIn page notification');
    }
  }
});

// Enhanced extension icon click handler
chrome.action.onClicked.addListener(async (tab) => {
  // Validate context
  if (!chrome.runtime?.id) {
    console.error('❌ Service worker context invalidated during action click');
    return;
  }
  
  if (tab.url?.includes('linkedin.com')) {
    try {
      console.log('🎯 Auto-collecting cookies from LinkedIn tab');
      const result = await collectLinkedInCookies(tab.id);
      
      // Show success notification
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'LinkedIn Cookies Collected',
        message: `Collected cookies for ${result.accountName || 'LinkedIn account'}`
      });
      
      console.log('✅ Auto-collected cookies:', result);
      
    } catch (error) {
      console.error('❌ Auto-collection failed:', error);
      
      // Show error notification
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Cookie Collection Failed',
        message: error.message || 'Failed to collect LinkedIn cookies'
      });
    }
  } else {
    // Show notification to navigate to LinkedIn
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Navigate to LinkedIn',
      message: 'Please navigate to LinkedIn.com to collect cookies'
    });
  }
});

// Handle account validation
async function handleValidateAccount(cookies) {
  try {
    console.log('🔍 Validating LinkedIn account cookies...');
    
    if (!authToken) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/extension/validate-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ cookies })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
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

// Handle account saving
async function handleSaveAccount(cookies, accountName) {
  try {
    console.log('💾 Saving LinkedIn account to database...');
    
    if (!authToken) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        accountName: accountName || 'LinkedIn Account',
        cookies: cookies,
        platform: 'linkedin'
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ Account saved successfully');
      return { success: true, accountId: data.accountId };
    } else {
      throw new Error(data.message || 'Failed to save account');
    }
  } catch (error) {
    console.error('❌ Account save error:', error);
    throw error;
  }
}

// Handle scraping start
async function handleStartScraping(accountId) {
  try {
    console.log('🚀 Starting scraping task...');
    
    if (!authToken) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/extension/scraping/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        accountId: accountId,
        taskType: 'profile_scraping'
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ Scraping task started successfully');
      return { success: true, jobId: data.jobId };
    } else {
      throw new Error(data.message || 'Failed to start scraping');
    }
  } catch (error) {
    console.error('❌ Scraping start error:', error);
    throw error;
  }
}

// Periodic state persistence (every 5 minutes)
setInterval(async () => {
  if (chrome.runtime?.id) {
    await persistServiceWorkerState();
  }
}, 5 * 60 * 1000);

// Initialize on script load
initializeServiceWorker();

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