import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001', // Explicit backend URL (fallback aligned with backend)
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
    
    // Token is set via authAPI.setAuthToken() - no need to set here
    // Debug token presence
    const token = localStorage.getItem('token');
    const authHeader = config.headers.Authorization || config.headers.common?.Authorization;
    console.log('🔐 Frontend Token Debug:', { 
      tokenInStorage: token ? token.substring(0, 20) + '...' : 'null',
      authHeaderSet: authHeader ? authHeader.substring(0, 30) + '...' : 'null'
    });
    
    if (!authHeader && token) {
      console.warn('⚠️ Token exists in storage but not in headers - setting manually');
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
    
    // Add user-friendly error message
    if (error.response?.status === 500) {
      console.error('🔥 Server Error: The server encountered an internal error. Please try again later.');
    } else if (error.response?.status === 404) {
      console.error('🔍 Not Found: The requested resource was not found.');
    } else if (error.response?.status === 403) {
      console.error('🚫 Forbidden: You do not have permission to access this resource.');
    }
    
    // Handle 401/403 errors (unauthorized/forbidden)
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.warn('🔐 Authentication failed - token may be invalid');
      console.log('🔐 Error details:', error.response?.data);
      console.log('🔐 Current token:', localStorage.getItem('token')?.substring(0, 50) + '...');
      
      // Only clear tokens and redirect if it's not a login request
      if (!error.config?.url?.includes('/auth/login')) {
        console.warn('🔐 Clearing invalid token and redirecting to login');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      } else {
        console.log('🔐 Login request failed - not clearing tokens');
      }
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

// Rate limiting state
let loginInProgress = false;
let lastLoginAttempt = 0;
const LOGIN_COOLDOWN = 2000; // 2 seconds between login attempts

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
  
  // Login with rate limiting
  login: async (email, password) => {
    console.log('🔐 Login attempt triggered for:', email);
    
    // Prevent multiple parallel logins
    if (loginInProgress) {
      console.warn('⚠️ Login already in progress, ignoring duplicate request');
      return Promise.reject({ message: 'Login already in progress' });
    }
    
    // Check cooldown period
    const now = Date.now();
    const timeSinceLastAttempt = now - lastLoginAttempt;
    if (timeSinceLastAttempt < LOGIN_COOLDOWN) {
      const remainingCooldown = LOGIN_COOLDOWN - timeSinceLastAttempt;
      console.warn(`⏰ Login cooldown active, wait ${remainingCooldown}ms`);
      return Promise.reject({ 
        message: `Please wait ${Math.ceil(remainingCooldown / 1000)} seconds before trying again` 
      });
    }
    
    loginInProgress = true;
    lastLoginAttempt = now;
    
    try {
      const response = await api.post('/api/auth/login', { email, password });
      console.log('✅ Login successful');
      return response;
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      
      // Handle specific error cases
      if (error.response?.status === 429) {
        console.warn('🚫 Too many login attempts detected');
        throw {
          message: 'Too many login attempts. Please wait before trying again.',
          status: 429,
          response: error.response
        };
      }
      
      if (error.response?.status === 431) {
        console.warn('📦 Request headers too large - clearing cookies');
        // Clear potentially oversized cookies
        document.cookie.split(";").forEach(function(c) { 
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
        throw {
          message: 'Request headers too large. Cookies cleared, please try again.',
          status: 431,
          response: error.response
        };
      }
      
      throw error;
    } finally {
      loginInProgress = false;
    }
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
    return api.get(`/api/jobs/${jobId}/results`, { params });
  },
  
  // Download results as CSV
  downloadResults: (jobId) => {
    return api.get(`/api/jobs/${jobId}/result`, { responseType: 'blob' });
  },
};

// Health API for testing connectivity
export const healthAPI = {
  check: () => api.get('/health'),
};

export default api;













