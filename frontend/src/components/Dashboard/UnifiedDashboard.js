import React, { useState, useEffect } from 'react';
import { 
  ChartBarIcon, 
  DocumentArrowDownIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon,
  EyeIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';

const UnifiedDashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobStats, setJobStats] = useState(null);
  const [exportFormat, setExportFormat] = useState('csv');

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/jobs');
      if (response.data.success) {
        setJobs(response.data.jobs || []);
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
      if (response.data.success) {
        setJobStats(response.data);
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
      const response = await api.get(`/api/jobs/${jobId}/results?format=${format}&download=true`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const job = jobs.find(j => j.id === jobId);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = format === 'excel' ? 'xlsx' : format;
      const filename = `${job?.job_name || 'export'}_${job?.job_type}_${timestamp}.${extension}`;
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error exporting results:', error);
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

  const calculateProgress = (job) => {
    if (job.total_items === 0) return 0;
    if (job.stage === 'fetcher') {
      return Math.round((job.fetched_items / job.total_items) * 50);
    } else if (job.stage === 'parser') {
      return 50 + Math.round((job.parsed_items / job.total_items) * 50);
    } else if (job.stage === 'completed') {
      return 100;
    }
    return job.progress || 0;
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
                          <h3 className="text-sm font-medium text-gray-900">{job.job_name}</h3>
                          <p className="text-sm text-gray-500">
                            {job.job_type} • Created {formatDate(job.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          getStatusColor(job.status)
                        }`}>
                          {job.status}
                        </span>
                        
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
                    
                    {/* Progress Bar */}
                    {(job.status === 'fetching' || job.status === 'parsing' || job.total_items > 0) && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>
                            {job.stage === 'fetcher' ? 'Fetching' : job.stage === 'parser' ? 'Parsing' : 'Progress'}
                          </span>
                          <span>{calculateProgress(job)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${calculateProgress(job)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>Fetched: {job.fetched_items || 0}</span>
                          <span>Parsed: {job.parsed_items || 0}</span>
                          <span>Total: {job.total_items || 0}</span>
                        </div>
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
                  <h3 className="text-sm font-medium text-gray-900 mb-2">{selectedJob.job_name}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type:</span>
                      <span className="font-medium">{selectedJob.job_type}</span>
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