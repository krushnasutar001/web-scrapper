import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const MultiAccountManager = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    accountName: '',
    mode: 'single', // 'single' or 'multiple'
    cookieFile: null,
    folderPath: '',
    proxyUrl: ''
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/linkedin-accounts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setAccounts(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const submitFormData = new FormData();
      
      submitFormData.append('account_name', formData.accountName);
      submitFormData.append('mode', formData.mode);
      
      if (formData.mode === 'single' && formData.cookieFile) {
        submitFormData.append('cookieFile', formData.cookieFile);
      } else if (formData.mode === 'multiple' && formData.folderPath) {
        submitFormData.append('folderPath', formData.folderPath);
      }
      
      if (formData.proxyUrl) {
        submitFormData.append('proxyUrl', formData.proxyUrl);
      }

      const response = await fetch('/api/linkedin-accounts/add-with-cookies', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: submitFormData
      });

      const data = await response.json();
      
      if (data.success) {
        const { successful, failed } = data.results;
        if (successful.length > 0) {
          toast.success(`Successfully added ${successful.length} account(s)!`);
        }
        if (failed.length > 0) {
          toast.error(`Failed to add ${failed.length} account(s). Check cookie validity.`);
        }
        setShowAddForm(false);
        resetForm();
        fetchAccounts();
      } else {
        toast.error(data.message || 'Failed to add account');
      }
    } catch (error) {
      console.error('Error adding account:', error);
      toast.error('Failed to add account');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      accountName: '',
      mode: 'single',
      cookieFile: null,
      folderPath: '',
      proxyUrl: ''
    });
  };

  const handleBulkUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/linkedin-accounts/bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(`Bulk upload completed: ${data.data.successful.length} successful, ${data.data.failed.length} failed`);
        fetchAccounts();
      } else {
        toast.error(data.message || 'Bulk upload failed');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    } finally {
      setLoading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const deleteAccount = async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this account?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/linkedin-accounts/${accountId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Account deleted successfully');
        fetchAccounts();
      } else {
        toast.error(data.message || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Multi-Account Manager</h2>
        <div className="flex gap-3">
          <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
            📁 Bulk Upload
            <input
              type="file"
              accept=".csv,.xlsx,.json"
              onChange={handleBulkUpload}
              className="hidden"
              disabled={loading}
            />
          </label>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            ➕ Add Account
          </button>
        </div>
      </div>

      {/* Account List */}
      <div className="grid gap-4 mb-6">
        {accounts.map((account) => (
          <div key={account.id} className="bg-white p-4 rounded-lg shadow border">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{account.account_name}</h3>
                <div className="text-sm text-gray-600 mt-1">
                  <p>Validation Status: <span className={`px-2 py-1 rounded text-xs ${
                    account.validation_status === 'valid' ? 'bg-green-100 text-green-800' :
                    account.validation_status === 'invalid' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{account.validation_status || 'pending'}</span></p>
                  <p>Status: <span className={`px-2 py-1 rounded text-xs ${
                    account.status === 'active' ? 'bg-green-100 text-green-800' :
                    account.status === 'blocked' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{account.status}</span></p>
                  <p>Daily Usage: {account.daily_request_count || 0}/{account.daily_request_limit || 150}</p>
                  <p>Added: {account.created_at ? new Date(account.created_at).toLocaleString() : 'Unknown'}</p>
                  <p>Last Validated: {account.last_validated ? new Date(account.last_validated).toLocaleString() : 'Never'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteAccount(account.id)}
                  className="text-red-600 hover:text-red-800 px-3 py-1 rounded border border-red-300 hover:bg-red-50"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 text-lg mb-4">No LinkedIn accounts added yet</p>
          <p className="text-gray-400">Add accounts using cookie files to enable multi-account scraping</p>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Add LinkedIn Account</h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  value={formData.accountName}
                  onChange={(e) => setFormData({...formData, accountName: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., John Doe LinkedIn"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Mode *
                </label>
                <select
                  value={formData.mode}
                  onChange={(e) => setFormData({...formData, mode: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="single">Single Cookie File</option>
                  <option value="multiple">Multiple Cookie Files (Folder)</option>
                </select>
              </div>

              {formData.mode === 'single' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cookie File *
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setFormData({...formData, cookieFile: e.target.files[0]})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Upload a JSON file containing LinkedIn cookies
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Folder Path *
                  </label>
                  <input
                    type="text"
                    value={formData.folderPath}
                    onChange={(e) => setFormData({...formData, folderPath: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="C:\path\to\cookie\files"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Provide the full path to folder containing multiple JSON cookie files
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Proxy URL (Optional)
                </label>
                <input
                  type="text"
                  value={formData.proxyUrl}
                  onChange={(e) => setFormData({...formData, proxyUrl: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="http://username:password@proxy.com:8080"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiAccountManager;