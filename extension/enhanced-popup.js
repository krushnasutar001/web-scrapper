/**
 * Enhanced LinkedIn Automation Extension - Popup Script
 * Multi-identity cookie management with periodic refresh
 */

(function() {
  'use strict';
  
  // State variables
  let isLoggedIn = false;
  let currentIdentity = null;
  let selectedIntegration = 'linkedin';
  let identities = {};
  
  // Available integrations
  const INTEGRATIONS = {
    linkedin: { name: 'LinkedIn', icon: '💼' },
    salesnav: { name: 'Sales Navigator', icon: '📊' },
    twitter: { name: 'Twitter/X', icon: '🐦' }
  };
  
  // DOM elements
  const elements = {
    // Status elements
    connectionStatus: document.getElementById('connectionStatus'),
    connectionText: document.getElementById('connectionText'),
    connectionDetails: document.getElementById('connectionDetails'),
    
    // Message elements
    errorMessage: document.getElementById('errorMessage'),
    successMessage: document.getElementById('successMessage'),
    
    // Section elements
    loginSection: document.getElementById('loginSection'),
    mainSection: document.getElementById('mainSection'),
    
    // Form elements
    loginForm: document.getElementById('loginForm'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    
    // Button elements
    loginBtn: document.getElementById('loginBtn'),
    loginBtnText: document.getElementById('loginBtnText'),
    loginSpinner: document.getElementById('loginSpinner'),
    
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Identity management
    identitySelect: document.getElementById('identitySelect'),
    integrationSelect: document.getElementById('integrationSelect'),
    createIdentityBtn: document.getElementById('createIdentityBtn'),
    
    // Cookie actions
    updateCookiesBtn: document.getElementById('updateCookiesBtn'),
    refreshAllBtn: document.getElementById('refreshAllBtn'),
    
    // Status display
    identityStatus: document.getElementById('identityStatus'),
    cookieStatus: document.getElementById('cookieStatus')
  };
  
  // Initialize popup
  async function initialize() {
    console.log('🚀 Enhanced popup initializing...');
    
    try {
      // Check authentication status
      await checkAuthStatus();
      
      // Setup event listeners
      setupEventListeners();
      
      // Load identities if logged in
      if (isLoggedIn) {
        await loadIdentities();
        await updateStatus();
      }
      
      console.log('✅ Enhanced popup initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing popup:', error);
      showError('Failed to initialize extension: ' + error.message);
    }
  }
  
  // Check authentication status with enhanced error handling
  async function checkAuthStatus() {
    try {
      updateConnectionStatus('checking', 'Checking authentication...', 'Connecting to background script...');
      
      // Use Promise.race to add timeout
      const response = await Promise.race([
        sendMessage({ action: 'getAuthStatus' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Background script timeout')), 5000)
        )
      ]);
      
      if (response && response.isLoggedIn) {
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
      updateConnectionStatus('error', 'Connection Failed', 'Cannot connect to background script');
      
      // Show specific error message based on error type
      if (error.message.includes('timeout') || error.message.includes('Receiving end does not exist')) {
        showError('Extension connection failed. Please reload the extension or refresh this page.');
      } else {
        showError('Failed to connect to backend. Make sure the server is running.');
      }
    }
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Login form
    if (elements.loginForm) {
      elements.loginForm.addEventListener('submit', handleLogin);
    }
    
    // Navigation buttons
    if (elements.logoutBtn) {
      elements.logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Identity management
    if (elements.identitySelect) {
      elements.identitySelect.addEventListener('change', handleIdentityChange);
    }
    
    if (elements.integrationSelect) {
      elements.integrationSelect.addEventListener('change', handleIntegrationChange);
    }
    
    if (elements.createIdentityBtn) {
      elements.createIdentityBtn.addEventListener('click', handleCreateIdentity);
    }
    
    // Cookie actions
    if (elements.updateCookiesBtn) {
      elements.updateCookiesBtn.addEventListener('click', handleUpdateCookies);
    }
    
    if (elements.refreshAllBtn) {
      elements.refreshAllBtn.addEventListener('click', handleRefreshAll);
    }
  }
  
  // Handle login
  async function handleLogin(event) {
    event.preventDefault();
    
    const email = elements.email?.value?.trim();
    const password = elements.password?.value?.trim();
    
    if (!email || !password) {
      showError('Please enter both email and password');
      return;
    }
    
    try {
      setButtonLoading(elements.loginBtn, elements.loginBtnText, elements.loginSpinner, true);
      hideMessages();
      
      const response = await sendMessage({
        action: 'login',
        credentials: { email, password }
      });
      
      if (response.success) {
        isLoggedIn = true;
        showSuccess('Login successful!');
        showMainSection();
        await loadIdentities();
        await updateStatus();
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error) {
      console.error('❌ Login failed:', error);
      showError('Login failed: ' + error.message);
    } finally {
      setButtonLoading(elements.loginBtn, elements.loginBtnText, elements.loginSpinner, false);
    }
  }
  
  // Handle logout
  async function handleLogout() {
    try {
      await sendMessage({ action: 'logout' });
      isLoggedIn = false;
      currentIdentity = null;
      identities = {};
      
      showLoginSection();
      showSuccess('Logged out successfully');
    } catch (error) {
      console.error('❌ Logout failed:', error);
      showError('Logout failed: ' + error.message);
    }
  }
  
  // Load identities from storage
  async function loadIdentities() {
    try {
      const response = await sendMessage({ action: 'getIdentities' });
      
      if (response.success) {
        identities = response.identities;
        updateIdentitySelect();
        
        // Select first identity if available
        const identityIds = Object.keys(identities);
        if (identityIds.length > 0 && !currentIdentity) {
          currentIdentity = identityIds[0];
          if (elements.identitySelect) {
            elements.identitySelect.value = currentIdentity;
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to load identities:', error);
    }
  }
  
  // Update identity select dropdown
  function updateIdentitySelect() {
    if (!elements.identitySelect) return;
    
    elements.identitySelect.innerHTML = '<option value="">Select Identity...</option>';
    
    for (const [identityId, identity] of Object.entries(identities)) {
      const option = document.createElement('option');
      option.value = identityId;
      option.textContent = identity.name || identityId.slice(-8);
      elements.identitySelect.appendChild(option);
    }
    
    // Update integration select
    updateIntegrationSelect();
  }
  
  // Update integration select dropdown
  function updateIntegrationSelect() {
    if (!elements.integrationSelect) return;
    
    elements.integrationSelect.innerHTML = '';
    
    for (const [integrationId, integration] of Object.entries(INTEGRATIONS)) {
      const option = document.createElement('option');
      option.value = integrationId;
      option.textContent = `${integration.icon} ${integration.name}`;
      elements.integrationSelect.appendChild(option);
    }
    
    elements.integrationSelect.value = selectedIntegration;
  }
  
  // Handle identity change
  function handleIdentityChange(event) {
    currentIdentity = event.target.value;
    updateStatus();
  }
  
  // Handle integration change
  function handleIntegrationChange(event) {
    selectedIntegration = event.target.value;
    updateStatus();
  }
  
  // Handle create identity
  async function handleCreateIdentity() {
    try {
      const name = prompt('Enter identity name:');
      if (!name) return;
      
      const response = await sendMessage({
        action: 'createIdentity',
        name,
        integrations: [selectedIntegration]
      });
      
      if (response.success) {
        showSuccess(`Identity "${name}" created successfully!`);
        await loadIdentities();
        currentIdentity = response.identityUid;
        if (elements.identitySelect) {
          elements.identitySelect.value = currentIdentity;
        }
        await updateStatus();
      } else {
        throw new Error(response.error || 'Failed to create identity');
      }
    } catch (error) {
      console.error('❌ Create identity failed:', error);
      showError('Failed to create identity: ' + error.message);
    }
  }
  
  // Handle update cookies
  async function handleUpdateCookies() {
    if (!currentIdentity || !selectedIntegration) {
      showError('Please select an identity and integration first');
      return;
    }
    
    try {
      setButtonLoading(elements.updateCookiesBtn, null, null, true);
      hideMessages();
      
      const response = await sendMessage({
        action: 'updateCookies',
        identityUid: currentIdentity,
        integrationUid: selectedIntegration
      });
      
      if (response.success) {
        showSuccess(`Cookies updated successfully! (${response.cookieCount} cookies)`);
        await updateStatus();
      } else {
        throw new Error(response.error || 'Failed to update cookies');
      }
    } catch (error) {
      console.error('❌ Update cookies failed:', error);
      showError('Update cookies failed: ' + error.message);
    } finally {
      setButtonLoading(elements.updateCookiesBtn, null, null, false);
    }
  }
  
  // Handle refresh all cookies
  async function handleRefreshAll() {
    try {
      setButtonLoading(elements.refreshAllBtn, null, null, true);
      hideMessages();
      
      const response = await sendMessage({ action: 'refreshAllCookies' });
      
      if (response.success) {
        showSuccess(response.message);
        await updateStatus();
      } else {
        throw new Error(response.error || 'Failed to refresh cookies');
      }
    } catch (error) {
      console.error('❌ Refresh all failed:', error);
      showError('Refresh all failed: ' + error.message);
    } finally {
      setButtonLoading(elements.refreshAllBtn, null, null, false);
    }
  }
  
  // Update status display
  async function updateStatus() {
    if (!elements.identityStatus || !elements.cookieStatus) return;
    
    if (!currentIdentity) {
      elements.identityStatus.textContent = 'No identity selected';
      elements.cookieStatus.textContent = 'Select an identity to view cookie status';
      return;
    }
    
    const identity = identities[currentIdentity];
    if (!identity) {
      elements.identityStatus.textContent = 'Identity not found';
      elements.cookieStatus.textContent = 'Invalid identity';
      return;
    }
    
    elements.identityStatus.textContent = `Identity: ${identity.name || currentIdentity.slice(-8)}`;
    
    const integration = identity.integrations?.[selectedIntegration];
    if (integration) {
      const lastUpdated = integration.lastUpdated 
        ? new Date(integration.lastUpdated).toLocaleString()
        : 'Never';
      
      elements.cookieStatus.textContent = 
        `${INTEGRATIONS[selectedIntegration]?.name || selectedIntegration}: ${integration.cookieCount || 0} cookies (Updated: ${lastUpdated})`;
    } else {
      elements.cookieStatus.textContent = `${INTEGRATIONS[selectedIntegration]?.name || selectedIntegration}: No cookies`;
    }
  }
  
  // UI Helper functions
  function showLoginSection() {
    if (elements.loginSection) elements.loginSection.classList.add('active');
    if (elements.mainSection) elements.mainSection.classList.add('hidden');
  }
  
  function showMainSection() {
    if (elements.loginSection) elements.loginSection.classList.remove('active');
    if (elements.mainSection) elements.mainSection.classList.remove('hidden');
  }
  
  function updateConnectionStatus(status, text, details) {
    if (elements.connectionStatus) {
      elements.connectionStatus.className = `status-dot ${status === 'connected' ? 'connected' : status === 'warning' ? 'warning' : ''}`;
    }
    if (elements.connectionText) elements.connectionText.textContent = text;
    if (elements.connectionDetails) elements.connectionDetails.textContent = details;
  }
  
  function setButtonLoading(button, textElement, spinner, loading) {
    if (!button) return;
    
    button.disabled = loading;
    if (textElement && spinner) {
      if (loading) {
        textElement.classList.add('hidden');
        spinner.classList.remove('hidden');
      } else {
        textElement.classList.remove('hidden');
        spinner.classList.add('hidden');
      }
    }
  }
  
  function showError(message) {
    if (elements.errorMessage) {
      elements.errorMessage.textContent = message;
      elements.errorMessage.classList.remove('hidden');
    }
    if (elements.successMessage) {
      elements.successMessage.classList.add('hidden');
    }
  }
  
  function showSuccess(message) {
    if (elements.successMessage) {
      elements.successMessage.textContent = message;
      elements.successMessage.classList.remove('hidden');
    }
    if (elements.errorMessage) {
      elements.errorMessage.classList.add('hidden');
    }
  }
  
  function hideMessages() {
    if (elements.errorMessage) elements.errorMessage.classList.add('hidden');
    if (elements.successMessage) elements.successMessage.classList.add('hidden');
  }
  
  // Enhanced communication helper with retry logic
  function sendMessage(message, retries = 3) {
    return new Promise((resolve, reject) => {
      const attemptSend = (attempt) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`Message attempt ${attempt} failed:`, chrome.runtime.lastError.message);
            
            if (attempt < retries) {
              // Retry after a short delay
              setTimeout(() => attemptSend(attempt + 1), 1000);
            } else {
              reject(new Error(chrome.runtime.lastError.message));
            }
          } else if (response && response.success === false) {
            reject(new Error(response.error || 'Unknown error'));
          } else {
            resolve(response);
          }
        });
      };
      
      attemptSend(1);
    });
  }
  
  // Initialize when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
})();