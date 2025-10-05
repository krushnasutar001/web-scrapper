/**
 * LinkedIn Account Manager - React Frontend
 * Simple UI for managing LinkedIn accounts with validation status
 */

import React, { useState, useEffect } from 'react';
import BulkAccountImport from './BulkAccountImport';
import api from '../services/api';

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (typeof window !== 'undefined' ? window.__API_BASE_URL__ : null) ||
  (typeof window !== 'undefined' ? localStorage.getItem('API_BASE_URL') : null) ||
  'http://localhost:5002';

// Status badge component
const StatusBadge = ({ status }) => {
  const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'valid':
        return { color: 'bg-green-100 text-green-800', icon: '✅', text: 'Active' };
      case 'invalid':
      case 'expired':
        return { color: 'bg-red-100 text-red-800', icon: '❌', text: 'Invalid' };
      case 'pending':
        return { color: 'bg-yellow-100 text-yellow-800', icon: '⏳', text: 'Pending' };
      case 'blocked':
        return { color: 'bg-orange-100 text-orange-800', icon: '🚫', text: 'Blocked' };
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: '❓', text: 'Unknown' };
    }
  };

  const config = getStatusConfig(status);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <span className="mr-1">{config.icon}</span>
      {config.text}
    </span>
  );
};

// Extension Detection Component
const ExtensionDetection = ({ onAccountDetected, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detectedAccounts, setDetectedAccounts] = useState([]);
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(false);

  useEffect(() => {
    checkExtensionInstalled();

    const onReady = () => {
      setIsExtensionInstalled(true);
      setError('');
    };

    window.addEventListener('SCRALYTICS_EXTENSION_READY', onReady);

    // If the event already fired before this component mounted, check the global flag set by the extension content script.
    if (window.__SCRALYTICS_EXTENSION_READY__) {
      onReady();
    }

    return () => {
      window.removeEventListener('SCRALYTICS_EXTENSION_READY', onReady);
    };
  }, []);

  const checkExtensionInstalled = () => {
    // Check if extension is installed by looking for the extension's content script
    if (window.chrome && window.chrome.runtime) {
      setIsExtensionInstalled(true);
    } else {
      setError('LinkedIn Automation Extension is not installed. Please install the extension first.');
    }
  };

  const detectAccounts = async () => {
    setLoading(true);
    setError('');

    try {
      const handleResult = (event) => {
        if (event.data && event.data.type === 'DETECT_ACCOUNTS_RESULT') {
          window.removeEventListener('message', handleResult);
          const response = event.data.response;
          if (response && response.success) {
            setDetectedAccounts(response.accounts || []);
            if (response.accounts && response.accounts.length > 0) {
              onAccountDetected();
            } else {
              setError('No LinkedIn accounts detected. Please make sure you are logged into LinkedIn in this browser.');
            }
          } else {
            setError(response?.error || 'Failed to detect accounts from extension');
          }
          setLoading(false);
        }
      };

      window.addEventListener('message', handleResult);
      // Ask the content script to trigger detection via background
      window.postMessage({ type: 'DETECT_ACCOUNTS', source: 'frontend', ts: Date.now() }, '*');
    } catch (error) {
      setError('Failed to communicate with extension: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Detect LinkedIn Accounts</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Extension Status */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  {isExtensionInstalled ? (
                    <span className="text-green-600 text-xl">✅</span>
                  ) : (
                    <span className="text-red-600 text-xl">❌</span>
                  )}
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-blue-900">
                    {isExtensionInstalled ? 'Extension Installed' : 'Extension Required'}
                  </h4>
                  <p className="text-sm text-blue-700">
                    {isExtensionInstalled 
                      ? 'LinkedIn Automation Extension is ready to detect accounts'
                      : 'Please install the LinkedIn Automation Extension to continue'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Instructions:</h4>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                <li>Make sure you are logged into LinkedIn in this browser</li>
                <li>Click "Detect Accounts" to automatically find your LinkedIn accounts</li>
                <li>The extension will securely capture your session cookies</li>
                <li>Accounts will be validated and saved to your dashboard</li>
              </ol>
            </div>

            {/* Detected Accounts */}
            {detectedAccounts.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-green-900 mb-2">
                  Detected Accounts ({detectedAccounts.length})
                </h4>
                <div className="space-y-2">
                  {detectedAccounts.map((account, index) => (
                    <div key={index} className="text-sm text-green-700">
                      <strong>{account.name || 'LinkedIn User'}</strong>
                      {account.email && <span className="text-green-600"> ({account.email})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={detectAccounts}
                disabled={loading || !isExtensionInstalled}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Detecting...' : 'Detect Accounts'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Account List Component
const AccountList = ({ accounts, onValidate, onDelete, loading }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading accounts...</span>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-lg mb-2">No accounts found</p>
        <p>Add your first LinkedIn account to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Account Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Proxy
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Validated
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {accounts && accounts.map((account) => (
            <tr key={account.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {account.account_name || account.name}
                </div>
                <div className="text-xs text-gray-500">
                  {account.email || account.username}
                </div>
                {account.validation_error && (
                  <div className="text-xs text-red-600 mt-1">
                    {account.validation_error}
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex flex-col space-y-1">
                  <StatusBadge status={account.validation_status || account.status} />
                  {account.is_active === 1 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                      Inactive
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {account.proxy_url ? (
                  <span className="text-green-600">✓ Enabled</span>
                ) : (
                  <span className="text-gray-400">None</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(account.last_validated_at)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(account.created_at)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button
                  onClick={() => onValidate(account.id)}
                  className="text-blue-600 hover:text-blue-900"
                >
                  Validate
                </button>
                <button
                  onClick={() => onDelete(account.id)}
                  className="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Statistics Component
const Statistics = ({ stats }) => {
  if (!stats) return null;

  const { total, valid, invalid, pending } = stats;
  const validPercentage = total > 0 ? Math.round((valid / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="text-2xl">📊</div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Accounts</dt>
                <dd className="text-lg font-medium text-gray-900">{total}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="text-2xl">✅</div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Valid</dt>
                <dd className="text-lg font-medium text-green-600">{valid}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="text-2xl">❌</div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Invalid</dt>
                <dd className="text-lg font-medium text-red-600">{invalid}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="text-2xl">⏳</div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                <dd className="text-lg font-medium text-yellow-600">{pending}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Component
const LinkedInAccountManager = () => {
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [validatingId, setValidatingId] = useState(null);
  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts' or 'bulk-import'

  // Fetch accounts
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      // Primary: modern route
      let response = await api.get('/api/accounts');
      if (response && response.success && Array.isArray(response.data)) {
        setAccounts(response.data);
      } else if (Array.isArray(response)) {
        // Some APIs may return array directly
        setAccounts(response);
      } else {
        // Fallback 1: legacy refresh route
        try {
          response = await api.get('/api/linkedin-accounts/refresh');
          if (response && response.success && Array.isArray(response.data)) {
            setAccounts(response.data);
          } else {
            // Fallback 2: available accounts route
            response = await api.get('/api/linkedin-accounts/available');
            if (response && response.success && Array.isArray(response.data)) {
              setAccounts(response.data);
            } else {
              // Fallback 3: ask the extension for locally saved accounts
              try {
                const extAccounts = await fetchExtensionLocalAccounts();
                setAccounts(extAccounts);
              } catch (extErr) {
                console.warn('Extension local accounts unavailable:', extErr);
                setAccounts([]);
              }
            }
          }
        } catch (fallbackErr) {
          console.error('Fallback fetch error:', fallbackErr);
          // Try extension-local accounts if backend falls through
          try {
            const extAccounts = await fetchExtensionLocalAccounts();
            setAccounts(extAccounts);
          } catch (extErr) {
            setAccounts([]);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Ask the extension (via content script bridge) for local accounts
  const fetchExtensionLocalAccounts = () => {
    return new Promise((resolve, reject) => {
      try {
        const handler = (event) => {
          if (event.source !== window || !event.data || typeof event.data !== 'object') return;
          if (event.data.type === 'LOCAL_LINKEDIN_ACCOUNTS_RESULT') {
            window.removeEventListener('message', handler);
            if (event.data.success && Array.isArray(event.data.data)) {
              resolve(event.data.data);
            } else {
              reject(new Error(event.data.error || 'No local accounts'));
            }
          }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'GET_LOCAL_LINKEDIN_ACCOUNTS', source: 'webapp', ts: Date.now() }, '*');
        // Timeout after 2 seconds
        setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Extension response timeout'));
        }, 2000);
      } catch (e) {
        reject(e);
      }
    });
  };

  // Listen for extension save events to auto-refresh accounts without user action
  useEffect(() => {
    const onExtensionAccountSaved = () => {
      fetchAccounts();
      fetchStats();
    };
    window.addEventListener('SCRALYTICS_EXTENSION_ACCOUNT_SAVED', onExtensionAccountSaved);
    return () => {
      window.removeEventListener('SCRALYTICS_EXTENSION_ACCOUNT_SAVED', onExtensionAccountSaved);
    };
  }, []);

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const response = await api.get('/api/stats');
      if (response.success) {
        setStats(response.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Validate account
  const handleValidate = async (accountId) => {
    setValidatingId(accountId);
    try {
      const response = await api.post(`/api/accounts/${accountId}/validate`);
      if (response.success) {
        // Refresh accounts and stats
        await fetchAccounts();
        await fetchStats();
        
        // Notify other components that accounts have been updated
        window.dispatchEvent(new CustomEvent('linkedin-accounts-updated', {
          detail: { timestamp: Date.now(), action: 'account-validated', accountId }
        }));
      }
    } catch (error) {
      console.error('Error validating account:', error);
      alert('Failed to validate account: ' + (error.response?.data?.error || error.message));
    } finally {
      setValidatingId(null);
    }
  };

  // Delete account
  const handleDelete = async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this account?')) {
      return;
    }

    try {
      const response = await api.delete(`/api/accounts/${accountId}`);
      if (response.success) {
        // Refresh accounts and stats
        await fetchAccounts();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account: ' + (error.response?.data?.error || error.message));
    }
  };

  // Handle account added
  const handleAccountAdded = async () => {
    await fetchAccounts();
    await fetchStats();
    
    // Notify other components that accounts have been updated
    window.dispatchEvent(new CustomEvent('linkedin-accounts-updated', {
      detail: { timestamp: Date.now(), action: 'account-added' }
    }));
  };

  // Initial load
  useEffect(() => {
    fetchAccounts();
    fetchStats();
  }, []);

  // Auto-refresh every 5 minutes to reduce performance impact
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAccounts();
      fetchStats();
    }, 300000); // 5 minutes instead of 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Manual refresh function for user-triggered updates
  const handleManualRefresh = () => {
    fetchAccounts();
    fetchStats();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">LinkedIn Account Manager</h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage and validate your LinkedIn accounts with automatic status checking
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleManualRefresh}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                title="Refresh account data"
              >
                <span className="mr-2">🔄</span>
                Refresh
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <span className="mr-2">🔍</span>
                Detect Accounts
              </button>
              <button
                onClick={() => setShowBulkImport(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <span className="mr-2">📁</span>
                Bulk Import
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-0 mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('accounts')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'accounts'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📋 Account List ({accounts?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('bulk-import')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'bulk-import'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📁 Bulk Import
              </button>
            </nav>
          </div>
        </div>

        {/* Statistics */}
        <Statistics stats={stats} />

        {/* Tab Content */}
        {activeTab === 'accounts' ? (
          /* Account List */
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Accounts</h2>
                <div className="text-sm text-gray-500">
                  Auto-refreshes every 30 seconds
                </div>
              </div>
              
              <AccountList
                accounts={accounts}
                onValidate={handleValidate}
                onDelete={handleDelete}
                loading={loading}
              />
            </div>
          </div>
        ) : (
          /* Bulk Import */
          <BulkAccountImport
            onImportComplete={handleAccountAdded}
          />
        )}

        {/* Add Account Modal */}
        {showAddForm && (
          <ExtensionDetection
            onAccountDetected={handleAccountAdded}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {/* Bulk Import Modal */}
        {showBulkImport && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-4/5 lg:w-3/4 xl:w-2/3 shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Bulk Account Import</h3>
                <button
                  onClick={() => setShowBulkImport(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <BulkAccountImport
                onImportComplete={(result) => {
                  handleAccountAdded();
                  // Auto-close modal after successful import
                  setTimeout(() => {
                    setShowBulkImport(false);
                    setActiveTab('accounts'); // Switch back to accounts tab
                  }, 3000);
                }}
              />
            </div>
          </div>
        )}

        {/* Validating Overlay */}
        {validatingId && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                <span className="text-gray-700">Validating account...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkedInAccountManager;