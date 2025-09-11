import React, { useState, useEffect } from 'react';
import { XMarkIcon, DocumentArrowUpIcon, MagnifyingGlassIcon, BuildingOfficeIcon, UserIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';

const NewJobModal = ({ isOpen, onClose, onSubmit }) => {
  const [step, setStep] = useState(1);
  const [jobType, setJobType] = useState('');
  const [formData, setFormData] = useState({
    jobType: '',
    urls: [],
    searchQuery: '',
    maxPages: 5,
    jobName: '',
    accountSelectionMode: 'rotation',
    selectedAccountIds: [],
    file: null
  });
  const [urlsText, setUrlsText] = useState('');
  const [inputMethod, setInputMethod] = useState('urls'); // 'urls' or 'file'
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [errors, setErrors] = useState({});
  const [dragActive, setDragActive] = useState(false);

  const jobTypes = [
    {
      id: 'profiles',
      name: 'Scrape LinkedIn Profiles',
      description: 'Extract profile data from LinkedIn profile URLs',
      icon: UserIcon,
      color: 'bg-blue-500',
      inputType: 'urls',
      placeholder: 'Enter LinkedIn profile URLs (one per line)'
    },
    {
      id: 'companies',
      name: 'Scrape Company Profiles',
      description: 'Extract company data from LinkedIn company URLs',
      icon: BuildingOfficeIcon,
      color: 'bg-green-500',
      inputType: 'urls',
      placeholder: 'Enter LinkedIn company URLs (one per line)'
    },
    {
      id: 'sales_navigator',
      name: 'Sales Navigator Search',
      description: 'Scrape Sales Navigator search results with pagination',
      icon: MagnifyingGlassIcon,
      color: 'bg-purple-500',
      inputType: 'search',
      placeholder: 'Enter search query or Sales Navigator URL'
    }
  ];

  useEffect(() => {
    if (isOpen) {
      fetchAvailableAccounts();
      
      // Set up interval to refresh accounts every 30 seconds when modal is open
      const interval = setInterval(() => {
        fetchAvailableAccounts();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [isOpen]);
  
  // Listen for account updates from other parts of the app
  useEffect(() => {
    const handleAccountUpdate = () => {
      if (isOpen) {
        fetchAvailableAccounts();
      }
    };
    
    window.addEventListener('linkedin-accounts-updated', handleAccountUpdate);
    return () => window.removeEventListener('linkedin-accounts-updated', handleAccountUpdate);
  }, [isOpen]);

  const fetchAvailableAccounts = async () => {
    try {
      console.log('🔍 Fetching available accounts...');
      
      // Use the configured API service instead of direct fetch
      const response = await api.get('/api/linkedin-accounts/available');
      
      console.log('📋 Available accounts response:', response.data);
      
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        const accounts = response.data.data.filter(account => 
          account.validation_status === 'ACTIVE' || 
          account.validation_status === 'PENDING'
        );
        console.log(`✅ Found ${accounts.length} available accounts:`, accounts);
        setAvailableAccounts(accounts);
        
        // Force re-render by updating a dummy state
        setErrors(prev => ({ ...prev }));
      } else {
        console.warn('⚠️ Invalid accounts response format:', response.data);
        setAvailableAccounts([]);
      }
    } catch (error) {
      console.error('❌ Failed to fetch available accounts:', error);
      console.error('Error details:', error.response?.data || error.message);
      setAvailableAccounts([]);
      
      // Show user-friendly error message
      setErrors(prev => ({
        ...prev,
        accounts: 'Failed to load LinkedIn accounts. Please try refreshing the page.'
      }));
    }
  };

  const resetForm = () => {
    setStep(1);
    setJobType('');
    setFormData({
      jobType: '',
      urls: [],
      searchQuery: '',
      maxPages: 5,
      jobName: '',
      accountSelectionMode: 'rotation',
      selectedAccountIds: [],
      file: null
    });
    setUrlsText('');
    setInputMethod('urls');
    setErrors({});
    setDragActive(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleJobTypeSelect = (type) => {
    setJobType(type);
    setFormData(prev => ({ ...prev, jobType: type }));
    setStep(2);
  };

  const handleUrlsChange = (e) => {
    const text = e.target.value;
    setUrlsText(text);
    const urls = text.split('\n').filter(url => url.trim().length > 0);
    setFormData(prev => ({ ...prev, urls }));
  };

  const handleFileUpload = (file) => {
    if (file) {
      const allowedTypes = ['.csv', '.xlsx', '.xls'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!allowedTypes.includes(fileExtension)) {
        setErrors(prev => ({ ...prev, file: 'Please upload a CSV or Excel file' }));
        return;
      }
      
      setFormData(prev => ({ ...prev, file }));
      setErrors(prev => ({ ...prev, file: '' }));
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.jobName.trim()) {
      newErrors.jobName = 'Job name is required';
    }
    
    if (jobType === 'sales_navigator') {
      if (!formData.searchQuery.trim()) {
        newErrors.searchQuery = 'Search query or Sales Navigator URL is required';
      }
    } else {
      if (inputMethod === 'file') {
        if (!formData.file) {
          newErrors.file = 'Please upload a CSV or Excel file';
        }
      } else {
        // Parse URLs from text input
        const urls = urlsText.split('\n').filter(url => url.trim().length > 0);
        if (urls.length === 0) {
          newErrors.urls = 'Please enter at least one LinkedIn URL';
        } else {
          // Validate URL format
          const invalidUrls = urls.filter(url => !url.includes('linkedin.com'));
          if (invalidUrls.length > 0) {
            newErrors.urls = 'All URLs must be LinkedIn URLs';
          }
        }
      }
    }
    
    // Only check for accounts if we've attempted to fetch them
    if (availableAccounts.length === 0) {
      newErrors.accounts = 'No LinkedIn accounts available. Please add accounts first in the LinkedIn Accounts section.';
    } else if (formData.accountSelectionMode === 'specific' && !formData.selectedAccountId) {
      newErrors.accounts = 'Please select a specific LinkedIn account to use for scraping.';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const downloadTemplate = async (jobType) => {
    try {
      const response = await api.get(`/api/templates/${jobType}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Set filename based on job type
      const filenames = {
        'profiles': 'profile-scraping-template.csv',
        'companies': 'company-scraping-template.csv',
        'sales_navigator': 'sales-navigator-template.csv'
      };
      
      link.setAttribute('download', filenames[jobType] || 'template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error downloading template:', error);
      // You could add a toast notification here
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      // Prepare the form data with proper account selection
      const submitData = {
        ...formData,
        selectedAccountIds: formData.accountSelectionMode === 'specific' 
          ? [formData.selectedAccountId] 
          : availableAccounts.map(acc => acc.id)
      };
      
      onSubmit(submitData);
      handleClose();
    }
  };

  const selectedJobType = jobTypes.find(type => type.id === jobType);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {step === 1 ? 'Create New Job' : `Create ${selectedJobType?.name}`}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {step === 1 ? (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Select Job Type
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {jobTypes.map((type) => {
                  const IconComponent = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => handleJobTypeSelect(type.id)}
                      className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-lg ${type.color} text-white group-hover:scale-110 transition-transform`}>
                          <IconComponent className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 group-hover:text-blue-600">
                            {type.name}
                          </h4>
                          <p className="text-sm text-gray-600 mt-1">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Job Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Name *
                </label>
                <input
                  type="text"
                  value={formData.jobName}
                  onChange={(e) => setFormData(prev => ({ ...prev, jobName: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.jobName ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter a descriptive name for this job"
                />
                {errors.jobName && (
                  <p className="text-red-500 text-sm mt-1">{errors.jobName}</p>
                )}
              </div>

              {/* URL Input or Search Query */}
              {jobType === 'sales_navigator' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Query or Sales Navigator URL *
                    </label>
                    <input
                      type="text"
                      value={formData.searchQuery}
                      onChange={(e) => setFormData(prev => ({ ...prev, searchQuery: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.searchQuery ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="e.g., Software Engineer San Francisco OR https://www.linkedin.com/sales/search/..."
                    />
                    {errors.searchQuery && (
                      <p className="text-red-500 text-sm mt-1">{errors.searchQuery}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Pages to Scrape
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="25"
                      value={formData.maxPages}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxPages: parseInt(e.target.value) || 5 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-gray-500 text-xs mt-1">
                      Number of result pages to scrape (1-25)
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    LinkedIn URLs *
                  </label>
                  
                  {/* Input Method Selection */}
                  <div className="flex space-x-4 mb-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="inputMethod"
                        value="urls"
                        checked={inputMethod === 'urls'}
                        onChange={(e) => setInputMethod(e.target.value)}
                        className="mr-2 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900">Paste URLs</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="inputMethod"
                        value="file"
                        checked={inputMethod === 'file'}
                        onChange={(e) => setInputMethod(e.target.value)}
                        className="mr-2 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900">Upload CSV/Excel</span>
                    </label>
                  </div>
                  
                  {inputMethod === 'urls' ? (
                     <div>
                       <div className="flex justify-between items-center mb-2">
                         <span className="text-sm text-gray-600">Enter URLs manually:</span>
                         <button
                           type="button"
                           onClick={() => downloadTemplate(jobType)}
                           className="text-blue-500 hover:text-blue-700 text-sm underline"
                         >
                           📥 Download Sample Template
                         </button>
                       </div>
                       <textarea
                         value={urlsText}
                         onChange={handleUrlsChange}
                         rows={8}
                         className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                           errors.urls ? 'border-red-500' : 'border-gray-300'
                         }`}
                         placeholder={selectedJobType?.placeholder || 'Enter LinkedIn URLs (one per line)'}
                       />
                       {errors.urls && (
                         <p className="text-red-500 text-sm mt-1">{errors.urls}</p>
                       )}
                       <p className="text-gray-500 text-xs mt-2">
                         Enter one LinkedIn URL per line. {formData.urls.length} URLs entered.
                       </p>
                     </div>
                  ) : (
                    <div>
                      <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                        } ${errors.file ? 'border-red-500' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                      >
                        <DocumentArrowUpIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        {formData.file ? (
                          <div>
                            <p className="text-green-600 font-medium">{formData.file.name}</p>
                            <p className="text-gray-500 text-sm">File uploaded successfully</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-gray-600 mb-2">
                              Drag and drop your CSV/Excel file here, or
                            </p>
                            <input
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              onChange={(e) => handleFileUpload(e.target.files[0])}
                              className="hidden"
                              id="file-upload"
                            />
                            <label
                              htmlFor="file-upload"
                              className="inline-block bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 cursor-pointer transition-colors"
                            >
                              Choose File
                            </label>
                          </div>
                        )}
                      </div>
                      {errors.file && (
                        <p className="text-red-500 text-sm mt-1">{errors.file}</p>
                      )}
                      <p className="text-gray-500 text-xs mt-2">
                        Supported formats: CSV, Excel (.xlsx, .xls). First column should contain LinkedIn URLs.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Account Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    LinkedIn Accounts * ({availableAccounts.length} available)
                  </label>
                  <button
                    type="button"
                    onClick={fetchAvailableAccounts}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                  >
                    🔄 Refresh
                  </button>
                </div>
                
                {availableAccounts.length === 0 ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <p className="text-yellow-800 text-sm">
                        No LinkedIn accounts available. Please add accounts first in the LinkedIn Accounts section.
                      </p>
                      <button
                        type="button"
                        onClick={fetchAvailableAccounts}
                        className="ml-2 px-3 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                      >
                        Check Again
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Account Selection Mode */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        Account Selection Mode
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="accountMode"
                            value="rotation"
                            checked={formData.accountSelectionMode === 'rotation'}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              accountSelectionMode: e.target.value
                            }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-700">Auto Rotation</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="accountMode"
                            value="specific"
                            checked={formData.accountSelectionMode === 'specific'}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              accountSelectionMode: e.target.value
                            }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-700">Specific Account</span>
                        </label>
                      </div>
                    </div>

                    {/* Specific Account Selection */}
                    {formData.accountSelectionMode === 'specific' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">
                          Select LinkedIn Account
                        </label>
                        <select
                          value={formData.selectedAccountId || ''}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            selectedAccountId: e.target.value
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Choose an account...</option>
                          {availableAccounts.map(account => (
                            <option key={account.id} value={account.id}>
                              {account.account_name} ({account.validation_status})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Account Status Display */}
                    <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-center justify-between">
                        <p className="text-green-800 text-sm font-medium">
                          ✅ {availableAccounts.length} active LinkedIn account(s) available
                        </p>
                        <button
                          type="button"
                          onClick={fetchAvailableAccounts}
                          className="text-blue-600 hover:text-blue-800 text-sm underline"
                        >
                          Refresh
                        </button>
                      </div>
                      
                      {/* Account List */}
                      <div className="mt-3 space-y-2">
                        {availableAccounts.map((account, index) => (
                          <div key={account.id} className="flex items-center justify-between bg-white p-2 rounded border">
                            <div className="flex items-center space-x-3">
                              <span className="text-sm font-medium text-gray-700">
                                {account.account_name}
                              </span>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                account.validation_status === 'ACTIVE' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {account.validation_status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {account.last_validated_at 
                                ? `Last validated: ${new Date(account.last_validated_at).toLocaleDateString()}`
                                : 'Never validated'
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Selection Summary */}
                      <div className="mt-3 p-2 bg-blue-50 rounded">
                        <p className="text-blue-800 text-sm">
                          <strong>Selection Mode:</strong> {formData.accountSelectionMode === 'rotation' ? 'Auto Rotation (all accounts will be used)' : `Specific Account (${formData.selectedAccountId ? availableAccounts.find(acc => acc.id === formData.selectedAccountId)?.account_name || 'None selected' : 'None selected'})`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {errors.accounts && (
                  <p className="text-red-500 text-sm mt-1">{errors.accounts}</p>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  ← Back
                </button>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={availableAccounts.length === 0}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Create Job
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default NewJobModal;