/**
 * Bulk Account Import Component
 * Allows users to import multiple LinkedIn accounts from a folder containing JSON files
 */

import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (typeof window !== 'undefined' ? window.__API_BASE_URL__ : null) ||
  (typeof window !== 'undefined' ? localStorage.getItem('API_BASE_URL') : null) ||
  'http://localhost:5001';

// Progress indicator component
const ProgressBar = ({ current, total, label }) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{label}</span>
        <span>{current}/{total} ({percentage}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

// Import result item component
const ImportResultItem = ({ account, isError = false }) => {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${
      isError ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
    }`}>
      <div className="flex items-center space-x-3">
        <div className={`w-2 h-2 rounded-full ${
          isError ? 'bg-red-500' : 'bg-green-500'
        }`}></div>
        <div>
          <div className="font-medium text-gray-900">
            {account.name || account.file}
          </div>
          {account.file && (
            <div className="text-sm text-gray-500">
              File: {account.file}
            </div>
          )}
          {account.error && (
            <div className="text-sm text-red-600">
              Error: {account.error}
            </div>
          )}
        </div>
      </div>
      <div className="text-right">
        {!isError && (
          <div className="text-sm text-gray-600">
            {account.cookiesCount} cookies
            {account.hasProxy && <span className="ml-2 text-blue-600">🔗 Proxy</span>}
            {account.hasUserAgent && <span className="ml-2 text-purple-600">🌐 UA</span>}
          </div>
        )}
      </div>
    </div>
  );
};

const BulkAccountImport = ({ onImportComplete }) => {
  const [folderPath, setFolderPath] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleImport = async (e) => {
    e.preventDefault();
    
    if (!folderPath.trim()) {
      setError('Please enter a folder path');
      return;
    }

    setImporting(true);
    setError('');
    setImportResult(null);

    try {
      console.log('Starting bulk import from folder:', folderPath);
      
      const response = await axios.post(`${API_BASE_URL}/api/accounts/bulk-import`, {
        folderPath: folderPath.trim()
      });

      if (response.data.success) {
        setImportResult(response.data);
        console.log('Bulk import completed:', response.data);
        
        // Notify parent component
        if (onImportComplete) {
          onImportComplete(response.data);
        }
      } else {
        setError(response.data.error || 'Import failed');
      }
    } catch (error) {
      console.error('Bulk import error:', error);
      setError(
        error.response?.data?.error || 
        error.message || 
        'Failed to import accounts'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setImportResult(null);
    setError('');
    setFolderPath('');
  };

  const handleFolderSelect = () => {
    // Note: In a real application, you would use Electron's dialog API
    // or a file/folder picker library. For now, we'll use manual input.
    const path = prompt('Enter the full path to the folder containing JSON files:');
    if (path) {
      setFolderPath(path);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          📁 Bulk Account Import
        </h2>
        <p className="text-gray-600">
          Import multiple LinkedIn accounts from a folder containing JSON files.
          Each JSON file should contain account data with cookies, proxy, and user agent information.
        </p>
      </div>

      {!importResult ? (
        <form onSubmit={handleImport} className="space-y-6">
          {/* Folder Path Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Folder Path *
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="C:\\Users\\YourName\\linkedin-accounts\\"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={importing}
              />
              <button
                type="button"
                onClick={handleFolderSelect}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                disabled={importing}
              >
                Browse
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Enter the full path to a folder containing .json files with LinkedIn account data
            </p>
          </div>

          {/* Advanced Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800"
            >
              <span className={`mr-1 transform transition-transform ${
                showAdvanced ? 'rotate-90' : ''
              }`}>▶</span>
              Advanced Options
            </button>
            
            {showAdvanced && (
              <div className="mt-3 p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">
                  <h4 className="font-medium mb-2">Expected JSON File Format:</h4>
                  <pre className="bg-white p-3 rounded border text-xs overflow-x-auto">
{`{
  "name": "Account Name",
  "cookies": [
    {
      "name": "li_at",
      "value": "cookie_value",
      "domain": ".linkedin.com",
      "path": "/",
      "httpOnly": true,
      "secure": true
    }
  ],
  "proxy": "http://user:pass@host:port",
  "userAgent": "Mozilla/5.0...",
  "timezone": "America/New_York"
}`}
                  </pre>
                  <p className="mt-2 text-xs">
                    • <strong>name</strong>: Account identifier (optional, uses filename if not provided)<br/>
                    • <strong>cookies</strong>: Array of LinkedIn cookies (required)<br/>
                    • <strong>proxy</strong>: Proxy URL (optional)<br/>
                    • <strong>userAgent</strong>: Custom user agent (optional)<br/>
                    • <strong>timezone</strong>: Account timezone (optional)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              <div className="flex items-center">
                <span className="mr-2">❌</span>
                {error}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end space-x-3">
            <button
              type="submit"
              disabled={importing || !folderPath.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Importing...
                </>
              ) : (
                <>
                  📁 Import Accounts
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        /* Import Results */
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">
              🎉 Import Completed
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {importResult.summary.totalFiles}
                </div>
                <div className="text-sm text-gray-600">Files Found</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {importResult.summary.imported}
                </div>
                <div className="text-sm text-gray-600">Imported</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {importResult.summary.errors}
                </div>
                <div className="text-sm text-gray-600">Errors</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round((importResult.summary.imported / importResult.summary.totalFiles) * 100)}%
                </div>
                <div className="text-sm text-gray-600">Success Rate</div>
              </div>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="space-y-3">
            <ProgressBar 
              current={importResult.summary.imported} 
              total={importResult.summary.totalFiles} 
              label="Successfully Imported"
            />
            {importResult.summary.errors > 0 && (
              <ProgressBar 
                current={importResult.summary.errors} 
                total={importResult.summary.totalFiles} 
                label="Errors"
              />
            )}
          </div>

          {/* Imported Accounts */}
          {importResult.importedAccounts && importResult.importedAccounts.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">
                ✅ Successfully Imported ({importResult.importedAccounts.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {importResult.importedAccounts.map((account, index) => (
                  <ImportResultItem key={index} account={account} />
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {importResult.errors && importResult.errors.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">
                ❌ Errors ({importResult.errors.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {importResult.errors.map((error, index) => (
                  <ImportResultItem key={index} account={error} isError={true} />
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Import More
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkAccountImport;