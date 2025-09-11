import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const MultiAccountManager = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    accountName: '',
    email: '',
    username: '',
    cookies: '',
    proxyUrl: '',
    cookieFormat: 'string' // 'string', 'json', 'individual'
  });
  const [individualCookies, setIndividualCookies] = useState({
    li_at: '',
    JSESSIONID: '',
    bcookie: '',
    bscookie: '',
    li_gc: ''
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
      
      // Process cookies based on format
      let finalCookies = formData.cookies;
      
      if (formData.cookieFormat === 'individual') {
        // Combine individual cookies
        const cookieParts = [];
        Object.entries(individualCookies).forEach(([name, value]) => {
          if (value.trim()) {
            cookieParts.push(`${name}=${value.trim()}`);
          }
        });
        finalCookies = cookieParts.join('; ');
      } else if (formData.cookieFormat === 'json') {
        try {
          const cookieObj = JSON.parse(formData.cookies);
          if (Array.isArray(cookieObj)) {
            // Array format from extension
            finalCookies = cookieObj
              .filter(c => ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'].includes(c.name))
              .map(c => `${c.name}=${c.value}`)
              .join('; ');
          } else {
            // Object format
            finalCookies = Object.entries(cookieObj)
              .filter(([name]) => ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'].includes(name))
              .map(([name, value]) => `${name}=${value}`)
              .join('; ');
          }
        } catch (jsonError) {
          toast.error('Invalid JSON format for cookies');
          setLoading(false);
          return;
        }
      }

      const response = await fetch('/api/linkedin-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountName: formData.accountName,
          email: formData.email,
          username: formData.username,
          cookies: finalCookies,
          proxyUrl: formData.proxyUrl
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Account added successfully!');
        setShowAddForm(false);
        setFormData({
          accountName: '',
          email: '',
          username: '',
          cookies: '',
          proxyUrl: '',
          cookieFormat: 'string'
        });
        setIndividualCookies({
          li_at: '',
          JSESSIONID: '',
          bcookie: '',
          bscookie: '',
          li_gc: ''
        });
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
                  <p>Email: {account.email || 'Not provided'}</p>
                  <p>Username: {account.username || 'Not provided'}</p>
                  <p>Status: <span className={`px-2 py-1 rounded text-xs ${
                    account.status === 'active' ? 'bg-green-100 text-green-800' :
                    account.status === 'blocked' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{account.status}</span></p>
                  <p>Daily Usage: {account.daily_request_count || 0}/{account.daily_request_limit || 150}</p>
                  <p>Last Used: {account.last_used ? new Date(account.last_used).toLocaleString() : 'Never'}</p>
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
          <p className="text-gray-400">Add accounts to enable multi-account scraping with automatic rotation</p>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="johndoe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Proxy URL
                </label>
                <input
                  type="text"
                  value={formData.proxyUrl}
                  onChange={(e) => setFormData({...formData, proxyUrl: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="http://username:password@proxy.com:8080"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cookie Format
                </label>
                <select
                  value={formData.cookieFormat}
                  onChange={(e) => setFormData({...formData, cookieFormat: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="string">Cookie String (name=value; name2=value2)</option>
                  <option value="json">JSON Format (Array or Object)</option>
                  <option value="individual">Individual Cookie Fields</option>
                </select>
              </div>

              {formData.cookieFormat === 'individual' ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    LinkedIn Cookies *
                  </label>
                  {Object.entries(individualCookies).map(([name, value]) => (
                    <div key={name}>
                      <label className="block text-xs text-gray-500 mb-1">{name}</label>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setIndividualCookies({...individualCookies, [name]: e.target.value})}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Enter ${name} cookie value`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    LinkedIn Cookies *
                  </label>
                  <textarea
                    value={formData.cookies}
                    onChange={(e) => setFormData({...formData, cookies: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32"
                    placeholder={
                      formData.cookieFormat === 'json' 
                        ? '[{"name":"li_at","value":"AQE..."}, {"name":"JSESSIONID","value":"ajax:..."}]'
                        : 'li_at=AQE...; JSESSIONID=ajax:...; bcookie=...'
                    }
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.cookieFormat === 'json' 
                      ? 'Paste JSON array or object with cookie data'
                      : 'Paste cookies as "name=value; name2=value2" format'}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
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