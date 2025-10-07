import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { dashboardAPI } from '../services/api';
import {
  BriefcaseIcon,
  DocumentTextIcon,
  ChartBarIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState([
    {
      name: 'Total Jobs',
      value: '0',
      change: 'Loading...',
      changeType: 'neutral',
      icon: BriefcaseIcon
    },
    {
      name: 'Active Jobs',
      value: '0',
      change: 'Loading...',
      changeType: 'neutral',
      icon: ChartBarIcon
    },
    {
      name: 'Total Results',
      value: '0',
      change: 'Loading...',
      changeType: 'neutral',
      icon: DocumentTextIcon
    },
    {
      name: 'Success Rate',
      value: '0%',
      change: 'Loading...',
      changeType: 'neutral',
      icon: ChartBarIcon
    }
  ]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const didInitRef = useRef(false);
  const last429Ref = useRef(0);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    // Prevent double-invocation in React 18 StrictMode (dev only)
    if (!didInitRef.current) {
      didInitRef.current = true;
      fetchDashboardData();
    }

    // Poll every 10 seconds, with simple backoff after 429
    pollIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const backoffActive = (now - last429Ref.current) < 60000; // 60s backoff
      if (!backoffActive) {
        fetchDashboardData();
      }
    }, 10000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const fetchDashboardData = async () => {
    if (isFetchingRef.current) return; // Avoid overlapping requests
    try {
      isFetchingRef.current = true;
      setLoading(true);
      
      // Fetch dashboard stats with fallback and normalization
      const statsResult = await dashboardAPI.getStats();
      if (statsResult && statsResult.success) {
        const data = statsResult.data || {};
        const totalJobs = (data.totalJobs ?? data.total_jobs ?? 0).toString();
        const jobsThisWeek = data.jobsThisWeek ?? data.jobs_this_week ?? 0;
        const activeJobs = (data.activeJobs ?? data.active_jobs ?? 0).toString();
        const totalResults = (data.totalResults ?? data.total_results ?? 0);
        const resultsThisWeek = data.resultsThisWeek ?? data.results_this_week ?? 0;
        const successRate = Math.round(data.successRate ?? data.success_rate ?? 0);

        setStats([
          {
            name: 'Total Jobs',
            value: totalJobs,
            change: `${jobsThisWeek} this week`,
            changeType: jobsThisWeek > 0 ? 'positive' : 'neutral',
            icon: BriefcaseIcon
          },
          {
            name: 'Active Jobs',
            value: activeJobs,
            change: 'Currently running',
            changeType: 'neutral',
            icon: ChartBarIcon
          },
          {
            name: 'Total Results',
            value: totalResults.toLocaleString(),
            change: `${resultsThisWeek} this week`,
            changeType: resultsThisWeek > 0 ? 'positive' : 'neutral',
            icon: DocumentTextIcon
          },
          {
            name: 'Success Rate',
            value: `${successRate}%`,
            change: `${successRate >= 90 ? 'Excellent' : successRate >= 70 ? 'Good' : 'Needs improvement'}`,
            changeType: successRate >= 90 ? 'positive' : successRate >= 70 ? 'neutral' : 'negative',
            icon: ChartBarIcon
          }
        ]);
      }

      // Fetch recent jobs with fallback on server errors
      try {
        const jobsResponse = await api.get('/api/jobs?limit=5');
        if (jobsResponse.data && jobsResponse.data.success) {
          setRecentJobs(jobsResponse.data.jobs || []);
        }
      } catch (jobsErr) {
        // Mark last 429 occurrence and pause polling briefly
        const status = jobsErr?.status || jobsErr?.response?.status;
        if (status === 429) {
          last429Ref.current = Date.now();
          console.warn('⚠️ Rate limited on /api/jobs; pausing polling for 60s');
        }
        if (status === 500 || status === 404) {
          try {
            const fallbackJobs = await api.get('/api/jobs');
            if (fallbackJobs.data && fallbackJobs.data.success) {
              setRecentJobs(fallbackJobs.data.jobs || []);
            }
          } catch (fallbackJobsErr) {
            console.error('❌ Fallback jobs fetch failed:', fallbackJobsErr);
          }
        } else {
          console.error('❌ Jobs fetch failed:', jobsErr);
        }
      }
      
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      // Keep default loading state if API fails
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Recent jobs are now fetched from API in useEffect
  
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getJobTypeDisplay = (type) => {
    switch (type) {
      case 'profile_scraping':
        return 'Profile';
      case 'company_scraping':
        return 'Company';
      case 'search_result_scraping':
        return 'Search';
      default:
        return type || 'Unknown';
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Scralytics Hub Branding */}
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">
          SCRALYTICS HUB
        </h1>
        <p className="text-lg text-gray-600">
          Automate. Enrich. Analyze.
        </p>
      </div>

      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Welcome back, {user?.firstName || 'User'}!
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Here's what's happening with your LinkedIn automation jobs.
          </p>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            onClick={fetchDashboardData}
            className="btn btn-secondary ml-2"
          >
            Refresh
          </button>
          <Link
            to="/jobs"
            className="btn btn-primary"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            New Job
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card card-hover">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <stat.icon className="h-8 w-8 text-primary-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {stat.name}
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      {stat.value}
                    </div>
                    <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                      stat.changeType === 'positive' ? 'text-success-600' :
                      stat.changeType === 'negative' ? 'text-error-600' :
                      'text-gray-500'
                    }`}>
                      {stat.change}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Jobs */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">Recent Jobs</h3>
          <Link
            to="/jobs"
            className="text-sm font-medium text-primary-600 hover:text-primary-500"
          >
            View all
          </Link>
        </div>
        
        <div className="overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Query</th>
                <th>Status</th>
                <th>Results</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentJobs.length > 0 ? (
                recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {getJobTypeDisplay(job.job_type)}
                      </span>
                    </td>
                    <td className="font-medium text-gray-900">{job.job_name}</td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
                    </td>
                    <td className="text-gray-500">{job.result_count || 0}</td>
                    <td className="text-gray-500">
                      {job.created_at ? new Date(job.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td>
                      <Link
                        to={`/jobs/${job.id}`}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-500">
                    {loading ? 'Loading jobs...' : 'No recent jobs found. Create your first job to get started!'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/jobs" className="card card-hover group">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BriefcaseIcon className="h-8 w-8 text-primary-600 group-hover:text-primary-700" />
            </div>
            <div className="ml-4">
              <h4 className="text-lg font-medium text-gray-900 group-hover:text-primary-700">
                Manage Jobs
              </h4>
              <p className="text-sm text-gray-500">
                Create, monitor, and manage your scraping jobs
              </p>
            </div>
          </div>
        </Link>

        <Link to="/results" className="card card-hover group">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DocumentTextIcon className="h-8 w-8 text-primary-600 group-hover:text-primary-700" />
            </div>
            <div className="ml-4">
              <h4 className="text-lg font-medium text-gray-900 group-hover:text-primary-700">
                View Results
              </h4>
              <p className="text-sm text-gray-500">
                Browse and export your scraped data
              </p>
            </div>
          </div>
        </Link>

        <Link to="/profile" className="card card-hover group">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-primary-600 group-hover:text-primary-700" />
            </div>
            <div className="ml-4">
              <h4 className="text-lg font-medium text-gray-900 group-hover:text-primary-700">
                Analytics
              </h4>
              <p className="text-sm text-gray-500">
                View detailed statistics and insights
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;