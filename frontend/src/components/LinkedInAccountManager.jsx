/**
 * LinkedIn Account Manager - React Frontend
 * Simple UI for managing LinkedIn accounts with validation status
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import BulkAccountImport from './BulkAccountImport';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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

// Add Account Form Component
const AddAccountForm = ({ onAccountAdded, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    proxy_url: '',
    user_agent: ''
  });
  const [cookiesFile, setCookiesFile] = useState(null);
  const [cookiesJson, setCookiesJson] = useState('');
  const [useFileUpload, setUseFileUpload] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleFileChange = (e) => {
    setCookiesFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const submitData = new FormData();
      submitData.append('name', formData.name);
      
      if (formData.proxy_url) {
        submitData.append('proxy_url', formData.proxy_url);
      }
      
      if (formData.user_agent) {
        submitData.append('user_agent', formData.user_agent);
      }

      if (useFileUpload && cookiesFile) {
        submitData.append('cookiesFile', cookiesFile);
      } else if (!useFileUpload && cookiesJson) {
        submitData.append('cookies', cookiesJson);
      } else {
        throw new Error('Please provide cookies either as file or JSON');
      }

      const response = await axios.post(`${API_BASE_URL}/api/accounts`, submitData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        onAccountAdded();
        onClose();
      } else {
        setError(response.data.error || 'Failed to add account');
      }
    } catch (error) {
      setError(error.response?.data?.error || error.message || 'Failed to add account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Add LinkedIn Account</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., John Doe LinkedIn"
              />
            </div>

            {/* Cookies Input Method Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cookies *
              </label>
              <div className="flex space-x-4 mb-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={useFileUpload}
                    onChange={() => setUseFileUpload(true)}
                    className="mr-2 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">Upload cookies.json file</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={!useFileUpload}
                    onChange={() => setUseFileUpload(false)}
                    className="mr-2 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">Paste JSON</span>
                </label>
              </div>

              {useFileUpload ? (
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <textarea
                  value={cookiesJson}
                  onChange={(e) => setCookiesJson(e.target.value)}
                  required
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder='[{"name":"li_at","value":"cookie_value","domain":".linkedin.com"}]'
                />
              )}
            </div>

            {/* Proxy URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proxy URL (Optional)
              </label>
              <input
                type="text"
                name="proxy_url"
                value={formData.proxy_url}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="http://proxy.example.com:8080"
              />
            </div>

            {/* User Agent */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User Agent (Optional)
              </label>
              <input
                type="text"
                name="user_agent"
                value={formData.user_agent}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Account'}
              </button>
            </div>
          </form>
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

  if (accounts.length === 0) {
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
          {accounts.map((account) => (
            <tr key={account.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {account.name}
                </div>
                {account.validation_error && (
                  <div className="text-xs text-red-600 mt-1">
                    {account.validation_error}
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={account.status} />
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
      const response = await axios.get(`${API_BASE_URL}/api/accounts`);
      if (response.data.success) {
        setAccounts(response.data.accounts);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/stats`);
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Validate account
  const handleValidate = async (accountId) => {
    setValidatingId(accountId);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/accounts/${accountId}/validate`);
      if (response.data.success) {
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
      const response = await axios.delete(`${API_BASE_URL}/api/accounts/${accountId}`);
      if (response.data.success) {
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
                <span className="mr-2">+</span>
                Add Single Account
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
                📋 Account List ({accounts.length})
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
          <AddAccountForm
            onAccountAdded={handleAccountAdded}
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