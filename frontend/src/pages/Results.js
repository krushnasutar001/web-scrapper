import React from 'react';
import { useParams } from 'react-router-dom';

const Results = () => {
  const { jobId } = useParams();
  
  return (
    <div className="space-y-6">
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Results
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {jobId ? `Viewing results for job ${jobId}` : 'Browse and export your scraped data'}
          </p>
        </div>
      </div>
      
      <div className="card">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Results Management
          </h3>
          <p className="text-gray-500">
            This page will display scraped results with filtering, search, and export capabilities.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Results;