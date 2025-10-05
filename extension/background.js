// Service Worker Lifecycle Management

// Global state declarations and safe defaults
let authToken = null;
let isLoggedIn = false;
const managedAccounts = new Map();
const detectedLinkedInAccounts = new Map();
let API_BASE_URL = (typeof globalThis !== 'undefined' && typeof globalThis.API_BASE_URL !== 'undefined') ? globalThis.API_BASE_URL : 'http://localhost:5001';
// Minimal jobPoller fallback to avoid undefined errors; real implementation may live in jobPoller.js
const jobPoller = (typeof globalThis !== 'undefined' && typeof globalThis.jobPoller !== 'undefined') ? globalThis.jobPoller : { isPolling: false, retryCount: 0, startPolling(){ this.isPolling = true; }, stopPolling(){ this.isPolling = false; } };
function startAutoRefresh(){ /* no-op fallback */ }
function stopAutoRefresh(){ /* no-op fallback */ }
function startAccountSync(){ /* no-op fallback */ }

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
    const stored = await chrome.storage.local.get(['authToken', 'userInfo', 'managedAccounts', 'detectedAccounts', 'apiBaseUrl']);
    if (stored.apiBaseUrl) {
      API_BASE_URL = stored.apiBaseUrl;
      console.log('🔗 API base restored:', API_BASE_URL);
    }
    
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
      // Start periodic account sync as well
      startAccountSync();
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
    // Attempt to flush any queued cookie payloads on startup
    try {
      await flushPendingCookiePayloads();
    } catch (e) {
      console.warn('⚠️ Failed to flush cookie queue on startup:', e && (e.message || e));
    }
    
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

