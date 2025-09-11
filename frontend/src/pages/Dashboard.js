import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  BriefcaseIcon,
  DocumentTextIcon,
  ChartBarIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { user } = useAuth();

  const stats = [
    {
      name: 'Total Jobs',
      value: '12',
      change: '+2 from last week',
      changeType: 'positive',
      icon: BriefcaseIcon
    },
    {
      name: 'Active Jobs',
      value: '3',
      change: 'Currently running',
      changeType: 'neutral',
      icon: ChartBarIcon
    },
    {
      name: 'Total Results',
      value: '1,247',
      change: '+180 this week',
      changeType: 'positive',
      icon: DocumentTextIcon
    },
    {
      name: 'Success Rate',
      value: '94%',
      change: '+2% from last month',
      changeType: 'positive',
      icon: ChartBarIcon
    }
  ];

  const recentJobs = [
    {
      id: '1',
      type: 'Profile',
      query: 'Software Engineer',
      status: 'completed',
      results: 45,
      createdAt: '2 hours ago'
    },
    {
      id: '2',
      type: 'Company',
      query: 'Tech Startups',
      status: 'running',
      results: 12,
      createdAt: '4 hours ago'
    },
    {
      id: '3',
      type: 'Job Posting',
      query: 'Remote Developer',
      status: 'completed',
      results: 78,
      createdAt: '1 day ago'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Scraze Branding */}
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">
          SCRAZE
        </h1>
        <p className="text-lg text-gray-600 italic">
          scrap with craze
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
              {recentJobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="badge badge-secondary">{job.type}</span>
                  </td>
                  <td className="font-medium text-gray-900">{job.query}</td>
                  <td>
                    <span className={`status-${job.status}`}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </td>
                  <td className="text-gray-500">{job.results}</td>
                  <td className="text-gray-500">{job.createdAt}</td>
                  <td>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
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