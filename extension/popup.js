/**
 * LinkedIn Automation Extension - Popup Script
 * Handles user interface interactions and communication with background script
 */

(function() {
  'use strict';
  
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
    const response = await chrome.runtime.sendMessage({ type: 'getAccounts' });
    if (response.success) {
      currentAccounts = response.accounts;
      renderAccountsList();
    } else {
      console.error('Failed to load accounts:', response.error);
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
        <div class="account-status ${account.validation_status.toLowerCase()}">${account.validation_status}</div>
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
    const response = await chrome.runtime.sendMessage({ 
      type: 'validateAccount', 
      accountId 
    });
    
    if (response.success) {
      await loadAccounts(); // Refresh the list
      showNotification('Account validated successfully', 'success');
    } else {
      showNotification(`Validation failed: ${response.error}`, 'error');
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
    const response = await chrome.runtime.sendMessage({ 
      type: 'deleteAccount', 
      accountId 
    });
    
    if (response.success) {
      await loadAccounts(); // Refresh the list
      showNotification('Account deleted successfully', 'success');
    } else {
      showNotification(`Delete failed: ${response.error}`, 'error');
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
    
    let response;
    if (editingAccountId) {
      // Update existing account
      response = await chrome.runtime.sendMessage({
        type: 'updateAccount',
        accountId: editingAccountId,
        updateData: accountData
      });
    } else {
      // Add new account
      response = await chrome.runtime.sendMessage({
        type: 'addAccount',
        accountData
      });
    }
    
    if (response.success) {
      closeAccountModal();
      await loadAccounts(); // Refresh the list
      showNotification(editingAccountId ? 'Account updated successfully' : 'Account added successfully', 'success');
    } else {
      showNotification(`Save failed: ${response.error}`, 'error');
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
    const response = await chrome.runtime.sendMessage({ type: 'syncAccounts' });
    if (response.success) {
      currentAccounts = response.accounts;
      renderAccountsList();
      showNotification('Accounts refreshed successfully', 'success');
    } else {
      showNotification(`Refresh failed: ${response.error}`, 'error');
    }
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
      // Check authentication status
      await checkAuthStatus();
      
      // Load accounts if authenticated
      if (isLoggedIn) {
        await loadAccounts();
      }
      
      // Setup event listeners
      setupEventListeners();
      
      // Listen for authentication status changes from background script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'authStatusChanged') {
          console.log('🔄 Auth status changed:', message);
          isLoggedIn = message.isLoggedIn;
          
          if (message.isLoggedIn && message.userInfo) {
            currentAccount = message.userInfo;
            updateUI();
            checkLinkedInStatus();
            loadAccounts();
          } else {
            currentAccount = null;
            updateUI();
          }
        }
      });
      
      // Check LinkedIn status if logged in
      if (isLoggedIn) {
        await checkLinkedInStatus();
      }
      
      console.log('✅ Popup initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing popup:', error);
      showError('Failed to initialize extension: ' + error.message);
    }
  }
  
  // Check authentication status with background script
  async function checkAuthStatus() {
    try {
      updateConnectionStatus('checking', 'Checking authentication...', 'Connecting to background script...');
      
      const response = await sendMessage({ type: 'getAuthStatus' });
      
      if (response.isLoggedIn) {
        isLoggedIn = true;
        showMainSection();
        updateConnectionStatus('connected', 'Connected to Backend', 'Authentication successful');
      } else {
        isLoggedIn = false;
        showLoginSection();
        updateConnectionStatus('warning', 'Not Authenticated', 'Please login to continue');
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      updateConnectionStatus('error', 'Connection Failed', 'Cannot connect to backend server');
      showError('Failed to connect to backend. Make sure the server is running.');
    }
  }
  
  // Check LinkedIn status
  async function checkLinkedInStatus() {
    try {
      updateLinkedInStatus('checking', 'Checking LinkedIn...', 'Detecting login status...');
      
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
    // Login form
    elements.loginForm.addEventListener('submit', handleLogin);
    
    // Action buttons
    elements.collectBtn.addEventListener('click', handleCollectCookies);
    elements.collectMultipleBtn.addEventListener('click', handleCollectMultipleCookies);
    elements.validateBtn.addEventListener('click', handleValidateAccount);
    elements.saveBtn.addEventListener('click', handleSaveAccount);
    elements.scrapingBtn.addEventListener('click', handleStartScraping);
    
    // Navigation buttons
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.openDashboard.addEventListener('click', handleOpenDashboard);
    
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
    
    try {
      setButtonLoading(elements.loginBtn, elements.loginBtnText, elements.loginSpinner, true);
      hideMessages();
      
      const response = await sendMessage({
        type: 'login',
        credentials: { email, password }
      });
      
      if (response && response.success) {
        isLoggedIn = true;
        showSuccess('Login successful!');
        showMainSection();
        await checkLinkedInStatus();
        await loadAccounts();
      } else {
        throw new Error(response?.error || 'Login failed');
      }
    } catch (error) {
      console.error('❌ Login failed:', error);
      showError('Login failed: ' + error.message);
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
        const { successful, failed, total } = response.data;
        
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
        elements.startScrapingBtn.disabled = false;
        await loadAccounts();
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
      setButtonLoading(elements.startScrapingBtn, elements.startScrapingBtnText, elements.startScrapingSpinner, false);
    }
  }
  
  // Handle logout
  async function handleLogout() {
    try {
      await sendMessage({ type: 'logout' });
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
    elements.errorMessage.textContent = message;
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
  
  // Communication helper with context validation
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      // Check if extension context is valid
      if (!chrome.runtime?.id) {
        reject(new Error('Extension context invalidated. Please reload the extension.'));
        return;
      }
      
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError.message;
            if (error.includes('Extension context invalidated') || error.includes('receiving end does not exist')) {
              reject(new Error('Extension context invalidated. Please reload the extension.'));
            } else {
              reject(new Error(error));
            }
          } else if (response && response.success === false) {
            reject(new Error(response.error || 'Unknown error'));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(new Error('Extension context invalidated. Please reload the extension.'));
      }
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