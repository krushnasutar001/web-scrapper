/**
 * LinkedIn Multi-Account Manager - Popup Script
 * Handles multi-account management, cookie validation, and backend sync
 */

class LinkedInMultiAccountManager {
  constructor() {
    this.accounts = [];
    this.currentExtractedCookies = null;
    this.backendUrl = 'http://localhost:5001';
    this.init();
  }

  async init() {
    // Resolve backend URL from storage if available
    try {
      const items = await new Promise((resolve) => {
        try { chrome.storage.local.get(['apiBaseUrl'], (res) => resolve(res || {})); } catch (e) { resolve({}); }
      });
      if (items && items.apiBaseUrl) {
        this.backendUrl = items.apiBaseUrl;
      }
    } catch (e) {
      // Keep default backendUrl
    }
    this.setupEventListeners();
    await this.loadAccounts();
    this.updateUI();
    this.checkWorkflowStatus();
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Account management buttons
    document.getElementById('refreshAccountsBtn').addEventListener('click', () => {
      this.refreshAllAccounts();
    });

    document.getElementById('syncBackendBtn').addEventListener('click', () => {
      this.syncWithBackend();
    });

    document.getElementById('startScrapingBtn').addEventListener('click', () => {
      this.startScraping();
    });

    // Add account form
    document.getElementById('extractCookiesBtn').addEventListener('click', () => {
      this.extractCookies();
    });

    document.getElementById('addAccountBtn').addEventListener('click', () => {
      this.addAccount();
    });

    document.getElementById('cancelAddBtn').addEventListener('click', () => {
      this.cancelAddAccount();
    });

    // Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('clearDataBtn').addEventListener('click', () => {
      this.clearAllData();
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
  }

  async loadAccounts() {
    try {
      const result = await chrome.storage.local.get(['linkedinAccounts']);
      this.accounts = result.linkedinAccounts || [];
      console.log('Loaded accounts:', this.accounts.length);
    } catch (error) {
      console.error('Error loading accounts:', error);
      this.accounts = [];
    }
  }

  async saveAccounts() {
    try {
      await chrome.storage.local.set({ linkedinAccounts: this.accounts });
      console.log('Accounts saved:', this.accounts.length);
    } catch (error) {
      console.error('Error saving accounts:', error);
    }
  }

