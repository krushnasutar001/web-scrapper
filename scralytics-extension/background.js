// Scralytics Hub - Background Service Worker
// Captures LinkedIn cookies and syncs with backend

const API_BASE_URL = 'https://api.scralytics-hub.com';
const SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Scralytics Hub extension installed');
  setupPeriodicSync();
});

// Setup periodic cookie sync
function setupPeriodicSync() {
  chrome.alarms.create('cookieSync', { periodInMinutes: 10 });
}

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cookieSync') {
    syncLinkedInCookies();
  }
});

// Sync LinkedIn cookies with backend
async function syncLinkedInCookies() {
  try {
    // Get LinkedIn cookies
    const cookies = await chrome.cookies.getAll({ domain: ".linkedin.com" });
    
    if (cookies.length === 0) {
      console.log('No LinkedIn cookies found');
      return;
    }

    // Get stored JWT token
    const result = await chrome.storage.local.get(['jwtToken', 'userEmail']);
    if (!result.jwtToken || !result.userEmail) {
      console.log('No JWT token or user email found. Please login first.');
      return;
    }

    // Prepare cookie data
    const cookieData = {
      account_email: result.userEmail,
      cookies: cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expirationDate: cookie.expirationDate,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite
      }))
    };

    // Send to backend
    const response = await fetch(`${API_BASE_URL}/api/cookies/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${result.jwtToken}`
      },
      body: JSON.stringify(cookieData)
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Cookies synced successfully:', data);
      
      // Update last sync time
      await chrome.storage.local.set({
        lastSyncTime: new Date().toISOString(),
        syncStatus: 'success'
      });
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    console.error('Cookie sync failed:', error);
    await chrome.storage.local.set({
      syncStatus: 'error',
      lastError: error.message
    });
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'syncNow':
      syncLinkedInCookies().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async response

    case 'getStatus':
      chrome.storage.local.get(['lastSyncTime', 'syncStatus', 'lastError']).then(result => {
        sendResponse(result);
      });
      return true;

    case 'login':
      handleLogin(request.credentials).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
  }
});

// Handle user login
async function handleLogin(credentials) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });

    if (response.ok) {
      const data = await response.json();
      
      // Store JWT token and user info
      await chrome.storage.local.set({
        jwtToken: data.token,
        userEmail: credentials.email,
        userId: data.userId
      });

      // Start immediate sync
      await syncLinkedInCookies();

      return { success: true, message: 'Login successful' };
    } else {
      throw new Error(`Login failed: ${response.statusText}`);
    }
  } catch (error) {
    throw new Error(`Login error: ${error.message}`);
  }
}

// Handle tab updates to detect LinkedIn navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('linkedin.com')) {
    // Delay sync to allow cookies to be set
    setTimeout(() => {
      syncLinkedInCookies();
    }, 2000);
  }
});

// Export functions for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    syncLinkedInCookies,
    handleLogin
  };
}