// Helper: detect if extension context is available
function isExtensionContextAvailable() {
  try {
    return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

// Helper: ensure we have a valid auth token and restore API base URL if needed
async function getAuthToken() {
  if (authToken) return authToken;
  try {
    const stored = await chrome.storage.local.get(['authToken', 'apiBaseUrl']);
    if (stored.apiBaseUrl) API_BASE_URL = stored.apiBaseUrl;
    if (stored.authToken) {
      authToken = stored.authToken;
      isLoggedIn = true;
      return authToken;
    }
  } catch (_) {}
  return null;
}

// Flush any queued cookie payloads from storage
async function flushPendingCookiePayloads() {
  try {
    if (!isExtensionContextAvailable()) {
      console.warn('⚠️ Cannot flush cookie queue: extension context unavailable');
      return { success: false, flushed: 0 };
    }

    const { pendingCookiePayloads = [] } = await chrome.storage.local.get(['pendingCookiePayloads']);
    if (!Array.isArray(pendingCookiePayloads) || pendingCookiePayloads.length === 0) {
      return { success: true, flushed: 0 };
    }

    let flushed = 0;
    for (const payload of pendingCookiePayloads) {
      try {
        const cookiePayload = payload?.cookies || payload?.cookieMap || payload;
        let normalizedCookies = [];
        if (Array.isArray(cookiePayload)) {
          normalizedCookies = cookiePayload;
        } else if (cookiePayload && typeof cookiePayload === 'object') {
          normalizedCookies = Object.keys(cookiePayload).map(k => ({ name: k, value: String(cookiePayload[k] ?? '') }));
        }
        const accountName = payload?.accountName || 'LinkedIn Account';
        const store = { accountName, cookies: normalizedCookies, ts: Date.now(), url: payload?.url || null };
        await chrome.storage.local.set({ latestCookies: store });
        flushed++;
      } catch (e) {
        console.warn('⚠️ Failed to flush a queued cookie payload:', e && (e.message || e));
      }
    }

    // Clear the queue after processing
    await chrome.storage.local.set({ pendingCookiePayloads: [] });
    console.log(`✅ Flushed ${flushed} queued cookie payload(s)`);
    return { success: true, flushed };
  } catch (error) {
    console.error('❌ Error flushing queued cookie payloads:', error);
    return { success: false, error: String(error.message || error) };
  }
}

// React to storage changes for pending cookie payloads
chrome.storage.onChanged.addListener((changes, areaName) => {
  try {
    if (areaName === 'local' && changes.pendingCookiePayloads && isExtensionContextAvailable()) {
      const newVal = changes.pendingCookiePayloads.newValue;
      if (Array.isArray(newVal) && newVal.length > 0) {
        // Best-effort async flush; do not await inside listener
        flushPendingCookiePayloads();
      }
    }
    // Keep auth and API base in sync with storage to avoid logout on SW restart
    if (areaName === 'local') {
      if (changes.authToken) {
        authToken = changes.authToken.newValue || null;
        isLoggedIn = !!authToken;
      }
      if (changes.apiBaseUrl) {
        API_BASE_URL = changes.apiBaseUrl.newValue || API_BASE_URL;
      }
    }
  } catch (e) {
    console.warn('⚠️ Error handling storage change:', e && (e.message || e));
  }
});

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
      case 'ping':
        sendResponse({ success: true, message: 'Service worker is alive', timestamp: Date.now() });
        return true;
        
      case 'getAuthStatus':
        handleGetAuthStatus()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'login':
        handleLogin(message.credentials || { email: message.email, password: message.password })
          .then(res => sendResponse({ success: true, data: res }))
          .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
        return true;
        
      case 'logout':
        handleLogout()
          .then(res => sendResponse({ success: true, data: res }))
          .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
        return true;
        
      case 'collectCookies':
        collectLinkedInCookies(message.tabId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      // Collect cookies from multiple LinkedIn tabs/accounts
      case 'collectMultipleCookies':
        collectMultipleLinkedInCookies(message.accounts)
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

      case 'GET_LOCAL_LINKEDIN_ACCOUNTS':
        try {
          chrome.storage.local.get(['linkedinAccounts', 'latestCookies']).then(store => {
            const raw = Array.isArray(store.linkedinAccounts) ? store.linkedinAccounts : [];
            const normalized = raw.map(acc => ({
              id: acc.id || `ext_${(acc.email || acc.name || 'account').replace(/[^a-zA-Z0-9]/g, '')}_${Math.random().toString(36).slice(2, 8)}`,
              account_name: acc.account_name || acc.name || acc.email || 'LinkedIn Account',
              email: acc.email || '',
              validation_status: acc.isValid === false ? 'PENDING' : 'ACTIVE',
              last_validated_at: acc.lastValidated || acc.last_validated_at || null
            }));

            // If nothing saved yet, surface latestCookies as a pending placeholder
            if (normalized.length === 0 && store.latestCookies && store.latestCookies.accountName) {
              normalized.push({
                id: `ext_latest_${Math.random().toString(36).slice(2, 8)}`,
                account_name: store.latestCookies.accountName,
                email: '',
                validation_status: 'PENDING',
                last_validated_at: null
              });
            }

            sendResponse({ success: true, data: normalized });
          }).catch(err => {
            sendResponse({ success: false, error: String(err?.message || err) });
          });
        } catch (error) {
          sendResponse({ success: false, error: String(error?.message || error) });
        }
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
        addAccount(message.accountData || message.account || { name: message.account_name || message.name, email: message.email })
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'updateAccount':
        updateAccount(message.accountId, message.accountData || message.updates || message.updateData)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'deleteAccount':
        deleteAccount(message.accountId)
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
        // Pass the full message to ensure accountInfo is available; guard undefined
        handleLinkedInAccountDetected(message || {}, sender.tab)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'LINKEDIN_READY':
        // Acknowledge LinkedIn content script readiness
        sendResponse({ success: true, message: 'LinkedIn content ready', ts: Date.now() });
        return true;

      case 'LINKEDIN_COOKIES_COLLECTED':
        try {
          const cookiePayload = message.cookies || message.cookieMap || message;
          let normalizedCookies = [];
          if (Array.isArray(cookiePayload)) {
            normalizedCookies = cookiePayload;
          } else if (cookiePayload && typeof cookiePayload === 'object') {
            normalizedCookies = Object.keys(cookiePayload).map(k => ({ name: k, value: String(cookiePayload[k] ?? '') }));
          }
          const accountName = message.accountName || 'LinkedIn Account';
          const store = { accountName, cookies: normalizedCookies, ts: Date.now(), url: message.url || sender.tab?.url || null };
          console.log('📥 received cookies from content script:', { count: normalizedCookies.length });
          chrome.storage.local.set({ latestCookies: store }).then(() => {
            sendResponse({ success: true, stored: true, count: normalizedCookies.length });
          }).catch(err => {
            sendResponse({ success: false, error: String(err.message || err) });
          });
        } catch (e) {
          sendResponse({ success: false, error: String(e.message || e) });
        }
        return true;
        
      case 'SCRALYTICS_LOGIN_STATUS':
        const loginPayload = message.loginData || message.data || message.payload || message;
        handleScralyticsLoginStatus(loginPayload)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'getLoginStatus':
        // Forward to the active tab's content script for LinkedIn login state
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getLoginStatus', type: 'getLoginStatus' })
              .then(res => sendResponse(res))
              .catch(err => sendResponse({ success: false, error: String(err.message || err) }));
          } else {
            sendResponse({ success: false, error: 'No active tab found' });
          }
        });
        return true;
        
      default:
        // Silently ignore unknown messages so other listeners can handle them; avoids noisy logs
        return false;
    }
  } catch (error) {
    console.error('❌ Message handler error:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// Long-lived port to keep service worker awake and receive cookie payloads reliably
chrome.runtime.onConnect.addListener((port) => {
  try {
    if (port.name !== 'linkedin-cookie-port') return;
    // Optional: acknowledge connection to help caller know we're alive
    try { port.postMessage({ type: 'PORT_ACK', ts: Date.now() }); } catch (_) {}
    port.onMessage.addListener(async (msg) => {
      try {
        if (!msg) return;
        const t = msg.type || msg.action;
        if (t === 'LINKEDIN_COOKIES_COLLECTED') {
          // Normalize and persist latest cookies
          const cookiePayload = msg.cookies || msg.cookieMap || msg;
          let normalizedCookies = [];
          if (Array.isArray(cookiePayload)) {
            normalizedCookies = cookiePayload;
          } else if (cookiePayload && typeof cookiePayload === 'object') {
            normalizedCookies = Object.keys(cookiePayload).map(k => ({ name: k, value: String(cookiePayload[k] ?? '') }));
          }
          const accountName = msg.accountName || 'LinkedIn Account';
          const store = { accountName, cookies: normalizedCookies, ts: Date.now(), url: msg.url || null };
          try {
            await chrome.storage.local.set({ latestCookies: store });
            try { port.postMessage({ type: 'COOKIES_STORED', success: true, count: normalizedCookies.length, ts: Date.now() }); } catch (_) {}
          } catch (err) {
            try { port.postMessage({ type: 'COOKIES_STORED', success: false, error: String(err?.message || err) }); } catch (_) {}
          }
        }
      } catch (e) {
        try { port.postMessage({ type: 'ERROR', error: String(e?.message || e) }); } catch (_) {}
      }
    });
  } catch (e) {
    console.warn('⚠️ Error in onConnect handler:', e && (e.message || e));
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

    // Guest mode: inject content script regardless of authentication
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      console.log('✅ Content script injected into LinkedIn tab');
    } catch (error) {
      console.warn('⚠️ Failed to inject content script:', error.message);
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
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      throw new Error('No cookies provided for validation');
    }
    // Try backend validation if authenticated; otherwise perform local validation
    const token = await getAuthToken();
    if (token) {
      const response = await fetch(`${API_BASE_URL}/api/extension/validate-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ cookies })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('✅ Account validation successful (backend)');
        return { success: true, isValid: !!data.isValid, expired: false, message: data.message || 'Valid' };
      } else {
        throw new Error(data.message || 'Validation failed');
      }
    } else {
      // Local validation: check for presence of essential cookies
      const names = new Set(cookies.map(c => c?.name));
      const hasLiAt = names.has('li_at');
      const hasJsession = names.has('JSESSIONID');
      const hasBcookie = names.has('bcookie') || names.has('bscookie');
      const isValid = hasLiAt && hasJsession && hasBcookie;
      console.log(`✅ Account validation (local): li_at=${hasLiAt}, JSESSIONID=${hasJsession}, bcookie=${hasBcookie}`);
      return { success: true, isValid, expired: false, message: isValid ? 'Valid (local)' : 'Invalid (missing essential cookies)' };
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
    const token = await getAuthToken();
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      throw new Error('No cookies provided');
    }

    // If not authenticated, save locally to managed accounts
    if (!token) {
      try {
        const localId = `${(accountName || 'LinkedIn Account').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
        managedAccounts.set(String(localId), {
          id: localId,
          account_name: accountName || 'LinkedIn Account',
          email: null,
          profileUrl: null,
          cookies_json: cookies,
          created_at: Date.now()
        });
        await chrome.storage.local.set({ managedAccounts: Object.fromEntries(managedAccounts) });
        console.log('✅ Account saved locally (no auth)');
        return { success: true, local: true, accountId: localId };
      } catch (localErr) {
        console.error('❌ Local save error:', localErr);
        throw new Error(String(localErr.message || localErr));
      }
    }

    // Prefer extension endpoint
    let response = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        account_name: accountName || 'LinkedIn Account',
        // Use cookies_json for backend compatibility
        cookies_json: cookies
      })
    });

    let data = await response.json().catch(() => ({}));

    // Fallback to generic accounts route if extension endpoint not available
    if (!response.ok) {
      response = await fetch(`${API_BASE_URL}/api/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          account_name: accountName || 'LinkedIn Account',
          // Use cookies_json for legacy controller support
          cookies_json: cookies
        })
      });
      data = await response.json();
    }

    if (response.ok && (data.success || data.ok)) {
      console.log('✅ Account saved successfully');
      return { success: true, accountId: data.accountId || data.accountUid || data?.data?.id || data?.id };
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
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated. Please login first.');
    }

    const response = await fetch(`${API_BASE_URL}/api/extension/scraping/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        accountId: accountId,
        taskType: 'profile_scraping'
      })
    });

    const data = await response.json();

    if (response.ok && (data.success || data.ok)) {
      console.log('✅ Scraping task started successfully');
      return { success: true, jobId: data.jobId || data?.data?.jobId };
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

// Implement login/logout handlers
async function handleLogin(credentials) {
  const creds = credentials || {};
  if (!creds.email || !creds.password) {
    throw new Error('Missing email or password');
  }
  // Try login on primary and fallback base URLs
  const uniqueBases = Array.from(new Set([
    API_BASE_URL,
    'http://localhost:3001',
    'http://localhost:5000'
  ]));

  let lastErrMsg = 'Failed to connect to server';
  for (const base of uniqueBases) {
    let response;
    let data = {};
    try {
      response = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, password: creds.password })
      });
    } catch (networkErr) {
      lastErrMsg = networkErr?.message || 'Failed to connect to server';
      continue; // try next base
    }

    try {
      data = await response.json();
    } catch (parseErr) {
      try {
        const text = await response.text();
        data = { message: (text && text.slice(0, 200)) || response.statusText };
      } catch {
        data = { message: response.statusText };
      }
    }

    if (!response.ok) {
      let msg = data?.message || '';
      if (response.status === 401 || response.status === 400) {
        msg = msg || 'Invalid email or password';
        throw new Error(msg); // credentials issue; stop trying
      } else if (response.status === 404) {
        // Endpoint missing on this base; try next
        lastErrMsg = msg || `Login endpoint not found (${response.status})`;
        continue;
      } else if (response.status >= 500) {
        lastErrMsg = msg || 'Server error. Please try again later.';
        continue;
      } else {
        lastErrMsg = msg || `Login failed (${response.status} ${response.statusText})`;
        continue;
      }
    }

    if (!data?.token) {
      lastErrMsg = data?.message || 'Unexpected server response (token missing)';
      continue;
    }

    // Success: persist token and chosen base URL
    API_BASE_URL = base;
    authToken = data.token;
    isLoggedIn = true;
    await chrome.storage.local.set({ authToken, isLoggedIn: true, userInfo: data.user || null, apiBaseUrl: base });
    try { if (jobPoller && !jobPoller.isPolling) jobPoller.startPolling(); } catch {}
    // Notify popup/UI about auth status change
    try { chrome.runtime.sendMessage({ action: 'authStatusChanged', isLoggedIn: true, user: data.user || null, apiBaseUrl: base }); } catch (_) {}
    return { success: true, token: authToken, user: data.user || null };
  }

  // All attempts failed
  throw new Error(lastErrMsg);
}

