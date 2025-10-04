import axios from 'axios';

// Normalize login responses from different backend implementations
// Returns a consistent shape: { success, authToken, user, refreshToken, message }
function normalizeLoginResponse(respData) {
  try {
    const data = respData && respData.data ? respData.data : respData;

    const authToken = (
      data?.authToken ||
      data?.token ||
      data?.data?.token ||
      data?.accessToken ||
      data?.data?.accessToken ||
      null
    );

    const user = (
      data?.user ||
      data?.data?.user ||
      data?.profile ||
      null
    );

    const refreshToken = (
      data?.refreshToken ||
      data?.data?.refreshToken ||
      null
    );

    const success = Boolean(
      data?.success === true ||
      data?.ok === true ||
      authToken
    );

    if (!success) {
      const message = (
        data?.message ||
        data?.error ||
        (typeof data === 'string' ? data : 'Login failed')
      );
      return { success: false, message };
    }

    return {
      success: true,
      authToken,
      user,
      refreshToken,
      message: data?.message || 'Login successful',
    };
  } catch (err) {
    return { success: false, message: 'Login response parsing error' };
  }
}

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
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
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
      console.warn('🔐 Authentication failed or unauthorized response detected');
      console.log('🔐 Error details:', error.response?.data);
      // Do NOT auto-clear tokens or redirect; let the app handle gracefully
      // This avoids unexpected logout on background requests or transient errors
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
      const respData = await api.post('/api/login', { email, password });
      console.log('✅ Login successful via /api/login');
      // Normalize response shape
      const normalized = normalizeLoginResponse(respData);
      return normalized;
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
      
      // Fallback: if alias not found, try legacy /api/auth/login
      const status = (error?.response?.status ?? error?.status);
      const dataText = typeof error?.response?.data === 'string' ? error.response.data : '';
      const isNotFound = status === 404 || (dataText && dataText.includes('Cannot POST /api/login'));
      if (isNotFound) {
        console.warn('🔁 /api/login alias not available, falling back to /api/auth/login');
        const legacyData = await api.post('/api/auth/login', { email, password });
        console.log('✅ Login successful via /api/auth/login');
        const normalized = normalizeLoginResponse(legacyData);
        return normalized;
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

// Dashboard API with 404 fallback and normalization
export const dashboardAPI = {
  // Get dashboard stats with fallbacks
  getStats: async () => {
    const getStoredToken = () => (
      localStorage.getItem('authToken') || localStorage.getItem('token') || ''
    );

    const tryAbsoluteUrl = async (url) => {
      const token = getStoredToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await axios.get(url, { headers, params: { _t: Date.now() } });
      return resp.data || resp;
    };

    // Helper to detect HTML 404 pages like "Cannot GET /api/dashboard/stats"
    const isLikelyHtmlNotFound = (data) => {
      if (typeof data === 'string') {
        const s = data.toLowerCase();
        return s.includes('<html') && (s.includes('cannot get') || s.includes('cannot post'));
      }
      return false;
    };

    // Normalize various backend response shapes into a single structure
    const normalizeDashboardResponse = (resp) => {
      const root = resp && resp.data ? resp.data : resp;
      const payload = root?.data || root?.stats || root;

      const stats = payload?.stats || {};
      const recentJobs = payload?.recentJobs || root?.recentJobs || [];

      const totalJobs = (
        payload?.totalJobs ?? payload?.total_jobs ?? stats?.completed ?? 0
      );
      const activeJobs = (
        payload?.activeJobs ?? payload?.active_jobs ?? stats?.running ?? 0
      );
      const pendingJobs = (
        payload?.pendingJobs ?? payload?.pending_jobs ?? stats?.queued ?? 0
      );
      const failedJobs = (
        payload?.failedJobs ?? payload?.failed_jobs ?? stats?.failed ?? 0
      );
      const totalResults = (
        payload?.totalResults ?? payload?.total_results ?? 0
      );
      const successRate = (
        payload?.successRate ?? payload?.success_rate ?? 0
      );
      const jobsThisWeek = (
        payload?.jobsThisWeek ?? payload?.jobs_this_week ?? 0
      );
      const resultsThisWeek = (
        payload?.resultsThisWeek ?? payload?.results_this_week ?? 0
      );

      return {
        success: true,
        data: {
          totalJobs,
          activeJobs,
          pendingJobs,
          failedJobs,
          totalResults,
          successRate,
          jobsThisWeek,
          resultsThisWeek,
          recentJobs
        }
      };
    };

    try {
      // Primary endpoint (current baseURL)
      const resp = await api.get('/api/dashboard/stats');
      return normalizeDashboardResponse(resp);
    } catch (error) {
      const status = error?.status || error?.response?.status;
      const raw = error?.response?.data;
      const notFound = status === 404 || isLikelyHtmlNotFound(raw);

      if (!notFound) {
        throw error;
      }

      // Fallback chain (same host)
      const fallbacks = ['/api/stats', '/api/jobs/stats'];
      for (const path of fallbacks) {
        try {
          const fallbackResp = await api.get(path);
          return normalizeDashboardResponse(fallbackResp);
        } catch (fallbackErr) {
          const fbStatus = fallbackErr?.status || fallbackErr?.response?.status;
          const fbRaw = fallbackErr?.response?.data;
          const fbNotFound = fbStatus === 404 || isLikelyHtmlNotFound(fbRaw);
          if (!fbNotFound) {
            // Other error type; stop here
            throw fallbackErr;
          }
          // else continue to next fallback
        }
      }

      // Legacy server fallback (port 5002), try dashboard first
      const legacyBase = 'http://localhost:5002';
      try {
        const legacyResp = await tryAbsoluteUrl(`${legacyBase}/api/dashboard/stats`);
        return normalizeDashboardResponse(legacyResp);
      } catch (legacyErr) {
        const ls = legacyErr?.status || legacyErr?.response?.status;
        const lr = legacyErr?.response?.data;
        const legacyNotFound = ls === 404 || isLikelyHtmlNotFound(lr);
        if (!legacyNotFound && ls) {
          throw legacyErr;
        }
      }

      // As a last resort, fetch jobs list and compute basic stats
      try {
        const jobsResp = await tryAbsoluteUrl(`${legacyBase}/api/jobs`);
        const jobsPayload = jobsResp?.data || jobsResp?.jobs || jobsResp || [];
        const jobs = Array.isArray(jobsPayload) ? jobsPayload : (jobsPayload.jobs || []);
        const totalJobs = jobs.length;
        const completedJobs = jobs.filter(j => j.status === 'completed').length;
        const runningJobs = jobs.filter(j => j.status === 'running').length;
        const pausedJobs = jobs.filter(j => j.status === 'paused').length;
        const failedJobs = jobs.filter(j => j.status === 'failed').length;
        const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'queued').length;
        const activeJobs = runningJobs + pausedJobs;
        const totalResults = jobs.reduce((sum, j) => sum + (j.resultCount || j.result_count || 0), 0);
        const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
        const recentJobs = jobs.slice(0, 5);

        return {
          success: true,
          data: {
            totalJobs: completedJobs,
            activeJobs,
            pendingJobs,
            failedJobs,
            totalResults,
            successRate,
            jobsThisWeek: 0,
            resultsThisWeek: 0,
            recentJobs
          }
        };
      } catch (_) {
        // ignore and fall through to empty structure
      }

      // If all fallbacks fail with 404, return a safe empty structure
      return {
        success: true,
        data: {
          totalJobs: 0,
          activeJobs: 0,
          pendingJobs: 0,
          failedJobs: 0,
          totalResults: 0,
          successRate: 0,
          jobsThisWeek: 0,
          resultsThisWeek: 0,
          recentJobs: []
        }
      };
    }
  }
};

// LinkedIn Accounts API
export const linkedinAccountsAPI = {
  // Get all accounts
  getAccounts: () => {
    return api.get('/api/linkedin-accounts');
  },
  
  // Get account statistics
  getStats: () => {
    return api.get('/api/linkedin-accounts/stats');
  },
  
  // Add account with cookies
  addWithCookies: (formData) => {
    return api.post('/api/linkedin-accounts/add-with-cookies', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  // Delete account
  deleteAccount: (accountId) => {
    return api.delete(`/api/linkedin-accounts/${accountId}`);
  },
  
  // Bulk upload
  bulkUpload: (formData) => {
    return api.post('/api/linkedin-accounts/bulk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

// Health API for testing connectivity
export const healthAPI = {
  check: () => api.get('/health'),
};

export default api;






























































