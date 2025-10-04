/**
 * LinkedIn Automation Extension - Popup Script
 * Handles user interface interactions and communication with background script
 */

(function() {
  'use strict';
  
  // Backend base URL with safe defaults (prefer backend port)
  let API_BASE_URL = (typeof globalThis !== 'undefined' && typeof globalThis.API_BASE_URL !== 'undefined') ? globalThis.API_BASE_URL : 'http://localhost:5001';

  // Detect whether running inside a Chrome extension context
  function isExtensionContextAvailable() {
    try {
      return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // Preview-mode auth helpers
  function getStoredToken() {
    try { return localStorage.getItem('authToken') || null; } catch { return null; }
  }
  function setStoredToken(token, base, user) {
    try {
      localStorage.setItem('authToken', token || '');
      if (base) localStorage.setItem('apiBaseUrl', base);
      if (user) localStorage.setItem('userInfo', JSON.stringify(user));
    } catch {}
  }
  // Unified token/base resolver (extension or preview)
  async function getTokenAndBase() {
    if (isExtensionContextAvailable()) {
      try {
        const store = await chrome.storage.local.get(['authToken', 'apiBaseUrl']);
        const token = store?.authToken || null;
        const base = store?.apiBaseUrl || API_BASE_URL;
        return { token, base };
      } catch (_) {
        return { token: null, base: API_BASE_URL };
      }
    } else {
      let base = API_BASE_URL;
      try { base = localStorage.getItem('apiBaseUrl') || API_BASE_URL; } catch (_) {}
      return { token: getStoredToken(), base };
    }
  }
  function clearStoredToken() {
    try { localStorage.removeItem('authToken'); localStorage.removeItem('apiBaseUrl'); localStorage.removeItem('userInfo'); } catch {}
  }
  function getApiBases() {
    let storedBase = null;
    try { storedBase = localStorage.getItem('apiBaseUrl') || null; } catch (_) {}
    const bases = [
      storedBase,
      API_BASE_URL,
      'http://localhost:3001',
      'http://localhost:5000',
      'http://localhost:5001',
      'http://localhost:5002',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:5001',
      'http://127.0.0.1:5002'
    ].filter(Boolean);
    return Array.from(new Set(bases));
  }
  async function directLoginFallback(email, password) {
    const uniqueBases = getApiBases();
    let lastErrMsg = 'Failed to connect to server';
const paths = ['/api/login'];
    for (const base of uniqueBases) {
      for (const path of paths) {
        let response; let data = {};
        try {
          response = await fetch(`${base}${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
        } catch (networkErr) { lastErrMsg = networkErr?.message || 'Failed to connect to server'; continue; }
        try { data = await response.json(); }
        catch {
          try { const text = await response.text(); data = { message: (text && text.slice(0, 200)) || response.statusText }; }
          catch { data = { message: response.statusText }; }
        }
        if (!response.ok) {
          let msg = data?.message || data?.error || '';
          if (response.status === 401 || response.status === 400) { msg = msg || 'Invalid email or password'; throw new Error(msg); }
          else if (response.status === 404) { lastErrMsg = msg || `Login endpoint not found (${response.status})`; continue; }
          else if (response.status >= 500) { lastErrMsg = msg || 'Server error. Please try again later.'; continue; }
          else { lastErrMsg = msg || `Login failed (${response.status} ${response.statusText})`; continue; }
        }
        const token = (data && data.data && (data.data.accessToken || data.data.token || data.data.access_token)) || data.accessToken || data.token || data.access_token;
        const user = (data && data.data && data.data.user) || data.user || null;
        if (!token) { lastErrMsg = data?.message || data?.error || 'Unexpected server response (token missing)'; continue; }
        API_BASE_URL = base;
        setStoredToken(token, base, user || null);
        return { success: true, token, user: user || null, base };
      }
    }
    throw new Error(lastErrMsg);
  }
  
  // Account Management UI Elements
  const accountsSection = document.getElementById('accounts-section');
  const accountsList = document.getElementById('accounts-list');
  const addAccountBtn = document.getElementById('add-account-btn');
  const refreshAccountsBtn = document.getElementById('refresh-accounts-btn');
  const accountModal = document.getElementById('account-modal');
  const accountForm = document.getElementById('account-form');
  const closeModalBtn = document.getElementById('close-modal');
  const saveAccountBtn = document.getElementById('save-account');

  // Account management state
  let currentAccounts = [];
  let editingAccountId = null;
  
  // State variables
  let isLoggedIn = false;
  let currentAccount = null;
  let collectedCookies = null;
  let isValidated = false;
  let savedAccountId = null;
  
  // DOM elements
  const elements = {
    // Status elements
    connectionStatus: document.getElementById('connectionStatus'),
    connectionText: document.getElementById('connectionText'),
    connectionDetails: document.getElementById('connectionDetails'),
    linkedinStatus: document.getElementById('linkedinStatus'),
    linkedinText: document.getElementById('linkedinText'),
    linkedinDetails: document.getElementById('linkedinDetails'),
    
    // Message elements
    errorMessage: document.getElementById('errorMessage'),
    successMessage: document.getElementById('successMessage'),
    
    // Section elements
    loginSection: document.getElementById('loginSection'),
    mainSection: document.getElementById('mainSection'),
    accountInfo: document.getElementById('accountInfo'),
    
    // Account info elements
    accountName: document.getElementById('accountName'),
    accountDetails: document.getElementById('accountDetails'),
    
    // Form elements
    loginForm: document.getElementById('loginForm'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    
    // Button elements
    loginBtn: document.getElementById('loginBtn'),
    loginBtnText: document.getElementById('loginBtnText'),
    loginSpinner: document.getElementById('loginSpinner'),
    
    collectBtn: document.getElementById('collectBtn'),
    collectBtnText: document.getElementById('collectBtnText'),
    collectSpinner: document.getElementById('collectSpinner'),
    
    collectMultipleBtn: document.getElementById('collectMultipleBtn'),
    collectMultipleBtnText: document.getElementById('collectMultipleBtnText'),
    collectMultipleSpinner: document.getElementById('collectMultipleSpinner'),
    
    validateBtn: document.getElementById('validateBtn'),
    validateBtnText: document.getElementById('validateBtnText'),
    validateSpinner: document.getElementById('validateSpinner'),
    
    validateMultipleBtn: document.getElementById('validateMultipleBtn'),
    validateMultipleBtnText: document.getElementById('validateMultipleBtnText'),
    validateMultipleSpinner: document.getElementById('validateMultipleSpinner'),
    
    saveBtn: document.getElementById('saveBtn'),
    saveBtnText: document.getElementById('saveBtnText'),
    saveSpinner: document.getElementById('saveSpinner'),
    
    saveMultipleBtn: document.getElementById('saveMultipleBtn'),
    saveMultipleBtnText: document.getElementById('saveMultipleBtnText'),
    saveMultipleSpinner: document.getElementById('saveMultipleSpinner'),
    
    scrapingBtn: document.getElementById('scrapingBtn'),
    scrapingBtnText: document.getElementById('scrapingBtnText'),
    scrapingSpinner: document.getElementById('scrapingSpinner'),
    
    logoutBtn: document.getElementById('logoutBtn'),
    openDashboard: document.getElementById('openDashboard')
  };
  
  // Account Management Functions
async function loadAccounts() {
  try {
    if (isExtensionContextAvailable()) {
      try { await chrome.storage.local.get(['authToken', 'apiBaseUrl']); } catch {}
      let response = await chrome.runtime.sendMessage({ type: 'getAccounts' });
      if (!response?.success && /not authenticated/i.test(String(response?.error || ''))) {
        await new Promise(r => setTimeout(r, 250));
        try { await chrome.runtime.sendMessage({ type: 'getAuthStatus' }); } catch {}
        response = await chrome.runtime.sendMessage({ type: 'getAccounts' });
      }
      if (response?.success) {
        currentAccounts = response.accounts || response.data || [];
        renderAccountsList();
        return;
      }
      console.error('Failed to load accounts:', response?.error || 'Unknown error');
      // Fallback to local storage-managed accounts when background path fails
      try {
        const store = await chrome.storage.local.get(['managedAccounts', 'detectedAccounts']);
        const localManaged = store?.managedAccounts ? Object.values(store.managedAccounts) : [];
        const localDetected = store?.detectedAccounts ? Object.values(store.detectedAccounts) : [];
        const combined = [...localManaged, ...localDetected];
        if (combined.length > 0) {
          currentAccounts = combined;
          renderAccountsList();
          return;
        }
      } catch (fallbackErr) {
        console.warn('Local accounts fallback failed:', fallbackErr);
      }
    }

    // Fallback to direct backend in preview mode
    const token = getStoredToken();
    if (!token) {
      console.warn('Not authenticated in preview mode; skipping account load.');
      return;
    }
    // Try extension accounts endpoint first
    let loaded = false;
    try {
      const res1 = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data1 = await res1.json().catch(() => ({ success: false }));
      if (res1.ok && (data1.success || data1.ok)) {
        currentAccounts = data1.accounts || data1.data || [];
        renderAccountsList();
        loaded = true;
      }
    } catch (_) {}

    // Fallback to public available accounts endpoint
    if (!loaded) {
      try {
        const res2 = await fetch(`${API_BASE_URL}/api/accounts`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const data2 = await res2.json().catch(() => ({ success: false }));
        if (res2.ok && (data2.success || data2.ok)) {
          currentAccounts = data2.data || data2.accounts || [];
          renderAccountsList();
          loaded = true;
        } else {
          console.error('Failed to load accounts:', data2?.error || data2?.message || res2.statusText);
        }
      } catch (err) {
        console.error('Accounts load error:', err);
      }
    }
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
}

function renderAccountsList() {
  if (!accountsList) return;
  
  accountsList.innerHTML = '';
  
  if (currentAccounts.length === 0) {
    accountsList.innerHTML = '<div class="no-accounts">No LinkedIn accounts added yet</div>';
    return;
  }
  
  currentAccounts.forEach(account => {
    const accountItem = document.createElement('div');
    accountItem.className = 'account-item';
    accountItem.innerHTML = `
      <div class="account-info">
        <div class="account-name">${account.account_name}</div>
        <div class="account-email">${account.email || 'No email'}</div>
        <div class="account-status ${(typeof account.validation_status === 'string' ? account.validation_status.toLowerCase() : 'unknown')}">${account.validation_status || 'Unknown'}</div>
      </div>
      <div class="account-actions">
        <button class="btn-small validate-btn" data-id="${account.id}">Validate</button>
        <button class="btn-small edit-btn" data-id="${account.id}">Edit</button>
        <button class="btn-small delete-btn" data-id="${account.id}">Delete</button>
      </div>
    `;
    
    // Add event listeners
    const validateBtn = accountItem.querySelector('.validate-btn');
    const editBtn = accountItem.querySelector('.edit-btn');
    const deleteBtn = accountItem.querySelector('.delete-btn');
    
    validateBtn.addEventListener('click', () => validateAccount(account.id));
    editBtn.addEventListener('click', () => editAccount(account));
    deleteBtn.addEventListener('click', () => deleteAccount(account.id));
    
    accountsList.appendChild(accountItem);
  });
}

async function validateAccount(accountId) {
  try {
    // Prefer extension context: collect cookies from active LinkedIn tab, then validate via background
    if (isExtensionContextAvailable()) {
      // Try to collect cookies from the active LinkedIn tab
      let cookies = [];
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('linkedin.com')) {
          showNotification('Open LinkedIn.com in the active tab before validating.', 'warning');
        } else {
          const collectRes = await chrome.runtime.sendMessage({ type: 'collectCookies', tabId: tab.id });
          if (collectRes?.success && Array.isArray(collectRes.cookies) && collectRes.cookies.length > 0) {
            cookies = collectRes.cookies;
          }
        }
      } catch (e) {
        console.warn('Cookie collection for validation failed:', e);
      }

      if (!Array.isArray(cookies) || cookies.length === 0) {
        showNotification('Failed to collect cookies. Please ensure LinkedIn is open and logged in.', 'error');
        return;
      }

      const response = await chrome.runtime.sendMessage({ 
        type: 'validateAccount', 
        cookies 
      });

      if (response?.success) {
        // Optionally update account validation status in backend when accountId is provided
        try {
          if (accountId && typeof accountId !== 'undefined') {
            const statusUpdate = { validation_status: response.isValid ? 'VALID' : 'INVALID', last_validated_at: new Date().toISOString() };
            await chrome.runtime.sendMessage({ type: 'updateAccount', accountId, accountData: statusUpdate });
          }
        } catch (e) {
          console.warn('Failed to update account validation status:', e);
        }
        await loadAccounts();
        showNotification(response.isValid ? 'Account validated successfully' : (response.message || 'Validation failed'), response.isValid ? 'success' : 'error');
      } else {
        showNotification(`Validation failed: ${response?.error || 'Unknown error'}`, 'error');
      }
      return;
    }

    // Preview fallback: use stored cookies (if any) and call backend directly
    const token = getStoredToken();
    if (!token) {
      showNotification('Not authenticated. Please login first.', 'error');
      return;
    }
    let previewCookies = [];
    try {
      const storedRaw = localStorage.getItem('latestCookies');
      if (storedRaw) {
        const stored = JSON.parse(storedRaw);
        previewCookies = stored?.cookies || [];
      }
    } catch (_) {}
    if (!Array.isArray(previewCookies) || previewCookies.length === 0) {
      showNotification('No cookies available. Collect cookies first in extension mode.', 'error');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/extension/validate-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ cookies: previewCookies })
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (res.ok && (data.success || data.ok)) {
      await loadAccounts();
      showNotification(data.isValid ? 'Account validated successfully' : (data.message || 'Validation failed'), data.isValid ? 'success' : 'error');
    } else {
      showNotification(`Validation failed: ${data?.error || data?.message || res.statusText}`, 'error');
    }
  } catch (error) {
    console.error('Error validating account:', error);
    showNotification('Error validating account', 'error');
  }
}

function editAccount(account) {
  editingAccountId = account.id;
  
  // Populate form with account data
  document.getElementById('account-name').value = account.account_name;
  document.getElementById('account-email').value = account.email || '';
  
  // Show modal
  if (accountModal) {
    accountModal.style.display = 'block';
  }
}

async function deleteAccount(accountId) {
  if (!confirm('Are you sure you want to delete this account?')) {
    return;
  }
  
  try {
    // Prefer direct backend deletion with JWT
    const { token, base } = await getTokenAndBase();
    if (token) {
      const res = await fetch(`${base}/api/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        // Remove from UI state immediately
        currentAccounts = Array.isArray(currentAccounts) ? currentAccounts.filter(a => String(a.id) !== String(accountId)) : [];
        renderAccountsList();
        showNotification('Account deleted successfully', 'success');
        return;
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error || data?.message || res.statusText || 'Delete failed';
        showNotification(`Delete failed: ${msg}`, 'error');
        return;
      }
    }

    // Fallback to background route when token missing
    if (isExtensionContextAvailable()) {
      const response = await chrome.runtime.sendMessage({ type: 'deleteAccount', accountId });
      if (response?.success) {
        await loadAccounts();
        showNotification('Account deleted successfully', 'success');
      } else {
        showNotification(`Delete failed: ${response?.error || 'Unknown error'}`, 'error');
      }
    } else {
      showNotification('Not authenticated. Please login to the tool.', 'error');
    }
  } catch (error) {
    console.error('Error deleting account:', error);
    showNotification('Error deleting account', 'error');
  }
}

async function saveAccount() {
  const accountName = document.getElementById('account-name').value.trim();
  const accountEmail = document.getElementById('account-email').value.trim();
  
  if (!accountName) {
    showNotification('Account name is required', 'error');
    return;
  }
  
  try {
    const accountData = {
      account_name: accountName,
      email: accountEmail || null
    };
    
    if (isExtensionContextAvailable()) {
      let response;
      if (editingAccountId) {
        // Update existing account metadata via background
        response = await chrome.runtime.sendMessage({
          type: 'updateAccount',
          accountId: editingAccountId,
          accountData
        });
      } else {
        // Add new account: ensure cookies are present; collect if missing
        let cookies = [];
        try {
          const stored = await chrome.storage.local.get(['latestCookies']);
          cookies = stored?.latestCookies?.cookies || [];
        } catch (_) {}

        if (!Array.isArray(cookies) || cookies.length === 0) {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && tab.url.includes('linkedin.com')) {
              const collectRes = await chrome.runtime.sendMessage({ type: 'collectCookies', tabId: tab.id });
              cookies = collectRes?.cookies || [];
              // Persist for future uses
              if (Array.isArray(cookies) && cookies.length > 0) {
                await chrome.storage.local.set({ latestCookies: { cookies, ts: Date.now(), accountName } });
              }
            }
          } catch (collectErr) {
            console.warn('Cookie collection attempt failed:', collectErr);
          }
        }

        if (!Array.isArray(cookies) || cookies.length === 0) {
          showNotification('Please collect LinkedIn cookies first (open a LinkedIn tab and click Collect).', 'error');
          return;
        }

        // Use the background saveAccount path which handles legacy fallback
        response = await chrome.runtime.sendMessage({
          type: 'saveAccount',
          cookies,
          accountName: accountName
        });
      }
      if (response?.success) {
        closeAccountModal();
        await loadAccounts();
        showNotification(editingAccountId ? 'Account updated successfully' : 'Account added successfully', 'success');
      } else {
        // Local fallback: persist to storage when background save fails (no auth)
        try {
          const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const account = {
            id: localId,
            account_name: accountName,
            cookies_json: cookies,
            email: accountEmail || null,
            profileUrl: null,
            created_at: Date.now()
          };
          const store = await chrome.storage.local.get(['managedAccounts']);
          const bag = store?.managedAccounts || {};
          bag[localId] = account;
          await chrome.storage.local.set({ managedAccounts: bag });
          closeAccountModal();
          await loadAccounts();
          showNotification('Account added locally (no auth)', 'success');
        } catch (localErr) {
          console.error('Local save fallback failed:', localErr);
          showNotification(`Save failed: ${response?.error || 'Unknown error'}`, 'error');
        }
      }
      return;
    }

    // Preview fallback: call backend directly
    const token = getStoredToken();
    if (!token) {
      showNotification('Not authenticated. Please login first.', 'error');
      return;
    }
    let res, data;
    if (editingAccountId) {
      res = await fetch(`${API_BASE_URL}/api/extension/accounts/${editingAccountId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(accountData)
      });
      data = await res.json().catch(() => ({ success: false }));
      if (res.ok && (data.success || data.ok)) {
        closeAccountModal();
        await loadAccounts();
        showNotification('Account updated successfully', 'success');
      } else {
        showNotification(`Save failed: ${data?.error || data?.message || res.statusText}`, 'error');
      }
    } else {
      // Attempt to include cookies if available from previous collection in preview
      let previewCookies = [];
      try {
        const storedRaw = localStorage.getItem('latestCookies');
        if (storedRaw) {
          const stored = JSON.parse(storedRaw);
          previewCookies = stored?.cookies || [];
        }
      } catch (_) {}
      const payload = { ...accountData };
      if (Array.isArray(previewCookies) && previewCookies.length > 0) {
        payload.cookies = previewCookies;
      }
      res = await fetch(`${API_BASE_URL}/api/extension/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      data = await res.json().catch(() => ({ success: false }));
      if (res.ok && (data.success || data.ok)) {
        closeAccountModal();
        await loadAccounts();
        showNotification('Account added successfully. If list is empty, open LinkedIn and refresh.', 'success');
      } else {
        showNotification(`Save failed: ${data?.error || data?.message || res.statusText}`, 'error');
      }
    }
  } catch (error) {
    console.error('Error saving account:', error);
    showNotification('Error saving account', 'error');
  }
}

function closeAccountModal() {
  if (accountModal) {
    accountModal.style.display = 'none';
  }
  
  // Reset form
  if (accountForm) {
    accountForm.reset();
  }
  
  editingAccountId = null;
}

async function refreshAccounts() {
  try {
    if (isExtensionContextAvailable()) {
      // Detect accounts in open LinkedIn tabs, sync to backend, then fetch list
      let added = 0;
      let detectRes = null;
      try {
        detectRes = await chrome.runtime.sendMessage({ type: 'detectLinkedInAccounts' });
        if (!detectRes?.success && /not authenticated/i.test(String(detectRes?.error || ''))) {
          await new Promise(r => setTimeout(r, 250));
          try { await chrome.runtime.sendMessage({ type: 'getAuthStatus' }); } catch {}
          detectRes = await chrome.runtime.sendMessage({ type: 'detectLinkedInAccounts' });
        }
        if (detectRes?.success) { added = detectRes.added || 0; }
      } catch (e) {
        console.warn('Detect accounts error:', e);
      }
      try { await chrome.runtime.sendMessage({ type: 'syncAccounts' }); } catch (e) { console.warn('Sync accounts error:', e); }
      let listRes = await chrome.runtime.sendMessage({ type: 'getAccounts' });
      if (!listRes?.success && /not authenticated/i.test(String(listRes?.error || ''))) {
        await new Promise(r => setTimeout(r, 250));
        try { await chrome.runtime.sendMessage({ type: 'getAuthStatus' }); } catch {}
        listRes = await chrome.runtime.sendMessage({ type: 'getAccounts' });
      }
      if (listRes?.success) {
        currentAccounts = listRes.accounts || listRes.data || [];
        renderAccountsList();
        showNotification(`Accounts refreshed successfully${added ? ` (added ${added})` : ''}`, 'success');
      } else {
        // Local fallback: read accounts from storage and treat as success if any
        try {
          const store = await chrome.storage.local.get(['managedAccounts', 'detectedAccounts']);
          const localManaged = store?.managedAccounts ? Object.values(store.managedAccounts) : [];
          const localDetected = store?.detectedAccounts ? Object.values(store.detectedAccounts) : [];
          const combined = [...localManaged, ...localDetected];
          if (combined.length > 0) {
            currentAccounts = combined;
            renderAccountsList();
            showNotification(`Accounts refreshed from local storage${added ? ` (added ${added})` : ''}`, 'success');
          } else {
            const noTabs = Array.isArray(detectRes?.accounts) && detectRes.accounts.length === 0;
            const contentScriptErrors = Array.isArray(detectRes?.results) ? detectRes.results.filter(r => /content script not loaded/i.test(String(r.error || ''))).length : 0;
            const isInvalidation = /extension context invalidated|receiving end does not exist|could not establish connection/i.test(String(detectRes?.error || listRes?.error || ''));
            const errMsg = noTabs
              ? 'No LinkedIn tabs open. Open https://www.linkedin.com/feed/ and refresh.'
              : (contentScriptErrors > 0
                  ? 'Content script not loaded. Refresh LinkedIn tab(s) and try again.'
                  : (isInvalidation
                      ? 'Extension is reconnecting. Refresh LinkedIn tab(s) and retry.'
                      : 'Detection incomplete. Open a LinkedIn tab and press Refresh.'));
            showNotification(`Refresh incomplete: ${errMsg}`, 'warning');
          }
        } catch (fallbackErr) {
          const noTabs = Array.isArray(detectRes?.accounts) && detectRes.accounts.length === 0;
          const contentScriptErrors = Array.isArray(detectRes?.results) ? detectRes.results.filter(r => /content script not loaded/i.test(String(r.error || ''))).length : 0;
          const isInvalidation = /extension context invalidated|receiving end does not exist|could not establish connection/i.test(String(detectRes?.error || listRes?.error || ''));
          const errMsg = noTabs
            ? 'No LinkedIn tabs open. Open https://www.linkedin.com/feed/ and refresh.'
            : (contentScriptErrors > 0
                ? 'Content script not loaded. Refresh LinkedIn tab(s) and try again.'
                : (isInvalidation
                    ? 'Extension is reconnecting. Refresh LinkedIn tab(s) and retry.'
                    : 'Detection incomplete. Open a LinkedIn tab and press Refresh.'));
          console.warn('Local refresh fallback failed:', fallbackErr);
          showNotification(`Refresh incomplete: ${errMsg}`, 'warning');
        }
      }
      return;
    }
    // Fallback: preview mode just reloads from backend
    await loadAccounts();
  } catch (error) {
    console.error('Error refreshing accounts:', error);
    showNotification('Error refreshing accounts', 'error');
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}
  async function initialize() {
    console.log('🚀 Popup initializing...');
    
    try {
      // If not running as an extension (e.g., local preview), avoid using chrome APIs
      const hasExtension = isExtensionContextAvailable();
      if (!hasExtension) {
        console.warn('⚠️ Extension context unavailable (preview mode). Skipping runtime messaging.');
      }
      
      // Auth check against backend; then proceed to accounts
      await checkAuthStatus();
      if (isLoggedIn) {
        await refreshAccounts();
        await loadAccounts();
      }
      
      // Setup event listeners
      setupEventListeners();
      
      // Listen for authentication status changes from background script
      if (hasExtension && chrome?.runtime?.onMessage?.addListener) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.action === 'authStatusChanged') {
            console.log('🔄 Auth status changed:', message);
            // Keep UI active regardless of auth; refresh accounts opportunistically
            isLoggedIn = true;
            updateUI();
            checkLinkedInStatus();
            refreshAccounts();
            loadAccounts();
          }
        });
      } else {
        console.warn('Runtime messaging unavailable; skipping onMessage listener registration.');
      }
      
      // Always check LinkedIn status
      await checkLinkedInStatus();
      
      console.log('✅ Popup initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing popup:', error);
      showError('Failed to initialize extension: ' + error.message);
    }
  }
  
  // Check authentication status with background script
  async function checkAuthStatus() {
    try {
      const { token, base } = await getTokenAndBase();
      API_BASE_URL = base || API_BASE_URL;

      if (!token) {
        // No token: prompt user to login in the tool
        isLoggedIn = false;
        updateConnectionStatus('warning', 'Please login to the tool', 'Click Dashboard to open and login.');
        // Keep main section hidden until authenticated
        elements.mainSection.classList.add('hidden');
        elements.loginSection.classList.add('active');
        return;
      }

      // Verify token with backend and preload dashboard stats
      const res = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        isLoggedIn = true;
        updateConnectionStatus('connected', 'Extension Ready', 'Authenticated via tool backend');
        showMainSection();

        // Optionally fetch dashboard stats for UI (if needed)
        try {
          const statsRes = await fetch(`${API_BASE_URL}/api/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!statsRes.ok) {
            const errText = await statsRes.text().catch(() => '');
            console.warn('Dashboard stats not available:', statsRes.status, errText);
          }
        } catch (statsErr) {
          console.warn('Dashboard stats fetch error:', statsErr?.message || statsErr);
        }
      } else {
        isLoggedIn = false;
        const data = await res.json().catch(() => ({}));
        const msg = data?.error || data?.message || 'Authentication failed';
        updateConnectionStatus('warning', 'Please login to the tool', msg);
        elements.mainSection.classList.add('hidden');
        elements.loginSection.classList.add('active');
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      isLoggedIn = false;
      updateConnectionStatus('error', 'Connection Failed', 'Cannot connect to backend server');
      elements.mainSection.classList.add('hidden');
      elements.loginSection.classList.add('active');
    }
  }
  
  // Check LinkedIn status
  async function checkLinkedInStatus() {
    try {
      updateLinkedInStatus('checking', 'Checking LinkedIn...', 'Detecting login status...');
      
      // Guard for preview mode where chrome APIs are unavailable
      if (!isExtensionContextAvailable()) {
        updateLinkedInStatus('warning', 'Preview Mode', 'Open the extension popup in Chrome to auto-detect LinkedIn.');
        if (elements.collectBtn) elements.collectBtn.disabled = false;
        return;
      }

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        updateLinkedInStatus('warning', 'No Active Tab', 'Please open a tab first');
        return;
      }
      
      if (!tab.url.includes('linkedin.com')) {
        updateLinkedInStatus('warning', 'Not on LinkedIn', 'Please navigate to LinkedIn.com');
        return;
      }
      
      try {
        // Send message to content script with timeout
        const response = await Promise.race([
          chrome.tabs.sendMessage(tab.id, { action: 'getLoginStatus' }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Content script timeout')), 5000)
          )
        ]);
        
        if (response && response.isLoggedIn) {
          currentAccount = response.user;
          updateLinkedInStatus('connected', 'LinkedIn Logged In', `Detected: ${currentAccount?.name || 'LinkedIn User'}`);
          showAccountInfo();
          elements.collectBtn.disabled = false;
        } else {
          updateLinkedInStatus('error', 'Not Logged In', 'Please login to LinkedIn first');
          hideAccountInfo();
        }
      } catch (contentScriptError) {
        console.warn('Content script not available:', contentScriptError);
        // Fallback: assume LinkedIn is accessible and let user try
        updateLinkedInStatus('warning', 'LinkedIn Detected', 'Content script not loaded - refresh page if needed');
        elements.collectBtn.disabled = false;
      }
    } catch (error) {
      console.error('❌ LinkedIn check failed:', error);
      updateLinkedInStatus('warning', 'Detection Failed', 'Unable to detect LinkedIn status');
    }
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Login disabled: extension no longer handles authentication
    // if (elements.loginForm) elements.loginForm.addEventListener('submit', handleLogin);
    
    // Action buttons
    if (elements.collectBtn) elements.collectBtn.addEventListener('click', handleCollectCookies);
    if (elements.collectMultipleBtn) elements.collectMultipleBtn.addEventListener('click', handleCollectMultipleCookies);
    if (elements.validateBtn) elements.validateBtn.addEventListener('click', handleValidateAccount);
    if (elements.saveBtn) elements.saveBtn.addEventListener('click', handleSaveAccount);
    // Wire up multi-action buttons
    if (elements.validateMultipleBtn) elements.validateMultipleBtn.addEventListener('click', handleValidateMultipleAccounts);
    if (elements.saveMultipleBtn) elements.saveMultipleBtn.addEventListener('click', handleSaveMultipleAccounts);
    if (elements.scrapingBtn) elements.scrapingBtn.addEventListener('click', handleStartScraping);
    
    // Navigation buttons
    // Logout disabled: authentication is managed in the main tool
    // if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', handleLogout);
    if (elements.openDashboard) elements.openDashboard.addEventListener('click', handleOpenDashboard);
    
    // Account management event listeners
    if (addAccountBtn) {
      addAccountBtn.addEventListener('click', () => {
        editingAccountId = null;
        if (accountModal) {
          accountModal.style.display = 'block';
        }
      });
    }
    
    if (refreshAccountsBtn) {
      refreshAccountsBtn.addEventListener('click', refreshAccounts);
    }
    
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', closeAccountModal);
    }
    
    if (saveAccountBtn) {
      saveAccountBtn.addEventListener('click', saveAccount);
    }
    
    // Close modal when clicking outside
    if (accountModal) {
      accountModal.addEventListener('click', (e) => {
        if (e.target === accountModal) {
          closeAccountModal();
        }
      });
    }
  }
  
  // Handle login
  async function handleLogin(event) {
    event.preventDefault();
    
    const email = elements.email.value.trim();
    const password = elements.password.value.trim();
    
    if (!email || !password) {
      showError('Please enter both email and password');
      return;
    }
    
    setButtonLoading(elements.loginBtn, elements.loginBtnText, elements.loginSpinner, true);
    hideMessages();

    // Perform the login request with extension or direct backend fallback
    try {
      let loginResult = null;
      if (isExtensionContextAvailable()) {
        const response = await sendMessage({
          type: 'login',
          credentials: { email, password }
        });
        if (!response || (response.success !== true && !response.token)) {
          const rawErr = response?.error || response?.message || 'Login failed';
          throw new Error(String(rawErr));
        }
        const token = response.token || (response.data && response.data.token);
        const user = response.user || (response.data && response.data.user) || null;
        if (token) setStoredToken(token, response.apiBaseUrl || API_BASE_URL, user);
        loginResult = { success: true, token, user };
      } else {
        loginResult = await directLoginFallback(email, password);
      }
      isLoggedIn = true;
      showSuccess('Login successful!');
      showMainSection();
    } catch (error) {
      console.error('❌ Login failed:', error);
      // If extension context or network issues, try direct backend fallback before surfacing error
      const msgStr = String(error?.message || '');
      const looksLikeContextError = /extension context invalidated|receiving end does not exist|could not establish connection/i.test(msgStr);
      const looksLikeNetworkError = /failed to fetch|networkerror|cors|TypeError/i.test(msgStr);
      if (looksLikeContextError || looksLikeNetworkError) {
        try {
          const fallback = await directLoginFallback(email, password);
          isLoggedIn = true;
          showSuccess('Login successful!');
          showMainSection();
        } catch (fallbackErr) {
          let msg = fallbackErr?.message ? String(fallbackErr.message) : 'Unable to login. Check credentials or server connection.';
          msg = msg.replace(/^Error:\s*/i, '');
          showError('Login failed: ' + msg);
          setButtonLoading(elements.loginBtn, elements.loginBtnText, elements.loginSpinner, false);
          return;
        }
      } else {
        let msg = error?.message ? String(error.message) : 'Login failed';
        msg = msg.replace(/^Error:\s*/i, '');
        if (/login successful/i.test(msg)) msg = 'Login failed';
        if (msg.trim().toLowerCase() === 'login failed') {
          msg = 'Unable to login. Check credentials or server connection.';
        }
        showError('Login failed: ' + msg);
        setButtonLoading(elements.loginBtn, elements.loginBtnText, elements.loginSpinner, false);
        return; // Stop if login itself failed
      }
    }

    // Post-login steps run separately so they don't masquerade as login failures
    try {
      await checkLinkedInStatus();
      await loadAccounts();
    } catch (postError) {
      console.warn('⚠️ Post-login step failed:', postError);
      // Keep login success visible; surface a secondary warning
      showError('Some post-login steps failed: ' + postError.message);
    } finally {
      setButtonLoading(elements.loginBtn, elements.loginBtnText, elements.loginSpinner, false);
    }
  }
  
  // Handle collect cookies
  async function handleCollectCookies() {
    try {
      setButtonLoading(elements.collectBtn, elements.collectBtnText, elements.collectSpinner, true);
      hideMessages();
      
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }
      
      if (!tab.url.includes('linkedin.com')) {
        throw new Error('Please navigate to LinkedIn.com first');
      }
      
      const response = await sendMessage({ 
        type: 'collectCookies',
        tabId: tab.id
      });
      
      if (response && response.success) {
        collectedCookies = response.cookies;
        currentAccount = {
          ...currentAccount,
          name: response.accountName,
          cookies: response.cookies,
          tabId: response.tabId
        };
        
        showSuccess(`Cookies collected successfully! (${response.cookieCount} cookies)`);
        elements.validateBtn.disabled = false;
        
        // Update account info
        showAccountInfo();
      } else {
        throw new Error(response?.error || 'Failed to collect cookies');
      }
    } catch (error) {
      console.error('❌ Cookie collection failed:', error);
      showError('Cookie collection failed: ' + error.message);
    } finally {
      setButtonLoading(elements.collectBtn, elements.collectBtnText, elements.collectSpinner, false);
    }
  }
  
  // Handle collect multiple cookies
  async function handleCollectMultipleCookies() {
    try {
      setButtonLoading(elements.collectMultipleBtn, elements.collectMultipleBtnText, elements.collectMultipleSpinner, true);
      hideMessages();
      
      // Get all LinkedIn tabs
      const linkedinTabs = await chrome.tabs.query({
        url: '*://*.linkedin.com/*'
      });
      
      if (linkedinTabs.length === 0) {
        throw new Error('No LinkedIn tabs found. Please open LinkedIn.com in multiple tabs for different accounts.');
      }
      
      // Create account objects for each tab
      const accounts = linkedinTabs.map((tab, index) => ({
        name: `Account ${index + 1}`,
        tabId: tab.id,
        url: tab.url
      }));
      
      const response = await sendMessage({ 
        action: 'collectMultipleCookies',
        accounts: accounts
      });
      
      if (response.success) {
        const data = response.data || response;
        const { successful, failed, total } = data;
        
        if (successful.length > 0) {
          showSuccess(`Successfully collected cookies from ${successful.length} of ${total} accounts!`);
          
          // Store multiple accounts
          window.multipleAccounts = successful;
          
          // Enable batch operations
          elements.validateMultipleBtn.disabled = false;
          elements.saveMultipleBtn.disabled = false;
          
          // Update UI to show multiple accounts
          showMultipleAccountsInfo(successful);
        } else {
          throw new Error('Failed to collect cookies from any account');
        }
        
        if (failed.length > 0) {
          console.warn('Some accounts failed:', failed);
          showError(`Warning: ${failed.length} accounts failed. Check console for details.`);
        }
      } else {
        throw new Error(response.error || 'Failed to collect multiple cookies');
      }
    } catch (error) {
      console.error('❌ Multiple cookie collection failed:', error);
      showError('Multiple cookie collection failed: ' + error.message);
    } finally {
      setButtonLoading(elements.collectMultipleBtn, elements.collectMultipleBtnText, elements.collectMultipleSpinner, false);
    }
  }
  
  // Handle validate account
  async function handleValidateAccount() {
    // Fallback: if no in-memory cookies, try latest persisted ones
    if (!collectedCookies) {
      try {
        const store = await chrome.storage.local.get(['latestCookies']);
        if (store?.latestCookies?.cookies && Array.isArray(store.latestCookies.cookies)) {
          collectedCookies = store.latestCookies.cookies;
          currentAccount = { name: store.latestCookies.accountName || 'LinkedIn Account' };
        }
      } catch (_) { /* ignore */ }
    }
    if (!collectedCookies) {
      showError('Please collect cookies first');
      return;
    }
    
    try {
      setButtonLoading(elements.validateBtn, elements.validateBtnText, elements.validateSpinner, true);
      hideMessages();
      
      const response = await sendMessage({
        type: 'validateAccount',
        cookies: collectedCookies
      });
      
      if (response && response.success) {
        if (response.isValid) {
          isValidated = true;
          showSuccess('Account validation successful! Cookies are valid.');
          elements.saveBtn.disabled = false;
          // Enable batch save when multiple accounts are present
          if (Array.isArray(window.multipleAccounts) && window.multipleAccounts.length > 0) {
            elements.saveMultipleBtn.disabled = false;
          }
        } else {
          showError('Account validation failed: ' + (response.message || 'Invalid cookies'));
        }
      } else {
        throw new Error(response?.error || 'Validation failed');
      }
    } catch (error) {
      console.error('❌ Validation failed:', error);
      showError('Validation failed: ' + error.message);
    } finally {
      setButtonLoading(elements.validateBtn, elements.validateBtnText, elements.validateSpinner, false);
    }
  }
  
  // Handle save account
  async function handleSaveAccount() {
    // Fallback to latest persisted cookies when memory is empty
    if (!collectedCookies) {
      try {
        const store = await chrome.storage.local.get(['latestCookies']);
        if (store?.latestCookies?.cookies && Array.isArray(store.latestCookies.cookies)) {
          collectedCookies = store.latestCookies.cookies;
          currentAccount = { name: store.latestCookies.accountName || 'LinkedIn Account' };
        }
      } catch (_) { /* ignore */ }
    }
    if (!collectedCookies) {
      showError('Please collect cookies first');
      return;
    }
    
    if (!isValidated) {
      showError('Please validate the account first');
      return;
    }
    
    try {
      setButtonLoading(elements.saveBtn, elements.saveBtnText, elements.saveSpinner, true);
      hideMessages();
      
      const response = await sendMessage({
        type: 'saveAccount',
        cookies: collectedCookies,
        accountName: currentAccount?.name || 'LinkedIn Account'
      });
      
      if (response && response.success) {
        savedAccountId = response.accountId;
        showSuccess('Account saved successfully!');
        elements.scrapingBtn.disabled = false;
        await loadAccounts();
        // When saving succeeds and multiple accounts exist, keep Save Multiple enabled
        if (Array.isArray(window.multipleAccounts) && window.multipleAccounts.length > 0) {
          elements.saveMultipleBtn.disabled = false;
        }
      } else {
        throw new Error(response?.error || 'Save failed');
      }
    } catch (error) {
      console.error('❌ Save failed:', error);
      showError('Save failed: ' + error.message);
    } finally {
      setButtonLoading(elements.saveBtn, elements.saveBtnText, elements.saveSpinner, false);
    }
  }

  // Handle validate multiple accounts
  async function handleValidateMultipleAccounts() {
    try {
      setButtonLoading(elements.validateMultipleBtn, elements.validateMultipleBtnText, elements.validateMultipleSpinner, true);
      hideMessages();

      const accounts = Array.isArray(window.multipleAccounts) ? window.multipleAccounts : [];
      if (accounts.length === 0) {
        showError('No collected accounts found. Click "Collect Multiple Cookies" first.');
        return;
      }

      let successCount = 0;
      for (const acc of accounts) {
        const cookies = acc.cookies || acc?.data?.cookies || [];
        if (!Array.isArray(cookies) || cookies.length === 0) continue;
        try {
          const res = await sendMessage({ type: 'validateAccount', cookies });
          if (res?.success && (res.isValid === true || res.valid === true)) {
            acc.isValidated = true;
            successCount++;
          } else {
            acc.isValidated = false;
          }
        } catch (e) {
          acc.isValidated = false;
        }
      }

      if (successCount > 0) {
        showSuccess(`Validated ${successCount} of ${accounts.length} accounts.`);
        elements.saveMultipleBtn.disabled = false;
      } else {
        showError('Validation failed for all accounts.');
      }
    } catch (error) {
      console.error('❌ Validate multiple failed:', error);
      showError('Validate multiple failed: ' + error.message);
    } finally {
      setButtonLoading(elements.validateMultipleBtn, elements.validateMultipleBtnText, elements.validateMultipleSpinner, false);
    }
  }

  // Handle save multiple accounts
  async function handleSaveMultipleAccounts() {
    try {
      setButtonLoading(elements.saveMultipleBtn, elements.saveMultipleBtnText, elements.saveMultipleSpinner, true);
      hideMessages();

      const accounts = Array.isArray(window.multipleAccounts) ? window.multipleAccounts : [];
      if (accounts.length === 0) {
        showError('No collected accounts found. Click "Collect Multiple Cookies" first.');
        return;
      }

      const toSave = accounts.filter((a) => Array.isArray(a.cookies || a?.data?.cookies) && (a.isValidated === true || typeof a.isValidated === 'undefined'));
      if (toSave.length === 0) {
        showError('No validated accounts to save. Validate accounts first.');
        return;
      }

      let savedCount = 0;
      for (const acc of toSave) {
        const name = acc.accountName || acc.name || 'LinkedIn Account';
        const cookies = acc.cookies || acc?.data?.cookies || [];
        try {
          const res = await sendMessage({ type: 'saveAccount', cookies, accountName: name });
          if (res?.success) {
            acc.saved = true;
            acc.accountId = res.accountId || null;
            savedCount++;
          } else {
            acc.saved = false;
          }
        } catch (e) {
          acc.saved = false;
        }
      }

      if (savedCount > 0) {
        showSuccess(`Saved ${savedCount} accounts${savedCount < accounts.length ? `, ${accounts.length - savedCount} failed` : ''}.`);
        elements.scrapingBtn.disabled = false;
        await loadAccounts();
      } else {
        showError('Failed to save any accounts.');
      }
    } catch (error) {
      console.error('❌ Save multiple failed:', error);
      showError('Save multiple failed: ' + error.message);
    } finally {
      setButtonLoading(elements.saveMultipleBtn, elements.saveMultipleBtnText, elements.saveMultipleSpinner, false);
    }
  }
  
  // Handle start scraping
  async function handleStartScraping() {
    if (!savedAccountId) {
      showError('Please save the account first');
      return;
    }
    
    try {
      setButtonLoading(elements.scrapingBtn, elements.scrapingBtnText, elements.scrapingSpinner, true);
      hideMessages();
      
      const response = await sendMessage({
        type: 'startScraping',
        accountId: savedAccountId
      });
      
      if (response && response.success) {
        showSuccess('Scraping started successfully!');
      } else {
        throw new Error(response?.error || 'Failed to start scraping');
      }
    } catch (error) {
      console.error('❌ Start scraping failed:', error);
      showError('Start scraping failed: ' + error.message);
    } finally {
      setButtonLoading(elements.scrapingBtn, elements.scrapingBtnText, elements.scrapingSpinner, false);
    }
  }
  
  // Handle logout
  async function handleLogout() {
    try {
      if (isExtensionContextAvailable()) {
        await sendMessage({ type: 'logout' });
      } else {
        // Preview fallback: clear stored token locally
        clearStoredToken();
      }
      isLoggedIn = false;
      currentAccount = null;
      collectedCookies = null;
      isValidated = false;
      savedAccountId = null;
      
      showLoginSection();
      showSuccess('Logged out successfully');
    } catch (error) {
      console.error('❌ Logout failed:', error);
      showError('Logout failed: ' + error.message);
    }
  }
  
  // Handle open dashboard
  function handleOpenDashboard() {
    chrome.tabs.create({ url: 'http://localhost:3000' });
    window.close();
  }
  
  // UI Helper functions
  function showLoginSection() {
    elements.loginSection.classList.add('active');
    elements.mainSection.classList.add('hidden');
  }
  
  function showMainSection() {
    elements.loginSection.classList.remove('active');
    elements.mainSection.classList.remove('hidden');
  }
  
  function showAccountInfo() {
    if (currentAccount) {
      elements.accountInfo.classList.remove('hidden');
      elements.accountName.textContent = currentAccount.name || 'LinkedIn User';
      elements.accountDetails.textContent = currentAccount.headline || 'LinkedIn Account';
    }
  }
  
  function hideAccountInfo() {
    elements.accountInfo.classList.add('hidden');
  }
  
  function updateConnectionStatus(status, text, details) {
    elements.connectionStatus.className = `status-dot ${status === 'connected' ? 'connected' : status === 'warning' ? 'warning' : ''}`;
    elements.connectionText.textContent = text;
    elements.connectionDetails.textContent = details;
  }
  
  function updateLinkedInStatus(status, text, details) {
    elements.linkedinStatus.className = `status-dot ${status === 'connected' ? 'connected' : status === 'warning' ? 'warning' : ''}`;
    elements.linkedinText.textContent = text;
    elements.linkedinDetails.textContent = details;
  }
  
  function setButtonLoading(button, textElement, spinner, loading) {
    button.disabled = loading;
    if (loading) {
      textElement.classList.add('hidden');
      spinner.classList.remove('hidden');
    } else {
      textElement.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  }
  
  function showError(message) {
    let msg = typeof message === 'string' ? message : String(message?.message || message || '');
    // Strip any leading "Error:" noise to avoid duplication like "Login failed: Error: ..."
    msg = msg.replace(/^Error:\s*/i, '');
    elements.errorMessage.textContent = msg;
    elements.errorMessage.classList.remove('hidden');
    elements.successMessage.classList.add('hidden');
  }
  
  function showSuccess(message) {
    elements.successMessage.textContent = message;
    elements.successMessage.classList.remove('hidden');
    elements.errorMessage.classList.add('hidden');
  }
  
  function hideMessages() {
    elements.errorMessage.classList.add('hidden');
    elements.successMessage.classList.add('hidden');
  }
  
  function showMultipleAccountsInfo(accounts) {
    if (accounts && accounts.length > 0) {
      elements.accountInfo.classList.remove('hidden');
      elements.accountName.textContent = `Multiple Accounts (${accounts.length})`;
      
      // Create a summary of accounts
      const accountNames = accounts.map(acc => acc.accountName || 'Unknown').slice(0, 3);
      let summary = accountNames.join(', ');
      if (accounts.length > 3) {
        summary += ` and ${accounts.length - 3} more`;
      }
      
      elements.accountDetails.textContent = `Collected: ${summary}`;
    } else {
      hideAccountInfo();
    }
  }
  
  // Communication helper with retries and response normalization
  function sendMessage(message, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const trySend = () => {
        attempts += 1;

        // Validate extension context
        if (!chrome.runtime?.id) {
          return reject(new Error('Extension is reconnecting. Refresh the LinkedIn tab and try again.'));
        }

        try {
          chrome.runtime.sendMessage(message, (response) => {
            const lastErr = chrome.runtime.lastError?.message || '';
            if (lastErr) {
              const transient = lastErr.includes('Extension context invalidated') ||
                               lastErr.includes('Receiving end does not exist') ||
                               lastErr.includes('The message port closed') ||
                               lastErr.includes('context invalidated');

              if (transient && attempts < maxRetries) {
                // Lightweight ping before retry
                chrome.runtime.sendMessage({ type: 'PING', ts: Date.now() }, () => {
                  setTimeout(trySend, 300);
                });
                return;
              }
              return reject(new Error(lastErr));
            }

            // Normalize legacy { ok } responses
            if (response && response.ok !== undefined && response.success === undefined) {
              response.success = response.ok;
            }

            // Always resolve; callers decide based on response.success
            resolve(response);
          });
        } catch (err) {
          const msg = String(err?.message || err || 'Extension is reconnecting. Refresh the LinkedIn tab and try again.');
          if (attempts < maxRetries) {
            setTimeout(trySend, 300);
          } else {
            reject(new Error(msg));
          }
        }
      };

      trySend();
    });
  }
  
  // Initialize when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize().catch(error => {
        console.error('❌ Error during popup initialization:', error);
      });
    });
  } else {
    initialize().catch(error => {
      console.error('❌ Error during popup initialization:', error);
    });
  }
  
})();