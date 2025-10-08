import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

// =============================
// Initial State
// =============================
const initialState = {
  user: null,
  token: null,
  loading: true,
  error: null,
};

// =============================
// Action Types
// =============================
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  UPDATE_USER: 'UPDATE_USER',
};

// =============================
// Reducer
// =============================
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload };
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return { ...state, user: action.payload.user, token: action.payload.token, loading: false, error: null };
    case AUTH_ACTIONS.LOGOUT:
      return { ...state, user: null, token: null, loading: false, error: null };
    case AUTH_ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    case AUTH_ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };
    case AUTH_ACTIONS.UPDATE_USER:
      return { ...state, user: { ...state.user, ...action.payload } };
    default:
      return state;
  }
};

// =============================
// Context Setup
// =============================
const AuthContext = createContext();

// =============================
// Provider Component
// =============================
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // =============================
  // Auto-load user + token on app start
  // =============================
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const userStr = localStorage.getItem('user');

        if (token) {
          // Ensure axios has token
          authAPI.setAuthToken(token);
        }

        if (token && userStr) {
          const user = JSON.parse(userStr);
          dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { user, token } });
        } else if (token) {
          // If only token is present, try to fetch user
          authAPI.setAuthToken(token);
          authAPI.getProfile().then(profile => {
            if (profile) {
              localStorage.setItem('user', JSON.stringify(profile));
              dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { user: profile, token } });
            } else {
              dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
            }
          }).catch(() => {
            dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
          });
        } else {
          dispatch({ type: AUTH_ACTIONS.LOGOUT });
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        }
      } catch (error) {
        console.error('❌ Error loading user:', error);
        localStorage.clear();
        authAPI.clearAuthToken();
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    };
    loadUser();
  }, []);

  // Re-emit login signal on startup when tokens are present to aid extension detection
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const refreshToken = localStorage.getItem('refreshToken') || localStorage.getItem('refresh_token') || null;
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        const apiBase = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : undefined;
        if (token && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scralytics:loginSuccess', {
            detail: { authToken: token, refreshToken, user, apiBaseUrl: apiBase }
          }));
        }
      } catch (_) {}
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // =============================
  // Login Function
  // =============================
  const login = async (email, password) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      console.log('Login function called'); // Add this line

      console.log('🔐 Attempting login for:', email);
      const result = await authAPI.login(email, password);
      const data = result || {};

      if (data.success) {
        const user = data.user || null;
        const token = data.authToken || null;
        const refreshToken = data.refreshToken || null;

        // Store tokens and user info
        localStorage.setItem('authToken', token);
        localStorage.setItem('token', token); // for backward compatibility
        localStorage.setItem('refreshToken', refreshToken || '');
        localStorage.setItem('user', JSON.stringify(user));

        // Sync token to chrome.storage for extension
        try {
          if (typeof window !== 'undefined' && window.chrome?.storage?.local) {
            window.chrome.storage.local.set({ toolToken: token, toolUser: user });
          }
        } catch (_) {}

        // Apply token globally
        authAPI.setAuthToken(token);

        // Update state
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { user, token },
        });

        // Best-effort: notify extension of login with token and API base
        try {
          const extId = process.env.REACT_APP_EXTENSION_ID || localStorage.getItem('EXTENSION_ID');
          const apiBase = window.__API_BASE_URL__
            || localStorage.getItem('API_BASE_URL')
            || (typeof window !== 'undefined' ? window.location.origin : undefined);
          // Dispatch a window event so the content script can react without polling
          try {
            window.dispatchEvent(new CustomEvent('scralytics:loginSuccess', {
              detail: { authToken: token, user, apiBaseUrl: apiBase }
            }));
          } catch (_) {}

          // Also notify extension directly
          if (extId && window?.chrome?.runtime?.sendMessage) {
            const payload = {
              type: 'SCRALYTICS_LOGIN_STATUS',
              source: 'web_app',
              data: {
                isLoggedIn: true,
                authToken: token,
                apiBaseUrl: apiBase,
                userEmail: user?.email,
                userName: user?.name || user?.fullName || user?.username,
                userId: user?.id || user?._id
              }
            };
            window.chrome.runtime.sendMessage(extId, payload, () => {});
            console.log('✅ Token sent to extension');
          }
        } catch (err) {
          console.warn('⚠️ Failed to send token to extension:', err?.message || err);
        }

        toast.success('Login successful!');
        console.log('✅ Token saved and applied');
        return { success: true };
      } else {
        const friendly = data.message || 'Login failed';
        console.error('❌ Login failed:', friendly);
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: friendly });
        toast.error(friendly);
        return { success: false, message: friendly };
      }
    } catch (error) {
      const status = error?.status || error?.response?.status;
      let message = error?.message || 'Login failed';

      if (!status && /Network Error/i.test(message)) {
        message = 'Backend unreachable. Make sure the server is running.';
      } else if (status === 401) {
        message = 'Invalid credentials. Please check your email and password.';
      } else if (status === 429) {
        message = 'Too many attempts. Please wait a moment.';
      } else if (status === 403) {
        message = 'Access denied. You may not have permission.';
      } else if (status === 500) {
        message = 'Server error. Try again later.';
      }

      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: message });
      toast.error(message);
      console.error(`❌ Login error: ${message}`);
      return { success: false, message };
    } finally {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }
  };

  // =============================
  // Register Function
  // =============================
  const register = async (userData) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const response = await authAPI.register(userData);

      if (response.success) {
        const { user, accessToken, refreshToken } = response.data;

        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));

        authAPI.setAuthToken(accessToken);

        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { user, token: accessToken },
        });

        toast.success('Registration successful!');
        return { success: true };
      } else {
        const message = response.message || 'Registration failed';
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: message });
        toast.error(message);
        return { success: false, message };
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: message });
      toast.error(message);
      return { success: false, message };
    } finally {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }
  };

  // =============================
  // Logout Function
  // =============================
  const logout = async () => {
    try {
      await authAPI.logout().catch(() => {});
    } finally {
      // Fire explicit logout event for content script listeners
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scralytics:logout', {
            detail: { explicitLogout: true, ts: Date.now() }
          }));
        }
      } catch (_) {}
      // Notify extension of logout
      try {
        const extId = process.env.REACT_APP_EXTENSION_ID || localStorage.getItem('EXTENSION_ID');
        if (extId && window?.chrome?.runtime?.sendMessage) {
          window.chrome.runtime.sendMessage(
            extId,
            { type: 'SCRALYTICS_LOGIN_STATUS', source: 'web_app', data: { isLoggedIn: false, explicitLogout: true } },
            () => {}
          );
        }
      } catch (_) {}
      // Remove only auth-related keys to avoid wiping unrelated app state
      try {
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      } catch (_) {}
      // Clear extension token sync
      try {
        if (typeof window !== 'undefined' && window.chrome?.storage?.local) {
          window.chrome.storage.local.remove(['toolToken', 'toolUser']);
        }
      } catch (_) {}
      authAPI.clearAuthToken();
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      toast.success('Logged out successfully!');
    }
  };

  // =============================
  // Update User Function
  // =============================
  const updateUser = (userData) => {
    const updatedUser = { ...state.user, ...userData };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    dispatch({ type: AUTH_ACTIONS.UPDATE_USER, payload: userData });
  };

  // =============================
  // Global Value
  // =============================
  const value = {
    ...state,
    login,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// =============================
// Hook to Use Context
// =============================
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// =============================
// Always Apply Token on Load
// =============================
const savedToken = localStorage.getItem('authToken') || localStorage.getItem('token');
if (savedToken) {
  authAPI.setAuthToken(savedToken);
}

export default AuthContext;