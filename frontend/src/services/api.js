import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001', // Explicit backend URL
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  params: {
    _t: Date.now() // Cache busting parameter
  }
});

// Request interceptor with logging and auth
api.interceptors.request.use(
  (config) => {
    // Add logging for debugging
    console.log('🌐 API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`
    });
    
    // Add auth token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor with enhanced logging
api.interceptors.response.use(
  (response) => {
    // Log successful responses
    console.log('✅ API Response:', {
      status: response.status,
      url: response.config?.url,
      data: response.data
    });
    
    // Check for new token in response headers
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      localStorage.setItem('token', newToken);
    }
    
    return response.data;
  },
  (error) => {
    // Enhanced error logging
    console.error('❌ API Response Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      data: error.response?.data,
      headers: error.response?.headers,
      code: error.code,
      fullError: error
    });
    
    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401) {
      console.warn('🔐 Unauthorized - redirecting to login');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    // Return error in consistent format
    const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
    return Promise.reject({
      message: errorMessage,
      status: error.response?.status,
      response: error.response,
      originalError: error
    });
  }
);

// Auth API
export const authAPI = {
  // Set auth token
  setAuthToken: (token) => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  },
  
  // Clear auth token
  clearAuthToken: () => {
    delete api.defaults.headers.common['Authorization'];
  },
  
  // Login
  login: (email, password) => {
    return api.post('/api/auth/login', { email, password });
  },
  
  // Register
  register: (userData) => {
    return api.post('/api/auth/register', userData);
  },
  
  // Get profile
  getProfile: () => {
    return api.get('/api/auth/me');
  },
  
  // Update profile
  updateProfile: (profileData) => {
    return api.put('/api/auth/me', profileData);
  },
  
  // Change password
  changePassword: (currentPassword, newPassword) => {
    return api.put('/api/auth/password', {
      currentPassword,
      newPassword,
    });
  },
  
  // Forgot password
  forgotPassword: (email) => {
    return api.post('/api/auth/forgot-password', { email });
  },
  
  // Reset password
  resetPassword: (token, password) => {
    return api.post('/api/auth/reset-password', { token, password });
  },
  
  // Refresh token
  refreshToken: (refreshToken) => {
    return api.post('/api/auth/refresh', { refreshToken });
  },
  
  // Logout
  logout: () => {
    return api.post('/api/auth/logout');
  },
};

// Jobs API
export const jobsAPI = {
  // Get all jobs
  getJobs: (params = {}) => {
    return api.get('/api/jobs', { params });
  },
  
  // Get job by ID
  getJob: (id) => {
    return api.get(`/api/jobs/${id}`);
  },
  
  // Create job
  createJob: (jobData) => {
    return api.post('/api/jobs', jobData);
  },
  
  // Update job
  updateJob: (id, jobData) => {
    return api.put(`/api/jobs/${id}`, jobData);
  },
  
  // Delete job
  deleteJob: (id) => {
    return api.delete(`/api/jobs/${id}`);
  },
  
  // Cancel job
  cancelJob: (id) => {
    return api.post(`/api/jobs/${id}/cancel`);
  },
  
  // Retry job
  retryJob: (id) => {
    return api.post(`/api/jobs/${id}/retry`);
  },
  
  // Get job statistics
  getJobStats: () => {
    return api.get('/api/jobs/stats');
  },
};

// Results API
export const resultsAPI = {
  // Get results for a job
  getResults: (jobId, params = {}) => {
    return api.get(`/api/results/${jobId}`, { params });
  },
  
  // Get single result
  getResult: (jobId, resultId) => {
    return api.get(`/api/results/${jobId}/${resultId}`);
  },
  
  // Update result
  updateResult: (jobId, resultId, resultData) => {
    return api.put(`/api/results/${jobId}/${resultId}`, resultData);
  },
  
  // Delete result
  deleteResult: (jobId, resultId) => {
    return api.delete(`/api/results/${jobId}/${resultId}`);
  },
  
  // Bulk delete results
  bulkDeleteResults: (jobId, deleteData) => {
    return api.delete(`/api/results/${jobId}/bulk`, { data: deleteData });
  },
  
  // Export results
  exportResults: (jobId, format = 'csv', quality = null) => {
    const params = { format };
    if (quality) params.quality = quality;
    
    return api.get(`/api/results/${jobId}/export`, {
      params,
      responseType: 'blob', // Important for file downloads
    });
  },
};

// Utility functions
export const apiUtils = {
  // Download file from blob response
  downloadFile: (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  
  // Format error message
  formatError: (error) => {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    
    if (error.message) {
      return error.message;
    }
    
    return 'An unexpected error occurred';
  },
  
  // Check if error is network error
  isNetworkError: (error) => {
    return !error.response && error.code === 'NETWORK_ERROR';
  },
  
  // Check if error is timeout
  isTimeoutError: (error) => {
    return error.code === 'ECONNABORTED' || error.message?.includes('timeout');
  },
  
  // Retry request with exponential backoff
  retryRequest: async (requestFn, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on 4xx errors (client errors)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        // Don't retry on last attempt
        if (i === maxRetries) {
          break;
        }
        
        // Wait before retrying (exponential backoff)
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  },
};

// Health check
export const healthAPI = {
  check: () => {
    return api.get('/health');
  },
};

export default api;