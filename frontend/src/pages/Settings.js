import React, { useState, useEffect } from 'react';
import { CogIcon, ShieldCheckIcon, ClockIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    // General settings
    defaultDailyLimit: 150,
    defaultMinDelay: 30,
    defaultMaxDelay: 90,
    
    // Cooldown settings
    errorRecoveryCooldown: 60, // minutes
    rateLimitCooldown: 1440, // minutes (24 hours)
    maxConsecutiveFailures: 5,
    
    // Account rotation settings
    enableAutoRotation: true,
    loadBalancingEnabled: true,
    maxAccountsPerJob: 10,
    
    // Safety settings
    enableProxyValidation: true,
    enableCookieValidation: true,
    pauseOnHighFailureRate: true,
    failureRateThreshold: 50 // percentage
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const { user } = useAuth();

  const tabs = [
    { id: 'general', name: 'General', icon: CogIcon },
    { id: 'accounts', name: 'Account Defaults', icon: UsersIcon },
    { id: 'cooldowns', name: 'Cooldowns', icon: ClockIcon },
    { id: 'safety', name: 'Safety', icon: ShieldCheckIcon }
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // In a real implementation, this would load user-specific settings
      // For now, we'll use the default settings
      console.log('Settings loaded');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      // In a real implementation, this would save settings to the backend
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Application Settings</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Accounts Per Job
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={settings.maxAccountsPerJob}
              onChange={(e) => handleInputChange('maxAccountsPerJob', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Maximum number of LinkedIn accounts that can be used for a single job
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Failure Rate Threshold (%)
            </label>
            <input
              type="number"
              min="10"
              max="90"
              value={settings.failureRateThreshold}
              onChange={(e) => handleInputChange('failureRateThreshold', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Pause jobs when failure rate exceeds this percentage
            </p>
          </div>
        </div>
      </div>
      
      <div>
        <h4 className="text-md font-medium text-gray-900 mb-3">Automation Features</h4>
        
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.enableAutoRotation}
              onChange={(e) => handleInputChange('enableAutoRotation', e.target.checked)}
              className="mr-3"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Enable Auto-Rotation</span>
              <p className="text-xs text-gray-500">Automatically rotate between available accounts</p>
            </div>
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.loadBalancingEnabled}
              onChange={(e) => handleInputChange('loadBalancingEnabled', e.target.checked)}
              className="mr-3"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Enable Load Balancing</span>
              <p className="text-xs text-gray-500">Distribute workload based on account usage and cooldowns</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  const renderAccountSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Default Account Limits</h3>
        <p className="text-gray-600 text-sm mb-6">
          These settings will be applied to new LinkedIn accounts by default. You can override them for individual accounts.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Daily Request Limit
            </label>
            <input
              type="number"
              min="10"
              max="1000"
              value={settings.defaultDailyLimit}
              onChange={(e) => handleInputChange('defaultDailyLimit', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Maximum requests per day per account
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Delay (seconds)
            </label>
            <input
              type="number"
              min="10"
              max="300"
              value={settings.defaultMinDelay}
              onChange={(e) => handleInputChange('defaultMinDelay', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Minimum delay between requests
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Delay (seconds)
            </label>
            <input
              type="number"
              min="30"
              max="600"
              value={settings.defaultMaxDelay}
              onChange={(e) => handleInputChange('defaultMaxDelay', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Maximum delay between requests
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCooldownSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Cooldown Configuration</h3>
        <p className="text-gray-600 text-sm mb-6">
          Configure automatic cooldown periods to prevent account blocks and rate limiting.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Error Recovery Cooldown (minutes)
            </label>
            <input
              type="number"
              min="15"
              max="1440"
              value={settings.errorRecoveryCooldown}
              onChange={(e) => handleInputChange('errorRecoveryCooldown', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Cooldown period after consecutive failures
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rate Limit Cooldown (minutes)
            </label>
            <input
              type="number"
              min="60"
              max="2880"
              value={settings.rateLimitCooldown}
              onChange={(e) => handleInputChange('rateLimitCooldown', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Cooldown period when LinkedIn rate limiting is detected
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Consecutive Failures
            </label>
            <input
              type="number"
              min="3"
              max="20"
              value={settings.maxConsecutiveFailures}
              onChange={(e) => handleInputChange('maxConsecutiveFailures', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              Trigger cooldown after this many consecutive failures
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSafetySettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Safety & Validation</h3>
        <p className="text-gray-600 text-sm mb-6">
          Configure safety measures to protect your LinkedIn accounts from detection and blocks.
        </p>
        
        <div className="space-y-4">
          <label className="flex items-start">
            <input
              type="checkbox"
              checked={settings.enableProxyValidation}
              onChange={(e) => handleInputChange('enableProxyValidation', e.target.checked)}
              className="mr-3 mt-1"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Enable Proxy Validation</span>
              <p className="text-xs text-gray-500 mt-1">
                Automatically test proxy connectivity before starting jobs
              </p>
            </div>
          </label>
          
          <label className="flex items-start">
            <input
              type="checkbox"
              checked={settings.enableCookieValidation}
              onChange={(e) => handleInputChange('enableCookieValidation', e.target.checked)}
              className="mr-3 mt-1"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Enable Cookie Validation</span>
              <p className="text-xs text-gray-500 mt-1">
                Validate LinkedIn session cookies before using accounts
              </p>
            </div>
          </label>
          
          <label className="flex items-start">
            <input
              type="checkbox"
              checked={settings.pauseOnHighFailureRate}
              onChange={(e) => handleInputChange('pauseOnHighFailureRate', e.target.checked)}
              className="mr-3 mt-1"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Pause on High Failure Rate</span>
              <p className="text-xs text-gray-500 mt-1">
                Automatically pause jobs when failure rate exceeds threshold
              </p>
            </div>
          </label>
        </div>
      </div>
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <ShieldCheckIcon className="h-5 w-5 text-yellow-400 mr-2 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-yellow-800">Safety Recommendations</h4>
            <div className="text-xs text-yellow-700 mt-2 space-y-1">
              <p>• Keep daily limits under 200 requests per account</p>
              <p>• Use delays of at least 30-90 seconds between requests</p>
              <p>• Always use high-quality residential proxies</p>
              <p>• Validate cookies regularly to avoid expired sessions</p>
              <p>• Monitor failure rates and adjust limits accordingly</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'accounts':
        return renderAccountSettings();
      case 'cooldowns':
        return renderCooldownSettings();
      case 'safety':
        return renderSafetySettings();
      default:
        return renderGeneralSettings();
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">
          Configure your LinkedIn automation preferences and safety settings
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderTabContent()}
        </div>

        {/* Save Button */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            {saved && (
              <div className="flex items-center text-green-600">
                <ShieldCheckIcon className="h-4 w-4 mr-1" />
                <span className="text-sm">Settings saved successfully!</span>
              </div>
            )}
            <div className="flex space-x-3 ml-auto">
              <button
                onClick={loadSettings}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;