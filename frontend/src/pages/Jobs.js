import React, { useState, useEffect } from 'react';
import { PlusIcon, EyeIcon, ArrowDownTrayIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import NewJobModal from '../components/Jobs/NewJobModal';
import BulkSearchUpload from '../components/ExcelUpload/BulkSearchUpload';
import BulkCompanyUpload from '../components/ExcelUpload/BulkCompanyUpload';
import api from '../services/api';

const Jobs = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showBulkSearchModal, setShowBulkSearchModal] = useState(false);
  const [showBulkCompanyModal, setShowBulkCompanyModal] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [notification, setNotification] = useState(null);

  const jobTypeColors = {
    profile: 'bg-blue-100 text-blue-800',
    company: 'bg-green-100 text-green-800',
    search: 'bg-purple-100 text-purple-800',
    profile_scraping: 'bg-blue-100 text-blue-800',
    company_scraping: 'bg-green-100 text-green-800',
    search_result_scraping: 'bg-purple-100 text-purple-800',
    sales_navigator: 'bg-indigo-100 text-indigo-800',
    unknown: 'bg-gray-100 text-gray-800'
  };

  const statusColors = {
    queued: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800'
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/jobs');
      
      console.log('📦 Raw jobs response:', response);
      
      // Support both Axios interceptor (returns data directly) and raw Axios response
      const result = Array.isArray(response) ? response : (response?.data ?? response);
      
      console.log('📦 Parsed jobs result:', result);
      
      if (Array.isArray(result)) {
        // Mock backend returns a plain array of jobs
        setJobs(result);
        console.log('✅ Jobs loaded (array):', result.length);
      } else if (result && result.success === true) {
        // Real backend returns { success, jobs }
        const jobsList = result.jobs || result.data?.jobs || [];
        setJobs(jobsList);
        console.log('✅ Jobs loaded (object):', jobsList.length);
      } else {
        console.error('❌ Unexpected jobs response format:', result);
        setJobs([]);
      }
    } catch (error) {
      console.error('❌ Error fetching jobs:', error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportJob = async (jobId, jobName) => {
    try {
      const response = await api.get(`/api/jobs/${jobId}/export`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${jobName}_results.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export job:', error);
      alert('Failed to export job results');
    }
  };

  const handleCancelJob = async (jobId) => {
    try {
      await api.post(`/api/jobs/${jobId}/cancel`);
      fetchJobs(); // Refresh the job list
    } catch (error) {
      console.error('Failed to cancel job:', error);
      alert('Failed to cancel job');
    }
  };

  const getStatusBadge = (status) => {
    const colorClass = statusColors[status] || 'bg-gray-100 text-gray-800';
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  /**
   * Safely renders a job type badge with proper null checks
   * Handles cases where jobType is undefined, null, or empty string
   * @param {string|undefined|null} jobType - The job type to display
   * @returns {JSX.Element} A styled badge component
   */
  const getJobTypeBadge = (jobType) => {
    // Safely handle undefined, null, or empty jobType
    const safeJobType = jobType && typeof jobType === 'string' ? jobType.trim() : '';
    
    // Use fallback if jobType is invalid
    const normalizedType = safeJobType || 'unknown';
    
    // Get color class with fallback
    const colorClass = jobTypeColors[normalizedType] || 'bg-gray-100 text-gray-800';
    
    // Safely create display name with proper checks
    let displayName;
    if (normalizedType === 'sales_navigator') {
      displayName = 'Sales Navigator';
    } else if (normalizedType === 'unknown') {
      displayName = 'Unknown';
    } else {
      // Safe string manipulation with charAt check
      displayName = normalizedType.length > 0 
        ? normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)
        : 'N/A';
    }
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {displayName}
      </span>
    );
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    return job.status === filter;
  });

  const handleCreateJob = async (jobData) => {
    try {
      let response;
      
      // Check if file upload is being used
      if (jobData.file) {
        // Use FormData for file uploads
        const formData = new FormData();
        formData.append('file', jobData.file);
        // Map to backend expected field names
        formData.append('job_type', jobData.jobType);           // Backend expects 'job_type'
        formData.append('job_name', jobData.jobName || jobData.searchQuery); // Backend expects 'job_name'
        formData.append('max_results', jobData.maxPages || 100);
        formData.append('accountSelectionMode', jobData.accountSelectionMode || 'rotation');
        
        // Add URLs if provided (for mixed input)
        if (jobData.urls && jobData.urls.length > 0) {
          formData.append('urls', jobData.urls.join('\n'));
        }
        
        console.log('🚀 FormData details:');
        console.log('  - job_type:', jobData.jobType);
        console.log('  - job_name:', jobData.jobName || jobData.searchQuery);
        console.log('  - file:', jobData.file.name);
        console.log('  - urls count:', jobData.urls?.length || 0);
        
        // Add selected account IDs
        if (jobData.selectedAccountIds && jobData.selectedAccountIds.length > 0) {
          jobData.selectedAccountIds.forEach((accountId, index) => {
            formData.append(`selectedAccountIds[${index}]`, accountId);
          });
          console.log('  - selectedAccountIds:', jobData.selectedAccountIds);
        }
        
        // Send FormData with proper headers
        response = await api.post('/api/jobs', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      } else {
        // Use JSON for manual URL input (no file)
        // Map frontend fields to backend expected fields (camelCase)
        const payload = {
          jobType: jobData.jobType,                    // Backend expects 'jobType'
          jobName: jobData.jobName || jobData.searchQuery, // Backend expects 'jobName'
          searchQuery: jobData.searchQuery,            // Backend expects 'searchQuery'
          urls: jobData.urls || [],                    // Backend expects 'urls' as direct field
          accountSelectionMode: jobData.accountSelectionMode || 'rotation',
          selectedAccountIds: jobData.selectedAccountIds || []
        };
        
        console.log('🚀 Payload details:');
        console.log('  - jobType:', payload.jobType);
        console.log('  - jobName:', payload.jobName);
        console.log('  - searchQuery:', payload.searchQuery);
        console.log('  - urls count:', payload.urls.length);
        console.log('  - urls sample:', payload.urls.slice(0, 3));
        console.log('  - accountSelectionMode:', payload.accountSelectionMode);
        console.log('  - selectedAccountIds:', payload.selectedAccountIds);
        
        console.log('🚀 Sending payload to backend:', payload);

        response = await api.post('/api/jobs', payload);
      }

      // Enhanced debugging for response structure
      console.log('🔍 Full response object:', response);
      console.log('🔍 Response status:', response?.status);
      console.log('🔍 Response headers:', response?.headers);
      console.log('🔍 Response data:', response?.data);
      console.log('🔍 Response data type:', typeof response?.data);
      
      // Check if response exists
      if (!response) {
        console.error('❌ No response received from server');
        alert('Failed to create job: No response from server');
        return;
      }
      
      // Handle both Axios-style (response.data) and raw JSON responses
      // Some libraries put payload inside response.data, others send raw JSON
      const result = response.data || response;
      console.log('🔍 Parsed result:', result);
      console.log('🔍 Result success:', result.success);
      console.log('🔍 Result job:', result.job);
      
      if (result && result.success === true) {
        if (result.job) {
          console.log('✅ Job created successfully:', result.job);
          await fetchJobs(); // Refresh jobs list
          setIsModalOpen(false);
          // Show success notification (you can replace this with a toast notification)
          setNotification({
            type: 'success',
            message: `Job "${result.job.job_name}" created successfully! Processing will begin shortly.`,
            details: `Job ID: ${result.job.id} | Type: ${result.job.job_type} | URLs: ${result.job.total_urls || 'N/A'}`
          });
        } else {
          console.warn('⚠️ Success but no job object:', result);
          setNotification({
            type: 'warning',
            message: 'Job created but response format is unexpected',
            details: 'The job may have been created successfully, but we received an unexpected response format.'
          });
        }
      } else {
        console.error('❌ Job creation failed:', result);
        const errorMsg = result?.error || result?.message || 'Unknown error';
        const errorCode = result?.code || 'UNKNOWN_ERROR';
        const errorDetails = result?.received || result?.validTypes || result?.invalidUrls || null;
        
        setNotification({
          type: 'error',
          message: `Failed to create job: ${errorMsg}`,
          details: errorCode === 'MISSING_FIELDS' ? 'Please ensure all required fields are filled out.' :
                   errorCode === 'INVALID_JOB_TYPE' ? `Valid job types: ${errorDetails?.join(', ')}` :
                   errorCode === 'NO_VALID_URLS' ? 'Please provide valid LinkedIn URLs.' :
                   errorCode === 'NO_VALID_ACCOUNTS' ? 'Please select valid LinkedIn accounts.' :
                   `Error code: ${errorCode}`
        });
      }
    } catch (error) {
      console.error('Failed to create job:', error);
      console.error('Error response:', error.response);
      
      const errorData = error.response?.data;
      const errorMessage = errorData?.error || error.message || 'Unknown error';
      const errorCode = errorData?.code || 'NETWORK_ERROR';
      const statusCode = error.response?.status;
      
      setNotification({
        type: 'error',
        message: `Failed to create job: ${errorMessage}`,
        details: statusCode === 403 ? 'You do not have permission to create jobs. Please check your authentication.' :
                 statusCode === 401 ? 'Your session has expired. Please log in again.' :
                 statusCode === 400 ? 'Invalid request data. Please check your input and try again.' :
                 statusCode === 500 ? 'Server error. Please try again later.' :
                 `HTTP ${statusCode} - ${errorCode}`
      });
    }
  };

  // Remove duplicate - already defined above

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-600 mt-1">
            Manage your scraping jobs and bulk operations
          </p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
          >
            <PlusIcon className="h-5 w-5" />
            <span>New Job</span>
          </button>
          <button 
             onClick={() => setShowBulkSearchModal(true)}
             className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors flex items-center space-x-2"
           >
             <DocumentArrowUpIcon className="h-5 w-5" />
             <span>Bulk Search</span>
           </button>
           <button 
             onClick={() => setShowBulkCompanyModal(true)}
             className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors flex items-center space-x-2"
           >
             <DocumentArrowUpIcon className="h-5 w-5" />
             <span>Bulk Company</span>
           </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { key: 'all', label: 'All Jobs' },
            { key: 'profile', label: 'Profile' },
            { key: 'company', label: 'Company' },
            { key: 'search', label: 'Search' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading jobs...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-600 mb-4">
              {filter === 'all' ? 'No jobs created yet.' : `No ${filter} jobs found.`}
            </p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Create Your First Job
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Query/File
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
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
                {Array.isArray(filteredJobs) && filteredJobs.length > 0 ? (
                  filteredJobs.map((job) => {
                    // Safe job object validation
                    if (!job || typeof job !== 'object') {
                      console.warn('Invalid job object:', job);
                      return null;
                    }
                    
                    const jobId = job.id || `unknown-${Math.random().toString(36).substr(2, 9)}`;
                    const jobQuery = job.query || job.job_name || `Job ${jobId.toString().slice(0, 8)}`;
                    
                    return (
                      <tr key={jobId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {jobQuery}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getJobTypeBadge(job.type || job.job_type)}
                        </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {job.type === 'sales_navigator' ? 
                          (job.configuration?.searchQuery || job.query || 'Search query') :
                          `${(job.configuration?.urls || []).length} URLs`
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(job.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-sky-500 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${job.progress?.percentage || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">{job.progress?.percentage || 0}%</span>
                        {job.progress && job.progress.totalUrls > 0 && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({job.progress.successful || 0}/{job.progress.totalUrls || 0})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => window.open(`/jobs/${job.id}`, '_blank')}
                          className="text-sky-600 hover:text-sky-900 transition-colors"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {job.status === 'completed' && job.totalResults > 0 && (
                          <button 
                            onClick={() => handleExportJob(job.id, job.query)}
                            className="text-green-600 hover:text-green-900 transition-colors"
                            title="Export Results"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4" />
                          </button>
                        )}
                        {(job.status === 'pending' || job.status === 'running') && (
                          <button 
                            onClick={() => handleCancelJob(job.id)}
                            className="text-rose-600 hover:text-rose-900 transition-colors"
                            title="Cancel Job"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                    );
                  }).filter(Boolean) // Remove null entries from invalid jobs
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                      {loading ? 'Loading jobs...' : 'No jobs found. Create your first job to get started!'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 max-w-md p-4 rounded-lg shadow-lg z-50 ${
          notification.type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' :
          notification.type === 'warning' ? 'bg-yellow-100 border border-yellow-400 text-yellow-700' :
          'bg-red-100 border border-red-400 text-red-700'
        }`}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="font-medium">{notification.message}</div>
              {notification.details && (
                <div className="text-sm mt-1 opacity-90">{notification.details}</div>
              )}
            </div>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* New Job Modal */}
      <NewJobModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateJob}
      />

      {/* Bulk Search Upload Modal */}
      {showBulkSearchModal && (
        <BulkSearchUpload 
          onUploadComplete={(result) => {
            console.log(`Bulk search job created: ${result.jobId}`);
            fetchJobs(); // Refresh the jobs list
            setShowBulkSearchModal(false);
          }}
          onClose={() => setShowBulkSearchModal(false)}
        />
      )}

      {/* Bulk Company Upload Modal */}
      {showBulkCompanyModal && (
        <BulkCompanyUpload 
          onUploadComplete={(result) => {
            console.log(`Bulk company job created: ${result.jobId}`);
            fetchJobs(); // Refresh the jobs list
            setShowBulkCompanyModal(false);
          }}
          onClose={() => setShowBulkCompanyModal(false)}
        />
      )}
    </div>
  );
};

export default Jobs;