import React, { useState, useEffect } from 'react';
import { linkedinAccountsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { 
  PlusIcon, 
  TrashIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

const LinkedInAccountManager = () => {
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    invalid: 0,
    pending: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    accountName: '',
    email: '',
    cookieFile: null,
    cookiesJson: '',
    proxyUrl: '',
    mode: 'file'
  });

  useEffect(() => {
    fetchAccounts();
    fetchStats();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await linkedinAccountsAPI.getAccounts();
      console.log('Accounts API Response:', response);
      
      // Handle the response structure - the API returns data directly
      if (response && response.success) {
        setAccounts(response.data || []);
      } else if (response && Array.isArray(response)) {
        setAccounts(response);
      } else {
        setAccounts([]);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setError('Failed to fetch LinkedIn accounts');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await linkedinAccountsAPI.getStats();
      if (response.data && response.data.success) {
        setStats(response.data.data || {
          total: 0,
          valid: 0,
          invalid: 0,
          pending: 0
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({
        total: 0,
        valid: 0,
        invalid: 0,
        pending: 0
      });
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null); // Clear any previous errors
    setSuccess(null); // Clear any previous success messages

    try {
      const submitData = {
        account_name: formData.accountName,
        email: formData.email || null, // Optional email
        proxy_url: formData.proxyUrl || null
      };

      // Handle cookies based on mode
      if (formData.mode === 'json' && formData.cookiesJson) {
        try {
          // Validate JSON format
          const parsedCookies = JSON.parse(formData.cookiesJson);
          submitData.cookies_json = parsedCookies;
        } catch (jsonError) {
          setError('Invalid JSON format in cookies. Please check your JSON syntax.');
          return;
        }
      } else if (formData.mode === 'file' && formData.cookieFile) {
        // Use FormData for file upload
        const submitFormData = new FormData();
        Object.keys(submitData).forEach(key => {
          if (submitData[key] !== null) {
            submitFormData.append(key, submitData[key]);
          }
        });
        submitFormData.append('cookieFile', formData.cookieFile);
        
        const response = await linkedinAccountsAPI.addWithCookies(submitFormData);
        handleResponse(response);
        return;
      } else {
        setError('Please provide cookies either as JSON or upload a cookie file.');
        return;
      }

      console.log('🍪 Submitting account with data:', submitData);

      // For JSON mode, use regular POST request
      const response = await fetch('/api/linkedin-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(submitData)
      });

      const responseData = await response.json();
      handleResponse({ data: responseData });
      
    } catch (error) {
      console.error('❌ Error adding account:', error);
      
      // Comprehensive error handling
      let errorMessage = 'Failed to add account';
      
      if (error && error.response) {
        // HTTP error response
        const responseData = error.response.data || {};
        errorMessage = responseData.message || 
                      responseData.error || 
                      `HTTP ${error.response.status}: ${error.response.statusText}` ||
                      'Server error occurred';
      } else if (error && error.message) {
        // Network or other error
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        // String error
        errorMessage = error;
      }
      
      console.error('📝 Final error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = (response) => {
    console.log('✅ Account creation response:', response);
    
    // Handle successful response
    if (response && response.data && response.data.success) {
      const results = response.data.results || {};
      const successful = results.successful || [];
      const failed = results.failed || [];
      
      if (successful.length > 0) {
        setError(null);
        setSuccess(`✅ Successfully added ${successful.length} account(s)! Status will update shortly.`);
        console.log(`✅ Successfully added ${successful.length} account(s)`);
      }
      if (failed.length > 0) {
        setError(`Failed to add ${failed.length} account(s). Check cookie validity.`);
      }
      
      setShowAddForm(false);
      resetForm();
      fetchAccounts();
      fetchStats();
      
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('linkedin-accounts-updated'));
    } else {
      // Handle unsuccessful response
      const errorMsg = (response && response.data && response.data.message) || 
                      (response && response.data && response.data.error) || 
                      'Failed to add account - invalid response format';
      console.warn('⚠️ Account creation failed:', errorMsg);
      setError(errorMsg);
    }
  };

  const resetForm = () => {
    setFormData({
      accountName: '',
      email: '',
      cookieFile: null,
      cookiesJson: '',
      proxyUrl: '',
      mode: 'file'
    });
    setError(null);
    setSuccess(null);
  };

  const handleDeleteAccount = async (accountId) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      try {
        await linkedinAccountsAPI.deleteAccount(accountId);
        fetchAccounts();
        fetchStats();
      } catch (error) {
        console.error('Error deleting account:', error);
        setError('Failed to delete account');
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'valid':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'invalid':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case 'pending':
        return <ClockIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return <ExclamationTriangleIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'valid':
        return 'bg-green-100 text-green-800';
      case 'invalid':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && accounts.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">LinkedIn Account Manager</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your LinkedIn accounts using cookie files for secure authentication
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <XCircleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <CheckCircleIcon className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{stats.total}</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Accounts</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.total}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="w-8 h-8 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Valid</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.valid}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="w-8 h-8 text-yellow-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.pending}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <XCircleIcon className="w-8 h-8 text-red-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Failed</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.invalid}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Account Button */}
      <div className="mb-6">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add LinkedIn Account
        </button>
      </div>

      {/* Add Account Form */}
      {showAddForm && (
        <div className="mb-8 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Add New LinkedIn Account</h3>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div>
              <label htmlFor="accountName" className="block text-sm font-medium text-gray-700">
                Account Name *
              </label>
              <input
                type="text"
                id="accountName"
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., John Doe LinkedIn"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email (Optional)
              </label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="john.doe@example.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: Email associated with the LinkedIn account
              </p>
            </div>

            <div>
              <label htmlFor="mode" className="block text-sm font-medium text-gray-700">
                Cookie Input Method *
              </label>
              <select
                id="mode"
                value={formData.mode}
                onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="file">Upload Cookie File</option>
                <option value="json">Paste JSON Cookies</option>
              </select>
            </div>

            {formData.mode === 'file' ? (
              <div>
                <label htmlFor="cookieFile" className="block text-sm font-medium text-gray-700">
                  Cookie File *
                </label>
                <input
                  type="file"
                  id="cookieFile"
                  accept=".json"
                  onChange={(e) => setFormData({ ...formData, cookieFile: e.target.files[0] })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload a JSON file containing LinkedIn cookies
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="cookiesJson" className="block text-sm font-medium text-gray-700">
                  Cookies JSON *
                </label>
                <textarea
                  id="cookiesJson"
                  value={formData.cookiesJson}
                  onChange={(e) => setFormData({ ...formData, cookiesJson: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  rows={6}
                  placeholder='[{"name":"li_at","value":"your_cookie_value","domain":".linkedin.com",...}]'
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Paste your LinkedIn cookies as a JSON array. Each cookie should have name, value, domain, and other properties.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="proxyUrl" className="block text-sm font-medium text-gray-700">
                Proxy URL (Optional)
              </label>
              <input
                type="text"
                id="proxyUrl"
                value={formData.proxyUrl}
                onChange={(e) => setFormData({ ...formData, proxyUrl: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="http://username:password@proxy.com:8080"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">LinkedIn Accounts</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Manage and monitor your LinkedIn accounts
          </p>
        </div>
        <ul className="divide-y divide-gray-200">
          {accounts.length === 0 ? (
            <li className="px-4 py-4 text-center text-gray-500">
              No LinkedIn accounts found. Add your first account using cookie files to get started.
            </li>
          ) : (
            accounts.map((account) => (
              <li key={account.id} className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      {getStatusIcon(account.validation_status)}
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center">
                        <p className="text-sm font-medium text-gray-900">{account.account_name}</p>
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(account.validation_status)}`}>
                          {account.validation_status || 'pending'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Status: {account.status} | Daily Usage: {account.daily_request_count || 0}/{account.daily_request_limit || 150}
                      </p>
                      {account.last_validated && (
                        <p className="text-xs text-gray-400">
                          Last validated: {new Date(account.last_validated).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDeleteAccount(account.id)}
                      className="inline-flex items-center p-1 border border-transparent rounded text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default LinkedInAccountManager;