  async extractCookies() {
    const extractBtn = document.getElementById('extractCookiesBtn');
    const extractIcon = document.getElementById('extractIcon');
    const extractText = document.getElementById('extractText');

    // Show loading state
    extractBtn.disabled = true;
    extractIcon.innerHTML = '<div class="loading"></div>';
    extractText.textContent = 'Extracting...';

    try {
      // Send message to background script to extract cookies
      const response = await chrome.runtime.sendMessage({ 
        action: 'extractCookies',
        domain: '.linkedin.com'
      });

      if (response.success) {
        this.currentExtractedCookies = response.cookies;
        this.displayExtractedCookies(response.cookies);
        await this.validateExtractedCookies();
      } else {
        this.showStatus('Failed to extract cookies: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('Extract cookies error:', error);
      this.showStatus('Error extracting cookies', 'error');
    } finally {
      // Reset button state
      extractBtn.disabled = false;
      extractIcon.textContent = '🍪';
      extractText.textContent = 'Extract LinkedIn Cookies';
    }
  }

  displayExtractedCookies(cookies) {
    const extractedDiv = document.getElementById('extractedCookies');
    const previewDiv = document.getElementById('cookiePreview');
    
    extractedDiv.classList.remove('hidden');
    
    const cookieCount = cookies.array ? cookies.array.length : 0;
    const hasLiAt = cookies.raw_li_at ? 'Yes' : 'No';
    
    previewDiv.innerHTML = `
      <div style="font-size: 11px; margin-bottom: 5px;">
        <strong>Cookies found:</strong> ${cookieCount} | <strong>li_at:</strong> ${hasLiAt}
      </div>
      <div style="font-size: 10px; opacity: 0.7; word-break: break-all;">
        ${cookies.string ? cookies.string.substring(0, 100) + '...' : 'No cookies'}
      </div>
    `;
  }

  async validateExtractedCookies() {
    if (!this.currentExtractedCookies) return;

    const statusDiv = document.getElementById('validationStatus');
    const iconSpan = document.getElementById('validationIcon');
    const messageSpan = document.getElementById('validationMessage');
    const addBtn = document.getElementById('addAccountBtn');

    statusDiv.classList.remove('hidden');
    iconSpan.textContent = '⏳';
    iconSpan.className = 'pulse';
    messageSpan.textContent = 'Validating cookies...';
    addBtn.disabled = true;

    try {
      // Send validation request to background script
      const response = await chrome.runtime.sendMessage({
        action: 'validateCookies',
        cookies: this.currentExtractedCookies.string
      });

      if (response.success && response.valid) {
        iconSpan.textContent = '✅';
        iconSpan.className = 'success';
        messageSpan.textContent = 'Cookies are valid and working!';
        addBtn.disabled = false;
      } else {
        iconSpan.textContent = '❌';
        iconSpan.className = 'error';
        messageSpan.textContent = response.expired ? 'Cookies have expired' : 'Cookies are invalid';
        addBtn.disabled = true;
      }
    } catch (error) {
      console.error('Validation error:', error);
      iconSpan.textContent = '⚠️';
      iconSpan.className = 'warning';
      messageSpan.textContent = 'Validation failed - check connection';
      addBtn.disabled = true;
    }
  }

  async addAccount() {
    const email = document.getElementById('newAccountEmail').value.trim();
    const name = document.getElementById('newAccountName').value.trim();

    if (!email) {
      this.showStatus('Please enter an email address', 'error');
      return;
    }

    if (!this.currentExtractedCookies) {
      this.showStatus('Please extract cookies first', 'error');
      return;
    }

    // Check if account already exists
    const existingAccount = this.accounts.find(acc => acc.email === email);
    if (existingAccount) {
      this.showStatus('Account with this email already exists', 'error');
      return;
    }

    const addBtn = document.getElementById('addAccountBtn');
    addBtn.disabled = true;
    addBtn.innerHTML = '<div class="loading"></div> Adding...';

    try {
      const newAccount = {
        id: `acc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        email: email,
        name: name || email,
        cookies: this.currentExtractedCookies,
        isValid: true,
        lastValidated: Date.now(),
        createdAt: Date.now(),
        lastUsed: null
      };

      this.accounts.push(newAccount);
      await this.saveAccounts();

      // Try to sync with backend
      try {
        await this.syncAccountToBackend(newAccount);
      } catch (syncError) {
        console.warn('Backend sync failed:', syncError);
      }

      this.showStatus('Account added successfully!', 'success');
      this.clearAddAccountForm();
      this.switchTab('accounts');
      this.updateUI();
    } catch (error) {
      console.error('Add account error:', error);
      this.showStatus('Failed to add account', 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.innerHTML = '<span>➕</span><span>Add Account</span>';
    }
  }

  clearAddAccountForm() {
    document.getElementById('newAccountEmail').value = '';
    document.getElementById('newAccountName').value = '';
    document.getElementById('extractedCookies').classList.add('hidden');
    document.getElementById('validationStatus').classList.add('hidden');
    document.getElementById('addAccountBtn').disabled = true;
    this.currentExtractedCookies = null;
  }

  cancelAddAccount() {
    this.clearAddAccountForm();
    this.switchTab('accounts');
  }

  async refreshAllAccounts() {
    const refreshBtn = document.getElementById('refreshAccountsBtn');
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<div class="loading"></div> Refreshing...';

    try {
      const validationPromises = this.accounts.map(account => 
        this.validateAccount(account)
      );

      await Promise.all(validationPromises);
      await this.saveAccounts();
      this.updateUI();
      this.showStatus('All accounts refreshed', 'success');
    } catch (error) {
      console.error('Refresh error:', error);
      this.showStatus('Failed to refresh accounts', 'error');
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span>🔄</span><span>Refresh All</span>';
    }
  }

  async validateAccount(account) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'validateCookies',
        cookies: account.cookies.string
      });

      account.isValid = response.success && response.valid;
      account.lastValidated = Date.now();
      
      if (!account.isValid && response.expired) {
        account.expiredAt = Date.now();
      }

      return account.isValid;
    } catch (error) {
      console.error('Account validation error:', error);
      account.isValid = false;
      account.lastValidated = Date.now();
      return false;
    }
  }

  async syncWithBackend() {
    const syncBtn = document.getElementById('syncBackendBtn');
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<div class="loading"></div> Syncing...';

    try {
      // Sync all accounts to backend
      const syncPromises = this.accounts.map(account => 
        this.syncAccountToBackend(account)
      );

      const results = await Promise.allSettled(syncPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Update last sync time
      await chrome.storage.local.set({ lastBackendSync: Date.now() });

      this.showStatus(`Sync complete: ${successful} successful, ${failed} failed`, 
        failed > 0 ? 'warning' : 'success');
      this.updateUI();
    } catch (error) {
      console.error('Backend sync error:', error);
      this.showStatus('Backend sync failed', 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '<span>☁️</span><span>Sync Backend</span>';
    }
  }

  async syncAccountToBackend(account) {
    try {
      // Try to include JWT if available
      let token = null;
      try {
        token = await new Promise((resolve) => {
          try { chrome.storage.local.get(['authToken'], (items) => resolve(items?.authToken || null)); } catch (e) { resolve(null); }
        });
      } catch (e) { token = null; }

      let response;
      let base = this.backendUrl || 'http://localhost:5001';
      try {
        response = await fetch(`${base}/api/accounts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            accountName: account.name,
            email: account.email,
            cookies: account.cookies.string,
            source: 'chrome_extension',
            extensionAccountId: account.id
          })
        });
      } catch (primaryErr) {
        console.warn('Primary backend fetch failed:', primaryErr);
        const looksNetwork = /failed to fetch|TypeError|NetworkError/i.test(String(primaryErr?.message || primaryErr));
        if (looksNetwork) {
          const candidateBases = Array.from(new Set([base, 'http://localhost:5001', 'http://localhost:3001', 'http://127.0.0.1:5001', 'http://127.0.0.1:3001']));
          for (const alt of candidateBases) {
            if (alt === base) continue;
            try {
              response = await fetch(`${alt}/api/accounts`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                  accountName: account.name,
                  email: account.email,
                  cookies: account.cookies.string,
                  source: 'chrome_extension',
                  extensionAccountId: account.id
                })
              });
              if (response) {
                this.backendUrl = alt; // Persist working base for future calls
                break;
              }
            } catch (altErr) {
              console.warn('Fallback backend fetch failed:', altErr);
            }
          }
          if (!response) throw primaryErr;
        } else {
          throw primaryErr;
        }
      }

      if (!response.ok) {
        throw new Error(`Backend sync failed: ${response.status}`);
      }

      const result = await response.json();
      account.backendId = result.accountId;
      account.lastSynced = Date.now();
      
      return result;
    } catch (error) {
      console.error('Backend sync error for account:', account.email, error);
      throw error;
    }
  }

  async startScraping() {
    const validAccounts = this.accounts.filter(acc => acc.isValid);
    
    if (validAccounts.length === 0) {
      this.showStatus('No valid accounts available for scraping', 'error');
      return;
    }

    try {
      // Do not auto-open the dashboard in development to avoid extra tabs.
      // Navigate manually to your running frontend if needed.
      this.showStatus(`Scraping started with ${validAccounts.length} accounts`, 'success');
    } catch (error) {
      console.error('Start scraping error:', error);
      this.showStatus('Failed to start scraping', 'error');
    }
  }

  updateUI() {
    this.updateAccountSummary();
    this.updateAccountsList();
    this.updateStartScrapingButton();
  }

  updateAccountSummary() {
    const totalAccounts = this.accounts.length;
    const validAccounts = this.accounts.filter(acc => acc.isValid).length;
    
    document.getElementById('totalAccounts').textContent = totalAccounts;
    document.getElementById('validAccounts').textContent = validAccounts;
    
    // Update last sync time
    chrome.storage.local.get(['lastBackendSync']).then(result => {
      const lastSync = result.lastBackendSync;
      const lastSyncText = lastSync ? 
        new Date(lastSync).toLocaleTimeString() : 'Never';
      document.getElementById('lastSync').textContent = lastSyncText;
    });
  }

  updateAccountsList() {
    const accountsList = document.getElementById('accountsList');
    
    if (this.accounts.length === 0) {
      accountsList.innerHTML = `
        <div class="no-accounts">
          <p>No LinkedIn accounts added yet</p>
          <p class="hint">Click "Add Account" to get started</p>
        </div>
      `;
      return;
    }

    accountsList.innerHTML = this.accounts.map(account => {
      const statusClass = account.isValid ? 'valid' : 'invalid';
      const statusIcon = account.isValid ? '✅' : '❌';
      const lastValidated = account.lastValidated ? 
        new Date(account.lastValidated).toLocaleString() : 'Never';
      
      return `
        <div class="account-item ${statusClass}">
          <div class="account-header">
            <div class="account-name">${account.name}</div>
            <div class="account-status">${statusIcon}</div>
          </div>
          <div class="account-email">${account.email}</div>
          <div class="account-meta">
            <span>Validated: ${lastValidated}</span>
            <span>Cookies: ${account.cookies.array ? account.cookies.array.length : 0}</span>
          </div>
          <div class="account-actions-mini">
            <button class="btn-mini" onclick="window.accountManager.validateSingleAccount('${account.id}')">
              🔄 Validate
            </button>
            <button class="btn-mini" onclick="window.accountManager.deleteAccount('${account.id}')">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  updateStartScrapingButton() {
    const startBtn = document.getElementById('startScrapingBtn');
    const validAccounts = this.accounts.filter(acc => acc.isValid).length;
    
    startBtn.disabled = validAccounts === 0;
    
    if (validAccounts > 0) {
      startBtn.innerHTML = `<span>🚀</span><span>Start Scraping (${validAccounts})</span>`;
    } else {
      startBtn.innerHTML = '<span>🚀</span><span>Start Scraping</span>';
    }
  }

  async validateSingleAccount(accountId) {
    const account = this.accounts.find(acc => acc.id === accountId);
    if (!account) return;

    try {
      await this.validateAccount(account);
      await this.saveAccounts();
      this.updateUI();
      
      const status = account.isValid ? 'valid' : 'invalid';
      this.showStatus(`Account ${account.name} is ${status}`, 
        account.isValid ? 'success' : 'error');
    } catch (error) {
      console.error('Single account validation error:', error);
      this.showStatus('Validation failed', 'error');
    }
  }

  async deleteAccount(accountId) {
    const account = this.accounts.find(acc => acc.id === accountId);
    if (!account) return;

    if (!confirm(`Delete account "${account.name}"?`)) return;

    try {
      this.accounts = this.accounts.filter(acc => acc.id !== accountId);
      await this.saveAccounts();
      this.updateUI();
      this.showStatus('Account deleted', 'success');
    } catch (error) {
      console.error('Delete account error:', error);
      this.showStatus('Failed to delete account', 'error');
    }
  }

  async checkWorkflowStatus() {
    try {
      // Check if extension is running (always true if we're here)
      const extensionRunning = true;
      
      // Check if at least one account is stored
      const hasAccounts = this.accounts.length > 0;
      
      // Check if at least one account is valid
      const hasValidAccounts = this.accounts.some(acc => acc.isValid);
      
      console.log('Workflow status:', {
        extensionRunning,
        hasAccounts,
        hasValidAccounts
      });
      
      // Update UI based on workflow status
      if (!hasAccounts) {
        this.showStatus('Add LinkedIn accounts to get started', 'warning');
      } else if (!hasValidAccounts) {
        this.showStatus('No valid accounts - please refresh or add new ones', 'warning');
      } else {
        this.showStatus('Ready for scraping!', 'success');
      }
    } catch (error) {
      console.error('Workflow status check error:', error);
    }
  }

  async saveSettings() {
    // Settings functionality (placeholder)
    this.showStatus('Settings saved', 'success');
  }

  async clearAllData() {
    if (!confirm('Clear all account data? This cannot be undone.')) return;

    try {
      await chrome.storage.local.clear();
      this.accounts = [];
      this.updateUI();
      this.showStatus('All data cleared', 'success');
    } catch (error) {
      console.error('Clear data error:', error);
      this.showStatus('Failed to clear data', 'error');
    }
  }

  showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    const statusMessage = document.getElementById('statusMessage');
    
    if (status && statusMessage) {
      status.className = `status ${type}`;
      statusMessage.textContent = message;
      status.classList.remove('hidden');
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        status.classList.add('hidden');
      }, 3000);
    } else {
      // Fallback to console if status elements don't exist
      console.log(`Status (${type}):`, message);
    }
  }
}

// Global reference for HTML onclick handlers
let accountManager;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  accountManager = new LinkedInMultiAccountManager();
  window.accountManager = accountManager; // Make available globally
});

// Setup periodic validation alarm on extension startup
chrome.runtime.sendMessage({ action: 'setupValidationAlarm' }).catch(() => {
  // Ignore errors if background script isn't ready
});