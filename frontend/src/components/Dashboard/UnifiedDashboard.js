import React, { useState, useEffect } from 'react';
import { 
  ChartBarIcon, 
  DocumentArrowDownIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import api, { dashboardAPI } from '../../services/api';

const UnifiedDashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [linkedinAccounts, setLinkedinAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobStats, setJobStats] = useState(null);
  // Removed unused state: exportFormat, pollingInterval

  useEffect(() => {
    fetchJobs();
    fetchDashboardStats();
    fetchLinkedInAccounts();
    
    // Start polling for job updates every 2 minutes to avoid rate limiting
    const interval = setInterval(() => {
      fetchJobs();
      fetchDashboardStats();
      fetchLinkedInAccounts();
    }, 120000);
    
    // Cleanup on unmount
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const result = await dashboardAPI.getStats();
      if (result && result.success) {
        setDashboardStats(result.data);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  const fetchLinkedInAccounts = async () => {
    try {
      const response = await api.get('/api/linkedin-accounts');
      const result = response.data || response;
      if (result && result.success) {
        setLinkedinAccounts(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching LinkedIn accounts:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/jobs');
      // Support both Axios-style (response.data) and raw JSON (response)
      const result = response.data || response;
      if (result && result.success) {
        setJobs(result.jobs || []);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobStats = async (jobId) => {
    try {
      const response = await api.get(`/api/jobs/${jobId}/stats`);
      // Support both Axios-style (response.data) and raw JSON (response)
      const result = response.data || response;
      if (result && result.success) {
        setJobStats(result);
      }
    } catch (error) {
      console.error('Error fetching job stats:', error);
    }
  };

  const handleJobSelect = (job) => {
    setSelectedJob(job);
    fetchJobStats(job.id);
  };

  const handleExport = async (jobId, format) => {
    try {
      const response = await api.get(`/api/jobs/${jobId}/download/${format}`, {
        responseType: 'blob'
      });
      
      // Get job details for filename
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        console.error('Job not found for export');
        return;
      }
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename
      const extension = format === 'excel' ? 'xlsx' : format;
      const filename = `${job.query}_results.${extension}`;
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      console.log(`✅ Downloaded ${format} results for job: ${job.query} (${job.resultCount} results)`);
    } catch (error) {
      console.error('❌ Download failed:', error);
      alert(`Download failed: ${error.response?.data?.error || error.message}`);
    }
  };

  const handlePauseResume = async (jobId, action) => {
    try {
      console.log(`${action === 'pause' ? '⏸️' : '▶️'} ${action}ing job:`, jobId);
      
      const response = await api.post(`/api/jobs/${jobId}/${action}`);
      const result = response.data || response;
      
      if (result && result.success) {
        console.log(`✅ Job ${action}d successfully:`, result.job);
        // Refresh jobs to get updated status
        fetchJobs();
      } else {
        console.error(`❌ Failed to ${action} job:`, result);
        alert(`Failed to ${action} job: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`❌ Error ${action}ing job:`, error);
      alert(`Error ${action}ing job: ${error.response?.data?.error || error.message}`);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'pending':
      case 'fetching':
      case 'parsing':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ExclamationTriangleIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'fetching':
        return 'bg-blue-100 text-blue-800';
      case 'parsing':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <ChartBarIcon className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Unified Dashboard</h1>
            <p className="text-gray-600">Job history, progress tracking, and export center</p>
          </div>
        </div>
      </div>

      {/* Dashboard Stats */}
      {dashboardStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Completed Jobs</dt>
                    <dd className="text-lg font-medium text-gray-900">{dashboardStats.totalJobs}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Jobs</dt>
                    <dd className="text-lg font-medium text-gray-900">{dashboardStats.activeJobs}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DocumentArrowDownIcon className="h-6 w-6 text-purple-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Results</dt>
                    <dd className="text-lg font-medium text-gray-900">{dashboardStats.totalResults}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ChartBarIcon className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Success Rate</dt>
                    <dd className="text-lg font-medium text-gray-900">{dashboardStats.successRate}%</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">LinkedIn Accounts</dt>
                    <dd className="text-lg font-medium text-gray-900">{dashboardStats.totalAccounts}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LinkedIn Accounts Section */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">LinkedIn Accounts</h2>
          <p className="text-sm text-gray-500">Manage your LinkedIn accounts for scraping jobs</p>
        </div>
        
        <div className="divide-y divide-gray-200">
          {linkedinAccounts.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No LinkedIn accounts found. Add accounts to start scraping.
            </div>
          ) : (
            linkedinAccounts.map((account) => (
              <div key={account.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      account.validation_status === 'ACTIVE' ? 'bg-green-400' :
                      account.validation_status === 'FAILED' ? 'bg-red-400' :
                      'bg-yellow-400'
                    }`}></div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{account.account_name}</h3>
                      <p className="text-sm text-gray-500">{account.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      account.validation_status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                      account.validation_status === 'FAILED' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {account.validation_status}
                    </span>
                    
                    <div className="text-xs text-gray-600">
                      Requests: {account.requests_today || 0}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job List */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Job History</h2>
              <p className="text-sm text-gray-500">All scraping jobs and their current status</p>
            </div>
            
            <div className="divide-y divide-gray-200">
              {jobs.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No jobs found. Create your first scraping job to get started.
                </div>
              ) : (
                jobs.map((job) => (
                  <div 
                    key={job.id} 
                    className={`p-6 hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedJob?.id === job.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => handleJobSelect(job)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(job.status)}
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{job.query}</h3>
                          <p className="text-sm text-gray-500">
                            {job.type} • Created {formatDate(job.createdAt)}
                            {job.resultCount > 0 && ` • ${job.resultCount} results`}
                            {job.completedAt && ` • Completed ${formatDate(job.completedAt)}`}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          getStatusColor(job.status)
                        }`}>
                          {job.status}
                        </span>
                        
                        {/* Progress Info */}
                        {job.progress && job.progress.totalUrls > 0 && (
                          <div className="text-xs text-gray-600">
                            {job.progress.totalUrls} URLs • {job.progress.successful} success • {job.progress.failed} failed
                          </div>
                        )}
                        
                        {/* Pause/Resume Button */}
                        {(job.status === 'running' || job.status === 'paused') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePauseResume(job.id, job.status === 'running' ? 'pause' : 'resume');
                            }}
                            className={`px-2 py-1 text-xs rounded ${
                              job.status === 'running' 
                                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                                : 'bg-green-100 text-green-800 hover:bg-green-200'
                            }`}
                            title={job.status === 'running' ? 'Pause Job' : 'Resume Job'}
                          >
                            {job.status === 'running' ? '⏸️ Pause' : '▶️ Resume'}
                          </button>
                        )}
                        
                        {/* Download Buttons */}
                        {job.status === 'completed' && (
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExport(job.id, 'csv');
                              }}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                              title="Export as CSV"
                            >
                              CSV
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExport(job.id, 'excel');
                              }}
                              className="text-green-600 hover:text-green-800 text-sm"
                              title="Export as Excel"
                            >
                              Excel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Enhanced Progress Bar */}
                    {job.progress && job.progress.totalUrls > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>
                            {job.status === 'running' ? 'Scraping in Progress' : 
                             job.status === 'paused' ? 'Paused' : 
                             job.status === 'completed' ? 'Completed' : 'Progress'}
                          </span>
                          <span>{Math.round((job.progress.processed / job.progress.totalUrls) * 100)}%</span>
                        </div>
                        
                        {/* Multi-segment Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div className="flex h-full">
                            {/* Successful */}
                            <div 
                              className="bg-green-500 transition-all duration-300" 
                              style={{ width: `${(job.progress.successful / job.progress.totalUrls) * 100}%` }}
                            ></div>
                            {/* Failed */}
                            <div 
                              className="bg-red-500 transition-all duration-300" 
                              style={{ width: `${(job.progress.failed / job.progress.totalUrls) * 100}%` }}
                            ></div>
                            {/* Remaining space for pending */}
                          </div>
                        </div>
                        
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span className="text-green-600">✅ Success: {job.progress.successful}</span>
                          <span className="text-red-600">❌ Failed: {job.progress.failed}</span>
                          <span className="text-gray-600">⏳ Pending: {job.progress.pending}</span>
                          <span className="font-medium">Total: {job.progress.totalUrls}</span>
                        </div>
                        
                        {/* Real-time Status */}
                        {job.status === 'running' && (
                          <div className="text-xs text-blue-600 mt-1 animate-pulse">
                            🔄 Processing... ({job.progress.processed}/{job.progress.totalUrls} URLs)
                          </div>
                        )}
                        
                        {job.status === 'paused' && (
                          <div className="text-xs text-yellow-600 mt-1">
                            ⏸️ Paused at {job.progress.processed}/{job.progress.totalUrls} URLs
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Job Details Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Job Details</h2>
            </div>
            
            {selectedJob ? (
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">{selectedJob.query}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type:</span>
                      <span className="font-medium">{selectedJob.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status:</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        getStatusColor(selectedJob.status)
                      }`}>
                        {selectedJob.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Stage:</span>
                      <span className="font-medium">{selectedJob.stage || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created:</span>
                      <span className="font-medium">{formatDate(selectedJob.created_at)}</span>
                    </div>
                    {selectedJob.started_at && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Started:</span>
                        <span className="font-medium">{formatDate(selectedJob.started_at)}</span>
                      </div>
                    )}
                    {selectedJob.completed_at && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Completed:</span>
                        <span className="font-medium">{formatDate(selectedJob.completed_at)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {jobStats && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Statistics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">HTML Snapshots:</span>
                        <span className="font-medium">{jobStats.snapshots?.total_snapshots || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Results:</span>
                        <span className="font-medium">{jobStats.results?.total || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Success Rate:</span>
                        <span className="font-medium">
                          {jobStats.results?.total > 0 
                            ? Math.round((jobStats.results.success / jobStats.results.total) * 100)
                            : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedJob.status === 'completed' && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Export Results</h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleExport(selectedJob.id, 'csv')}
                        className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                        Export as CSV
                      </button>
                      <button
                        onClick={() => handleExport(selectedJob.id, 'excel')}
                        className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                        Export as Excel
                      </button>
                      <button
                        onClick={() => handleExport(selectedJob.id, 'json')}
                        className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                        Export as JSON
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500">
                <EyeIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Select a job to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedDashboard;