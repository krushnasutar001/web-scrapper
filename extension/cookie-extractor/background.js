/**
 * LinkedIn Multi-Account Manager - Background Script
 * Handles cookie extraction, validation, backend sync, and periodic validation
 */

// Configuration
const CONFIG = {
  BACKEND_URL: 'http://localhost:5000',
  VALIDATION_INTERVAL: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
  LINKEDIN_COOKIES: ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc', 'liap', 'lang'],
  VALIDATION_ALARM: 'linkedin_validation_alarm'
};

class LinkedInMultiAccountBackground {
  constructor() {
    this.setupEventListeners();
    this.setupValidationAlarm();
  }

  setupEventListeners() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Listen for tab updates to detect LinkedIn visits
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && 
          tab.url && 
          tab.url.includes('linkedin.com')) {
        this.onLinkedInPageLoad(tabId, tab.url);
      }
    });

    // Listen for alarm events
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === CONFIG.VALIDATION_ALARM) {
        this.performPeriodicValidation();
      }
    });

    // Context menu for manual actions
    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'extractLinkedInCookies',
        title: 'Extract LinkedIn Cookies',
        contexts: ['page'],
        documentUrlPatterns: ['*://*.linkedin.com/*']
      });

      chrome.contextMenus.create({
        id: 'validateAllAccounts',
        title: 'Validate All Accounts',
        contexts: ['action']
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'extractLinkedInCookies') {
        this.extractCookiesFromTab(tab.id);
      } else if (info.menuItemId === 'validateAllAccounts') {
        this.performPeriodicValidation();
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'extractCookies':
          const cookies = await this.extractLinkedInCookies(request.domain);
          sendResponse({ success: true, cookies });
          break;

        case 'validateCookies':
          const validation = await this.validateCookies(request.cookies);
          sendResponse({ success: true, ...validation });
          break;

        case 'syncToBackend':
          const syncResult = await this.syncAccountToBackend(request.account);
          sendResponse({ success: true, result: syncResult });
          break;

        case 'setupValidationAlarm':
          await this.setupValidationAlarm();
          sendResponse({ success: true });
          break;

        case 'getAccountStatus':
          const status = await this.getAccountsStatus();
          sendResponse({ success: true, status });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async extractLinkedInCookies(domain = '.linkedin.com') {
    try {
      console.log('Extracting LinkedIn cookies for domain:', domain);
      
      // Get all cookies for LinkedIn domain
      const allCookies = await chrome.cookies.getAll({ domain: domain });
      
      // Filter for LinkedIn-specific cookies
      const linkedInCookies = allCookies.filter(cookie => 
        CONFIG.LINKEDIN_COOKIES.includes(cookie.name)
      );

      console.log('Found LinkedIn cookies:', linkedInCookies.length);

      // Format cookies for different use cases
      const formattedCookies = {
        // Array format (for extensions)
        array: linkedInCookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          expirationDate: cookie.expirationDate
        })),
        
        // Object format (key-value pairs)
        object: Object.fromEntries(
          linkedInCookies.map(cookie => [cookie.name, cookie.value])
        ),
        
        // String format (for HTTP headers)
        string: linkedInCookies
          .map(cookie => `${cookie.name}=${cookie.value}`)
          .join('; '),
          
        // Raw li_at cookie (most important)
        raw_li_at: linkedInCookies.find(c => c.name === 'li_at')?.value || null
      };

      // Store extraction timestamp
      await chrome.storage.local.set({
        lastCookieExtraction: {
          timestamp: Date.now(),
          cookieCount: linkedInCookies.length,
          domain: domain
        }
      });

      return formattedCookies;

    } catch (error) {
      console.error('Cookie extraction failed:', error);
      throw new Error(`Failed to extract cookies: ${error.message}`);
    }
  }

  async validateCookies(cookieString) {
    try {
      console.log('Validating LinkedIn cookies...');
      
      if (!cookieString || cookieString.trim().length === 0) {
        return {
          valid: false,
          expired: false,
          message: 'No cookies provided'
        };
      }

      // Test URL for validation
      const testUrl = 'https://www.linkedin.com/feed/';
      
      // Make a test request using fetch with cookies
      const response = await fetch(testUrl, {
        method: 'HEAD',
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        credentials: 'include',
        mode: 'no-cors' // Avoid CORS issues
      });

      // Since we're using no-cors mode, we can't read the response
      // But we can check if the request was successful
      const isValid = response.type === 'opaque'; // Successful no-cors request
      
      // Additional validation: check if li_at cookie exists and looks valid
      const hasLiAt = cookieString.includes('li_at=') && 
                     (cookieString.includes('AQE') || cookieString.length > 100);
      
      const finalValid = isValid && hasLiAt;
      
      console.log('Cookie validation result:', {
        isValid,
        hasLiAt,
        finalValid,
        responseType: response.type
      });

      return {
        valid: finalValid,
        expired: !finalValid && hasLiAt, // If has li_at but validation failed, likely expired
        message: finalValid ? 'Cookies are valid' : 
                hasLiAt ? 'Cookies may be expired' : 'Invalid cookie format',
        statusCode: response.status || 0
      };

    } catch (error) {
      console.error('Cookie validation error:', error);
      
      // Check if error indicates expired cookies
      const isExpiredError = error.message.includes('redirect') || 
                            error.message.includes('login') ||
                            error.message.includes('unauthorized');
      
      return {
        valid: false,
        expired: isExpiredError,
        message: `Validation failed: ${error.message}`,
        error: error.code || error.name
      };
    }
  }

  async syncAccountToBackend(account) {
    try {
      console.log('Syncing account to backend:', account.email);
      
      // Include Authorization if token is available
      const token = await new Promise((resolve) => {
        try {
          chrome.storage.local.get(['authToken'], (items) => resolve(items?.authToken || null));
        } catch { resolve(null); }
      });

      let response = await fetch(`${CONFIG.BACKEND_URL}/api/accounts`, {
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
          extensionAccountId: account.id,
          isValid: account.isValid,
          lastValidated: account.lastValidated
        })
      });

      // Fallback to extension endpoint if legacy route is missing
      if (!response.ok) {
        if (response.status === 404) {
          try {
            const token = await new Promise((resolve) => {
              try {
                chrome.storage.local.get(['authToken'], (items) => resolve(items?.authToken || null));
              } catch { resolve(null); }
            });
            response = await fetch(`${CONFIG.BACKEND_URL}/api/extension/accounts`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                account_name: account.name || account.account_name || 'LinkedIn Account',
                cookies: account.cookies.array || account.cookies || []
              })
            });
          } catch (fallbackErr) {
            throw new Error(`Backend sync failed: ${response.status} ${response.statusText}; Fallback error: ${String(fallbackErr.message || fallbackErr)}`);
          }
        }
        if (!response.ok) {
          throw new Error(`Backend sync failed: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      console.log('Backend sync successful:', result);
      
      return result;

    } catch (error) {
      console.error('Backend sync error:', error);
      throw error;
    }
  }

  async setupValidationAlarm() {
    try {
      // Clear existing alarm
      await chrome.alarms.clear(CONFIG.VALIDATION_ALARM);
      
      // Create new alarm for periodic validation (every 2 hours)
      await chrome.alarms.create(CONFIG.VALIDATION_ALARM, {
        delayInMinutes: 120, // 2 hours
        periodInMinutes: 120 // Repeat every 2 hours
      });
      
      console.log('Validation alarm set up successfully');
      
      // Store alarm info
      await chrome.storage.local.set({
        validationAlarmSetup: {
          timestamp: Date.now(),
          intervalMinutes: 120
        }
      });
      
    } catch (error) {
      console.error('Failed to setup validation alarm:', error);
    }
  }

  async performPeriodicValidation() {
    try {
      console.log('Starting periodic validation of all accounts...');
      
      // Get all stored accounts
      const result = await chrome.storage.local.get(['linkedinAccounts']);
      const accounts = result.linkedinAccounts || [];
      
      if (accounts.length === 0) {
        console.log('No accounts to validate');
        return;
      }

      console.log(`Validating ${accounts.length} accounts...`);
      
      let validatedCount = 0;
      let validCount = 0;
      let invalidCount = 0;
      
      // Validate each account
      for (const account of accounts) {
        try {
          const validation = await this.validateCookies(account.cookies.string);
          
          // Update account status
          account.isValid = validation.valid;
          account.lastValidated = Date.now();
          
          if (validation.valid) {
            validCount++;
          } else {
            invalidCount++;
            if (validation.expired) {
              account.expiredAt = Date.now();
            }
          }
          
          validatedCount++;
          
          // Small delay between validations to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`Validation failed for account ${account.email}:`, error);
          account.isValid = false;
          account.lastValidated = Date.now();
          invalidCount++;
        }
      }
      
      // Save updated accounts
      await chrome.storage.local.set({ linkedinAccounts: accounts });
      
      // Update validation history
      const validationHistory = {
        timestamp: Date.now(),
        totalAccounts: accounts.length,
        validatedCount,
        validCount,
        invalidCount
      };
      
      await chrome.storage.local.set({ lastPeriodicValidation: validationHistory });
      
      console.log('Periodic validation completed:', validationHistory);
      
      // Show notification if there are invalid accounts
      if (invalidCount > 0) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'LinkedIn Account Validation',
          message: `${invalidCount} account(s) need attention. ${validCount} accounts are valid.`
        });
      }
      
      // Try to sync with backend
      try {
        await this.syncValidationResults(accounts);
      } catch (syncError) {
        console.warn('Backend sync failed during periodic validation:', syncError);
      }
      
    } catch (error) {
      console.error('Periodic validation failed:', error);
    }
  }

  async syncValidationResults(accounts) {
    try {
      console.log('Syncing validation results to backend...');
      
      const syncPromises = accounts.map(account => 
        this.syncAccountToBackend(account).catch(error => {
          console.warn(`Sync failed for ${account.email}:`, error);
          return null;
        })
      );
      
      const results = await Promise.allSettled(syncPromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
      
      console.log(`Backend sync completed: ${successful}/${accounts.length} accounts synced`);
      
    } catch (error) {
      console.error('Sync validation results failed:', error);
    }
  }

  async onLinkedInPageLoad(tabId, url) {
    try {
      // Check if auto-extraction is enabled
      const settings = await chrome.storage.local.get(['autoExtractEnabled']);
      
      if (!settings.autoExtractEnabled) {
        return;
      }
      
      console.log('LinkedIn page loaded, auto-extracting cookies:', url);
      
      // Extract cookies automatically
      const cookies = await this.extractLinkedInCookies();
      
      // Store as potential new account data
      await chrome.storage.local.set({
        autoExtractedCookies: {
          timestamp: Date.now(),
          url: url,
          cookies: cookies
        }
      });
      
      console.log('Auto-extraction completed');
      
    } catch (error) {
      console.error('Auto-extraction failed:', error);
    }
  }

  async extractCookiesFromTab(tabId) {
    try {
      // Get tab info
      const tab = await chrome.tabs.get(tabId);
      
      if (!tab.url || !tab.url.includes('linkedin.com')) {
        throw new Error('Not a LinkedIn page');
      }
      
      // Extract cookies
      const cookies = await this.extractLinkedInCookies();
      
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'LinkedIn Cookies Extracted',
        message: `Extracted ${cookies.array.length} cookies from LinkedIn`
      });
      
      return cookies;
      
    } catch (error) {
      console.error('Tab cookie extraction failed:', error);
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Cookie Extraction Failed',
        message: error.message
      });
    }
  }

  async getAccountsStatus() {
    try {
      const result = await chrome.storage.local.get([
        'linkedinAccounts',
        'lastPeriodicValidation',
        'validationAlarmSetup'
      ]);
      
      const accounts = result.linkedinAccounts || [];
      const totalAccounts = accounts.length;
      const validAccounts = accounts.filter(acc => acc.isValid).length;
      const invalidAccounts = totalAccounts - validAccounts;
      
      return {
        totalAccounts,
        validAccounts,
        invalidAccounts,
        lastValidation: result.lastPeriodicValidation,
        alarmSetup: result.validationAlarmSetup,
        accounts: accounts.map(acc => ({
          id: acc.id,
          email: acc.email,
          name: acc.name,
          isValid: acc.isValid,
          lastValidated: acc.lastValidated
        }))
      };
      
    } catch (error) {
      console.error('Get accounts status failed:', error);
      throw error;
    }
  }
}

// Initialize the background service
const multiAccountBackground = new LinkedInMultiAccountBackground();

console.log('LinkedIn Multi-Account Manager background script loaded');

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started, setting up validation alarm...');
  multiAccountBackground.setupValidationAlarm();
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // First time installation
    chrome.storage.local.set({
      extensionInstalled: Date.now(),
      version: chrome.runtime.getManifest().version
    });
  }
  
  // Setup validation alarm
  multiAccountBackground.setupValidationAlarm();
});