async function handleLogout() {
  await chrome.storage.local.remove(['authToken', 'userInfo']);
  authToken = null;
  isLoggedIn = false;
  try { jobPoller?.stopPolling?.(); } catch {}
  return { success: true };
}

// Cookie collection (single tab)
async function collectLinkedInCookies(tabId) {
  let targetTabId = tabId;
  if (!targetTabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs && tabs[0];
    if (activeTab?.url?.includes('linkedin.com')) {
      targetTabId = activeTab.id;
    }
  }
  const cookies = await chrome.cookies.getAll({ domain: '.linkedin.com' });
  const simpleCookies = (cookies || []).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite
  }));
  let accountName = 'LinkedIn Account';
  try {
    if (targetTabId) {
      const res = await chrome.tabs.sendMessage(targetTabId, { action: 'getLoginStatus', type: 'getLoginStatus' });
      if (res?.user?.name) accountName = res.user.name;
    }
  } catch {}
  await chrome.storage.local.set({ latestCookies: { accountName, cookies: simpleCookies, ts: Date.now() } });
  return { success: true, accountName, cookies: simpleCookies, cookieCount: simpleCookies.length };
}

// Cookie collection (multiple tabs)
async function collectMultipleLinkedInCookies() {
  const tabs = await chrome.tabs.query({ url: ['*://*.linkedin.com/*'] });
  const results = await Promise.all((tabs || []).map(async (t) => {
    try {
      const r = await collectLinkedInCookies(t.id);
      return { tabId: t.id, url: t.url, success: true, accountName: r.accountName, cookies: r.cookies };
    } catch (e) {
      return { tabId: t.id, url: t.url, success: false, error: String(e.message || e) };
    }
  }));
  const successCount = results.filter(r => r.success).length;
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const total = results.length;
  return { success: true, data: { successful, failed, total }, results, count: successCount };
}

