import React, { useState } from 'react';
import { CloudArrowUpIcon, DocumentArrowUpIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';

const BulkCompanyUpload = ({ onUploadComplete, onClose }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [dragActive, setDragActive] = useState(false);

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
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (selectedFile) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];

    if (!allowedTypes.includes(selectedFile.type) && 
        !selectedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Please select an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    setJobId(null);
    setJobStatus(null);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const previewFile = async () => {
    if (!file) return;

    try {
      const data = await parseFile(file);
      return data.slice(0, 5); // Show first 5 rows as preview
    } catch (error) {
      console.error('Error previewing file:', error);
      return [];
    }
  };

  const parseFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          if (file.name.endsWith('.csv')) {
            // Parse CSV
            const csvData = e.target.result;
            const lines = csvData.split('\n').filter(line => line.trim());
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            const data = [];
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',');
              const row = {};
              headers.forEach((header, index) => {
                row[header] = values[index] ? values[index].trim() : '';
              });
              data.push(row);
            }
            resolve(data);
          } else {
            // Parse Excel
            const workbook = XLSX.read(e.target.result, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (data.length < 2) {
              reject(new Error('File must contain at least a header row and one data row'));
              return;
            }
            
            const headers = data[0].map(h => h.toString().toLowerCase().trim());
            const rows = [];
            
            for (let i = 1; i < data.length; i++) {
              const row = {};
              headers.forEach((header, index) => {
                row[header] = data[i][index] ? data[i][index].toString().trim() : '';
              });
              rows.push(row);
            }
            
            resolve(rows);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      
      if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    });
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/company/scrape-bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setJobId(result.data.jobId);
        // Start polling for job status
        pollJobStatus(result.data.jobId);
        if (onUploadComplete) {
          onUploadComplete(result.data);
        }
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const pollJobStatus = async (jobId) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/company/jobs/${jobId}/status`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        const result = await response.json();
        
        if (result.success) {
          setJobStatus(result.data);
          
          if (result.data.status === 'running' || result.data.status === 'queued') {
            setTimeout(poll, 3000); // Poll every 3 seconds for company scraping
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    };
    
    poll();
  };

  const [preview, setPreview] = useState([]);

  React.useEffect(() => {
    if (file) {
      previewFile().then(setPreview);
    }
  }, [file]);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Bulk Company Scraping
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircleIcon className="h-6 w-6" />
            </button>
          </div>

          {!file && !jobId && (
            <div className="mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">File Requirements:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Supported formats: Excel (.xlsx, .xls) or CSV (.csv)</li>
                  <li>• Required column: <strong>url</strong>, <strong>urls</strong>, <strong>company url</strong>, <strong>company_url</strong>, or <strong>linkedin url</strong></li>
                  <li>• Maximum file size: 10MB</li>
                  <li>• Each row should contain a LinkedIn company profile URL</li>
                </ul>
              </div>

              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center ${
                  dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="mt-2 block text-sm font-medium text-gray-900">
                      Drop files here or click to upload
                    </span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileInputChange}
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    Excel or CSV up to 10MB
                  </p>
                </div>
              </div>
            </div>
          )}

          {file && !jobId && (
            <div className="mb-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <DocumentArrowUpIcon className="h-8 w-8 text-blue-500 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <XCircleIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {preview.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Preview (first 5 rows):</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(preview[0] || {}).map((header) => (
                            <th
                              key={header}
                              className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {preview.map((row, index) => (
                          <tr key={index}>
                            {Object.values(row).map((value, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="px-3 py-2 whitespace-nowrap text-sm text-gray-900"
                              >
                                {String(value).substring(0, 50)}
                                {String(value).length > 50 && '...'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setFile(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Starting Scraping...' : 'Start Bulk Scraping'}
                </button>
              </div>
            </div>
          )}

          {jobId && jobStatus && (
            <div className="mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <ClockIcon className="h-5 w-5 text-blue-400 mr-2" />
                  <h4 className="text-sm font-medium text-blue-900">
                    Bulk Company Scraping Job Status
                  </h4>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-blue-700">Status: {jobStatus.status}</span>
                    <span className="text-blue-700">Progress: {jobStatus.progress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${jobStatus.progress}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-xs text-blue-600">
                    Processed: {jobStatus.processedResults} / Total Results: {jobStatus.totalResults}
                  </div>
                  {jobStatus.status === 'running' && (
                    <div className="mt-1 text-xs text-blue-500">
                      ⏱️ Company scraping takes longer due to detailed data extraction...
                    </div>
                  )}
                </div>
              </div>

              {jobStatus.status === 'completed' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center">
                    <CheckCircleIcon className="h-5 w-5 text-green-400 mr-2" />
                    <h4 className="text-sm font-medium text-green-900">
                      Company Scraping Completed!
                    </h4>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Successfully scraped {jobStatus.totalResults} company profiles.
                  </p>
                  {jobStatus.configuration?.summary && (
                    <div className="mt-2 text-xs text-green-600">
                      <div>Total Companies: {jobStatus.configuration.summary.totalCompanies}</div>
                      <div>Successful: {jobStatus.configuration.summary.successfulCompanies}</div>
                      <div>Failed: {jobStatus.configuration.summary.failedCompanies}</div>
                    </div>
                  )}
                </div>
              )}

              {jobStatus.status === 'failed' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center">
                    <XCircleIcon className="h-5 w-5 text-red-400 mr-2" />
                    <h4 className="text-sm font-medium text-red-900">
                      Company Scraping Failed
                    </h4>
                  </div>
                  <p className="text-sm text-red-700 mt-1">
                    {jobStatus.errorMessage || 'An error occurred during company scraping'}
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setFile(null);
                    setJobId(null);
                    setJobStatus(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Start New Scraping
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkCompanyUpload;