import React, { useState, useEffect } from 'react';
import { PlusIcon, EyeIcon, ArrowDownTrayIcon, FunnelIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import NewJobModal from '../components/Jobs/NewJobModal';
import BulkSearchUpload from '../components/ExcelUpload/BulkSearchUpload';
import BulkCompanyUpload from '../components/ExcelUpload/BulkCompanyUpload';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Jobs = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showBulkSearchModal, setShowBulkSearchModal] = useState(false);
  const [showBulkCompanyModal, setShowBulkCompanyModal] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const { user } = useAuth();

  const jobTypeColors = {
    profile: 'bg-blue-100 text-blue-800',
    company: 'bg-green-100 text-green-800',
    search: 'bg-purple-100 text-purple-800'
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

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/jobs');
      console.log('Jobs API response:', response.data);
      if (response && response.data && response.data.success) {
        setJobs(response.data.jobs || []);
      } else {
        console.warn('Invalid jobs response format:', response);
        setJobs([]);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
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

  const getJobTypeBadge = (jobType) => {
    const colorClass = jobTypeColors[jobType] || 'bg-gray-100 text-gray-800';
    const displayName = jobType === 'sales_navigator' ? 'Sales Navigator' : jobType.charAt(0).toUpperCase() + jobType.slice(1);
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
        formData.append('jobName', jobData.jobName);
        formData.append('jobType', jobData.jobType);
        formData.append('accountSelectionMode', jobData.accountSelectionMode || 'rotation');
        
        // Add selected account IDs
        if (jobData.selectedAccountIds && jobData.selectedAccountIds.length > 0) {
          jobData.selectedAccountIds.forEach((accountId, index) => {
            formData.append(`selectedAccountIds[${index}]`, accountId);
          });
        }
        
        // Send FormData with proper headers
        response = await api.post('/api/jobs', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      } else {
        // Use JSON for manual URL input (no file)
        const payload = {
          jobName: jobData.jobName,
          jobType: jobData.jobType,
          accountSelectionMode: jobData.accountSelectionMode || 'rotation',
          selectedAccountIds: jobData.selectedAccountIds || []
        };
        
        if (jobData.jobType === 'sales_navigator') {
          payload.searchQuery = jobData.searchQuery;
          payload.maxPages = jobData.maxPages || 5;
        } else {
          // For profiles and companies, send URLs
          payload.urls = jobData.urls || [];
        }

        response = await api.post('/api/jobs', payload);
      }

      if (response.data.success) {
        await fetchJobs(); // Refresh jobs list
        setIsModalOpen(false);
        alert('Job created successfully! It will be processed in the background.');
      }
    } catch (error) {
      console.error('Failed to create job:', error);
      alert('Failed to create job: ' + (error.response?.data?.error || error.message));
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

  const getQueryDisplay = (job) => {
    if (job.type === 'search') {
      return job.query || job.searchQuery || 'Search query';
    }
    return job.fileName || 'Uploaded file';
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
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {job.jobName || `Job ${job.id.slice(0, 8)}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getJobTypeBadge(job.job_type)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {job.job_type === 'sales_navigator' ? 
                          (JSON.parse(job.input_data || '{}').searchQuery || 'Search query') :
                          `${(JSON.parse(job.input_data || '{}').urls || []).length} URLs`
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
                            style={{ width: `${job.progress || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">{job.progress || 0}%</span>
                        {job.totalResults > 0 && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({job.successfulResults}/{job.totalResults})
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
                            onClick={() => handleExportJob(job.id, job.job_name)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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