// Initialize on script load
initializeServiceWorker();

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleLogin,
    handleLogout,
    collectLinkedInCookies,
    validateLinkedInAccount: handleValidateAccount,
    saveAccountToDatabase: handleSaveAccount,
    startScrapingTask: handleStartScraping
  };
}
async function handleGetAuthStatus() {
  try {
    const token = await getAuthToken();
    const hasToken = !!token;
    if (!hasToken) {
      return { success: true, isLoggedIn: false, user: null };
    }
    const response = await fetch(`${API_BASE_URL}/api/extension/auth/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (response.ok && (data.success || data.ok)) {
      const user = data.user || data.data || null;
      return { success: true, isLoggedIn: true, user };
    }
    // If token exists but backend refuses for non-401, keep logged-in state to avoid UX churn
    if (response.status !== 401) {
      return { success: true, isLoggedIn: true, user: null, warning: data.message || 'Auth status unavailable' };
    }
    return { success: false, isLoggedIn: false, error: data.message || 'Failed to fetch auth status' };
  } catch (err) {
    // Network errors: if token exists, report logged in with networkError flag
    if (authToken) {
      return { success: true, isLoggedIn: true, user: null, networkError: true, error: String(err.message || err) };
    }
    return { success: false, isLoggedIn: false, error: String(err.message || err) };
  }
}
async function handleGetAccounts() {
  try {
    const token = await getAuthToken();
    // Attempt to collect cookies for debug/diagnostics regardless of auth
    let linkedinCookies = [];
    try {
      if (chrome?.cookies?.getAll) {
        linkedinCookies = await chrome.cookies.getAll({ domain: '.linkedin.com' });
      }
    } catch (cookieErr) {
      console.warn('⚠️ Failed to collect LinkedIn cookies:', cookieErr && (cookieErr.message || cookieErr));
    }
    if (!token) {
      // No auth: return locally managed or detected accounts
      const stored = await chrome.storage.local.get(['managedAccounts', 'detectedAccounts']);
      const localManaged = stored.managedAccounts ? Object.values(stored.managedAccounts) : Array.from(managedAccounts.values());
      const localDetected = stored.detectedAccounts ? Object.values(stored.detectedAccounts) : Array.from(detectedLinkedInAccounts.values());
      const accounts = localManaged.length > 0 ? localManaged : localDetected.map(d => ({ account_name: d.name, email: d.email, profileUrl: d.profileUrl }));
      return { success: true, accounts, count: accounts.length, local: true, cookies: linkedinCookies };
    }

    let response = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    let data = await response.json();
    if (!response.ok) {
      // Fallback to generic accounts route
      response = await fetch(`${API_BASE_URL}/api/accounts`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      data = await response.json();
    }
    if (response.ok && (data.success || data.ok)) {
      const accounts = data.accounts || data.data?.accounts || [];
      return { success: true, accounts, count: accounts.length, cookies: linkedinCookies };
    }
    throw new Error(data.message || 'Failed to fetch accounts');
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}
async function handleSyncAccounts() {
  try {
    if (!authToken) {
      // No auth: nothing to sync; treat as successful no-op
      const accounts = Array.from(managedAccounts.values());
      await chrome.storage.local.set({ managedAccounts: Object.fromEntries(managedAccounts) });
      return { success: true, synced: false, localOnly: true, count: accounts.length };
    }
    const accounts = Array.from(managedAccounts.values());
    let response = await fetch(`${API_BASE_URL}/api/extension/accounts/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ accounts })
    });
    let data = await response.json().catch(() => ({}));
    if (response.ok && (data.success || data.ok)) {
      return { success: true, synced: true, details: data.data || null };
    }

    // Fallback: try legacy route if extension sync endpoint is not available
    if (response.status === 404) {
      try {
        response = await fetch(`${API_BASE_URL}/api/accounts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ accounts })
        });
        data = await response.json().catch(() => ({}));
        if (response.ok && (data.success || data.ok)) {
          return { success: true, synced: true, legacy: true, details: data.data || null };
        }
      } catch (legacyErr) {
        // Continue to detailed error below
        data = { message: String(legacyErr.message || legacyErr) };
      }
    }

    const statusText = `${response.status} ${response.statusText}`;
    throw new Error(data.message || `Failed to sync accounts: ${statusText}`);
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}
async function detectAndRefreshLinkedInAccounts() {
  try {
    // Proactively flush any queued cookie payloads before detection
    try { await flushPendingCookiePayloads(); } catch (_) { /* best effort */ }
    const token = await getAuthToken(); // Optional; detection proceeds even without auth

    const tabs = await chrome.tabs.query({ url: ['*://*.linkedin.com/*'] });
    if (!tabs || tabs.length === 0) {
      // Provide explicit success with guidance when no LinkedIn tabs are open
      await chrome.storage.local.set({ detectedAccounts: Object.fromEntries(detectedLinkedInAccounts) });
      return { success: true, accounts: [], count: 0, added: 0, results: [], message: 'No LinkedIn tabs open' };
    }
    const results = [];
    const detections = [];

    for (const t of tabs || []) {
      try {
        // Ensure content script is present; inject if necessary
        try {
          await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content_linkedin.js'] });
        } catch (injErr) {
          // Ignore injection errors; may already be loaded or CSP blocked
          console.warn('⚠️ Content script injection skipped/failed:', injErr && (injErr.message || injErr));
        }

        const res = await chrome.tabs.sendMessage(t.id, { action: 'getLoginStatus', type: 'getLoginStatus' });
        const info = res?.user || {};
        const key = info.email || info.profileUrl || info.name || `${t.id}-${Date.now()}`;
        const detected = {
          name: info.name || 'Unknown',
          email: info.email || null,
          profileUrl: info.profileUrl || t.url,
          tabId: t.id,
          url: t.url,
          ts: Date.now()
        };
        detectedLinkedInAccounts.set(key, detected);
        detections.push(detected);

        // Auto-collect cookies from the detected LinkedIn tab
        let collected;
        try {
          collected = await collectLinkedInCookies(t.id);
        } catch (collectErr) {
          results.push({ detected, collected: false, error: String(collectErr.message || collectErr) });
          continue;
        }

        // Auto-save account to backend if token is available; otherwise store locally
        if (token) {
          try {
            const saveRes = await handleSaveAccount(collected.cookies, detected.name);
            results.push({ detected, collected: true, saved: true, accountId: saveRes.accountId || null });
          } catch (saveErr) {
            results.push({ detected, collected: true, saved: false, error: String(saveErr.message || saveErr) });
          }
        } else {
          try {
            const localId = `${detected.email || detected.name || 'account'}-${Date.now()}`;
            managedAccounts.set(String(localId), {
              id: localId,
              account_name: detected.name,
              email: detected.email || null,
              profileUrl: detected.profileUrl || detected.url || null
            });
            await chrome.storage.local.set({ managedAccounts: Object.fromEntries(managedAccounts) });
            results.push({ detected, collected: true, saved: false, local: true, accountId: localId });
          } catch (localErr) {
            results.push({ detected, collected: true, saved: false, error: String(localErr.message || localErr) });
          }
        }
      } catch (e) {
        // Retry once after injection
        try {
          const res2 = await chrome.tabs.sendMessage(t.id, { action: 'getLoginStatus', type: 'getLoginStatus' });
          const info2 = res2?.user || {};
          const key2 = info2.email || info2.profileUrl || info2.name || `${t.id}-${Date.now()}`;
          const detected2 = {
            name: info2.name || 'Unknown',
            email: info2.email || null,
            profileUrl: info2.profileUrl || t.url,
            tabId: t.id,
            url: t.url,
            ts: Date.now()
          };
          detectedLinkedInAccounts.set(key2, detected2);
          detections.push(detected2);

          let collected2;
          try { collected2 = await collectLinkedInCookies(t.id); } catch {}
          if (collected2) {
            if (token) {
              try {
                const saveRes2 = await handleSaveAccount(collected2.cookies, detected2.name);
                results.push({ detected: detected2, collected: true, saved: true, accountId: saveRes2.accountId || null });
              } catch (saveErr2) {
                results.push({ detected: detected2, collected: true, saved: false, error: String(saveErr2.message || saveErr2) });
              }
            } else {
              const localId2 = `${detected2.email || detected2.name || 'account'}-${Date.now()}`;
              managedAccounts.set(String(localId2), {
                id: localId2,
                account_name: detected2.name,
                email: detected2.email || null,
                profileUrl: detected2.profileUrl || detected2.url || null
              });
              await chrome.storage.local.set({ managedAccounts: Object.fromEntries(managedAccounts) });
              results.push({ detected: detected2, collected: true, saved: false, local: true, accountId: localId2 });
            }
          } else {
            results.push({ tabId: t?.id || null, url: t?.url || null, error: 'Content script not loaded' });
          }
        } catch (e2) {
          // Record error for visibility after retry
          results.push({ tabId: t?.id || null, url: t?.url || null, error: String(e2.message || e2) });
        }
      }
    }

    await chrome.storage.local.set({ detectedAccounts: Object.fromEntries(detectedLinkedInAccounts) });
    // Opportunistic flush again in case content scripts queued during detection
    try { await flushPendingCookiePayloads(); } catch (_) { /* best effort */ }

  const added = results.filter(r => r.saved === true).length;
  return { success: true, accounts: detections, count: detections.length, added, results };
  } catch (err) {
    // Return soft success on detection errors so popup can gracefully fallback
    return {
      success: true,
      message: 'Detection completed with errors',
      error: String(err.message || err),
      accounts: [],
      count: 0,
      added: 0,
      results: []
    };
  }
}
async function addAccount(accountData) {
  try {
    if (!authToken) throw new Error('Not authenticated');
    const stored = await chrome.storage.local.get(['latestCookies']);
    const defaultCookies = stored.latestCookies?.cookies || [];
    const payload = accountData || {};
    const account_name = payload.account_name || payload.name || 'LinkedIn Account';
    const email = payload.email || null;
    const cookies = payload.cookies || payload.cookies_json || defaultCookies;
    if (!Array.isArray(cookies) || cookies.length === 0) throw new Error('Cookies are required to add account');
    const response = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ account_name, email, cookies_json: cookies })
    });
    const data = await response.json();
    if (response.ok && (data.success || data.ok)) {
      const accountId = data.accountId || data?.data?.id || data?.id;
      managedAccounts.set(String(accountId), { id: accountId, account_name, email });
      await chrome.storage.local.set({ managedAccounts: Object.fromEntries(managedAccounts) });
      return { success: true, accountId };
    }
    throw new Error(data.message || 'Failed to add account');
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}
async function updateAccount(accountId, updateData) {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    if (!accountId) throw new Error('accountId is required');
    const response = await fetch(`${API_BASE_URL}/api/extension/accounts/${accountId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updateData || {})
    });
    const data = await response.json();
    if (response.ok && (data.success || data.ok)) {
      const updated = data.account || data.data || { id: accountId, ...(updateData || {}) };
      managedAccounts.set(String(accountId), updated);
      await chrome.storage.local.set({ managedAccounts: Object.fromEntries(managedAccounts) });
      return { success: true, account: updated };
    }
    throw new Error(data.message || 'Failed to update account');
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}
async function deleteAccount(accountId) {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    if (!accountId) throw new Error('accountId is required');
    const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && (data.success || data.ok || response.status === 204)) {
      managedAccounts.delete(String(accountId));
      await chrome.storage.local.set({ managedAccounts: Object.fromEntries(managedAccounts) });
      return { success: true };
    }
    throw new Error(data.message || 'Failed to delete account');
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}
async function handleLinkedInAccountDetected(payload, tab) {
  try {
    const info = payload?.accountInfo || payload || {};
    const key = info.email || info.profileUrl || info.name || `${tab?.id || 'tab'}-${Date.now()}`;
    const detected = {
      name: info.name || 'Unknown',
      email: info.email || null,
      profileUrl: info.profileUrl || tab?.url || null,
      sourceTabId: tab?.id || null,
      sourceUrl: tab?.url || null,
      ts: Date.now()
    };
    detectedLinkedInAccounts.set(key, detected);
    await chrome.storage.local.set({ detectedAccounts: Object.fromEntries(detectedLinkedInAccounts) });
    try {
      await chrome.runtime.sendMessage({ action: 'accountDetected', account: detected, count: detectedLinkedInAccounts.size });
    } catch { /* popup may not be open */ }
    // Automatically collect cookies and save the account (no manual detect needed)
    try {
      const cookiesResult = await collectLinkedInCookies(tab?.id);
      if (cookiesResult && Array.isArray(cookiesResult.cookies) && cookiesResult.cookies.length > 0) {
        try {
          const saveRes = await handleSaveAccount(cookiesResult.cookies, detected.name);
          // Notify UI layers that an account was saved
          try {
            await chrome.runtime.sendMessage({ action: 'accountSaved', account: { ...detected, id: saveRes.accountId || null }, saved: true });
          } catch { /* ignore */ }
        } catch (saveErr) {
          console.warn('⚠️ Auto-save after detection failed:', saveErr && (saveErr.message || saveErr));
          try {
            await chrome.runtime.sendMessage({ action: 'accountSaved', account: detected, saved: false, error: String(saveErr.message || saveErr) });
          } catch { /* ignore */ }
        }
      } else {
        console.warn('⚠️ No cookies collected during auto-save after detection');
      }
    } catch (collectErr) {
      console.warn('⚠️ Cookie collection failed during auto-save:', collectErr && (collectErr.message || collectErr));
    }
    return { success: true, detectedCount: detectedLinkedInAccounts.size };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}
async function handleScralyticsLoginStatus(payload) {
  try {
    const status = payload || {};
    isLoggedIn = !!status.isLoggedIn;
    const incomingToken = status.token || status.authToken;
    const incomingBase = status.apiBaseUrl || status.baseUrl || status.base;
    if (incomingToken) {
      authToken = incomingToken;
      // Persist token and optional API base URL for popup usage
      const toStore = { authToken, isLoggedIn, userInfo: status.user || null };
      if (incomingBase && typeof incomingBase === 'string') {
        API_BASE_URL = incomingBase;
        toStore.apiBaseUrl = incomingBase;
      }
      await chrome.storage.local.set(toStore);
    } else if (!isLoggedIn) {
      await chrome.storage.local.remove(['authToken', 'userInfo']);
      authToken = null;
    }
    try {
      await chrome.runtime.sendMessage({ action: 'loginStatusChanged', isLoggedIn });
    } catch { /* popup may not be open */ }
    return { success: true, isLoggedIn };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}
