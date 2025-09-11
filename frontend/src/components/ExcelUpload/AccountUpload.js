import React, { useState } from 'react';
import { CloudArrowUpIcon, DocumentArrowUpIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';

const AccountUpload = ({ onUploadComplete, onClose }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
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
    setResults(null);
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
    setResults(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/linkedin-accounts/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setResults(result.data);
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

  const [preview, setPreview] = useState([]);

  React.useEffect(() => {
    if (file) {
      previewFile().then(setPreview);
    }
  }, [file]);

  const downloadTemplate = () => {
    const csvContent = "account_name,li_at\nAccount1,AQEDAVIYJnMDhdEQAAABmQ-IACYAAAGZM5SEJlYAVO2TeFXFJ9b6Y3zNiqftB5Wvzyzjh2fDj_lVRgHv9F4BvFBLkLo67ld92RS6MhLU5X2nQCnL8KgunYc4gu6U1yCgGeYDXS2VlQcR_HWlk4yqlYSy\nAccount2,AQEFAREBAAAAABf_5rkAAAGZDyIZyQAAAZkzZ6tDTgAAtHVybjpsaTplbnRlcnByaXNlQXV0aFRva2VuOmVKeGpaQUFDbnRNNVZTQmFQQ0hLRWN5dlc4VEVDR0s0M3RDeEJ6T2l3ajJFR1JnQm1CVUdsZz09XnVybjpsaTplbnRlcnByaXNlUHJvZmlsZToodXJuOmxpOmVudGVycHJpc2VBY2NvdW50OjIxNDY1ODE3MCwzOTIxOTA1MjkpXnVybjpsaTptZW1iZXI6MTM3NzMxNDQxOXfRgo8aYsiWiljO9rumV6bO0PUqcUbgQt90kR0fMxfiO1ruAvXhKIssR6jjWNMAef121kOuDbP-HEXoWNsRo29OZ6SqQT0g-8OoEZ8mN6ifp1cFHWPnjDP0bFjFjMFajShPlAMo4O_jWelr1TqTCW6PpkpLAMsQDVFZQPvPfAQ6y1iX4s6NPy2L4jyzOoqZ87n_epk\nAccount3,AQEDASDASDASDASDASDAKJHlkjhlkjhlkjh123123456789";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'linkedin_accounts_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Upload LinkedIn Accounts
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircleIcon className="h-6 w-6" />
            </button>
          </div>

          {!file && (
            <div className="mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">File Requirements:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Supported formats: Excel (.xlsx, .xls) or CSV (.csv)</li>
                  <li>• Required columns: <strong>account_name</strong> and <strong>li_at</strong></li>
                  <li>• li_at cookie format: Raw cookie value (e.g., AQEDAVIYJnMDhdEQ...)</li>
                  <li>• Maximum file size: 10MB</li>
                  <li>• Each row represents one LinkedIn account</li>
                </ul>
              </div>

              <div className="mb-4">
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <DocumentArrowUpIcon className="-ml-1 mr-2 h-5 w-5 text-gray-400" />
                  Download Template
                </button>
                <p className="mt-1 text-xs text-gray-500">
                  Download a CSV template with the correct column format
                </p>
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

          {file && !results && (
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
                  {uploading ? 'Uploading...' : 'Upload Accounts'}
                </button>
              </div>
            </div>
          )}

          {results && (
            <div className="mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-green-400 mr-2" />
                  <h4 className="text-sm font-medium text-green-900">
                    Upload Complete!
                  </h4>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Processed {results.total} accounts. {results.successful.length} successful, {results.failed.length} failed.
                </p>
                {results.successful.length > 0 && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      🔍 <strong>Automatic validation is now running!</strong><br/>
                      ⏳ Account status will update to ACTIVE or INVALID within a few moments.<br/>
                      🔄 The accounts page refreshes automatically to show real-time status.
                    </p>
                  </div>
                )}
              </div>

              {results.successful.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-green-900 mb-2">
                    Successfully Added ({results.successful.length}):
                  </h4>
                  <div className="bg-white border rounded-lg max-h-32 overflow-y-auto">
                    {results.successful.map((account, index) => (
                      <div key={index} className="px-3 py-2 border-b last:border-b-0">
                        <span className="text-sm text-gray-900">{account.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.failed.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-red-900 mb-2">
                    Failed ({results.failed.length}):
                  </h4>
                  <div className="bg-white border rounded-lg max-h-32 overflow-y-auto">
                    {results.failed.map((failure, index) => (
                      <div key={index} className="px-3 py-2 border-b last:border-b-0">
                        <div className="text-sm text-gray-900">{failure.name}</div>
                        <div className="text-xs text-red-600">{failure.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setFile(null);
                    setResults(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Upload Another File
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

export default AccountUpload;