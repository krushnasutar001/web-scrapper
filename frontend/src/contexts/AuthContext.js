import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

// Initial state
const initialState = {
  user: null,
  token: null,
  loading: true,
  error: null,
};

// Action types
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  UPDATE_USER: 'UPDATE_USER',
};

// Reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        loading: false,
        error: null,
      };
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        token: null,
        loading: false,
        error: null,
      };
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };
    default:
      return state;
  }
};

// Create context
const AuthContext = createContext();

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Load user from localStorage on app start - FIXED VERSION
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        // Quiet bootstrap: avoid verbose localStorage logs
        
        if (token && userStr) {
          try {
            const user = JSON.parse(userStr);
            
            // Set token in API headers
            authAPI.setAuthToken(token);
            
            // Instead of calling /api/auth/me, just use stored user data
            // and let the API interceptor handle token validation on actual API calls
            dispatch({
              type: AUTH_ACTIONS.LOGIN_SUCCESS,
              payload: {
                user,
                token,
              },
            });
          } catch (parseError) {
            console.error('❌ Error parsing stored user data:', parseError);
            // Clear invalid data
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            authAPI.clearAuthToken();
            dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
          }
        } else {
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        }
      } catch (error) {
        console.error('❌ Error loading user:', error);
        // Clear storage on any error
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        authAPI.clearAuthToken();
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    };

    loadUser();
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
      
      // Minimal info log
      console.log('🔐 Attempting login for:', email);
      
      const result = await authAPI.login(email, password);
      const data = result || {};
      
      // Reduce verbosity: only log success summary
      if (data.success) {
        console.log('✅ Login success (normalized): user=', data.user?.email || data.user?.name || 'unknown');
      }
      
      if (data.success) {
        const user = data.user || null;
        const token = data.authToken || null;
        const refreshToken = data.refreshToken || null;
        
        console.log('🔐 Storing auth tokens and user profile');
        
        // Store in localStorage
        localStorage.setItem('authToken', token);
        localStorage.setItem('token', token); // keep legacy key for compatibility
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Set token in API headers
        authAPI.setAuthToken(token);
        
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { user, token },
        });
        
        toast.success('Login successful!');
        return { success: true };
      } else {
        // Friendly error for common cases
        const friendly = data.message || 'Login failed';
        console.error('❌ Login failed:', friendly);
        dispatch({
          type: AUTH_ACTIONS.SET_ERROR,
          payload: friendly,
        });
        toast.error(friendly);
        return { success: false, message: data.message };
      }
    } catch (error) {
      // Condensed logging and human-friendly message mapping
      const status = error?.status || error?.response?.status;
      const code = error?.originalError?.code || error?.code;
      const rawMsg = error?.message || error?.response?.data?.message || 'Login failed';
      let message = rawMsg;

      if (!status && /Network Error/i.test(rawMsg)) {
        message = 'Backend unreachable. Ensure server is running on the configured port.';
      } else if (status === 401) {
        message = 'Invalid credentials. Please check your email and password.';
      } else if (status === 429) {
        message = 'Too many attempts. Please wait a moment before retrying.';
      } else if (status === 431) {
        message = 'Request headers too large. Cookies cleared — please retry.';
      } else if (status === 403) {
        message = 'Access denied. Your account may lack required permissions.';
      } else if (status === 500) {
        message = 'Server error. Please try again later.';
      }

      console.error(`❌ Login error [status=${status || 'n/a'}, code=${code || 'n/a'}]:`, message);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: message });
      toast.error(message);
      return { success: false, message };
    }
  };

  // Register function
  const register = async (userData) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
      
      const response = await authAPI.register(userData);
      
      if (response.success) {
        const { user, accessToken, refreshToken } = response.data;
        
        // Store in localStorage
        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Set token in API headers
        authAPI.setAuthToken(accessToken);
        
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { user, token: accessToken },
        });
        
        toast.success('Registration successful!');
        return { success: true };
      } else {
        console.error('❌ Registration failed:', response.message);
        dispatch({
          type: AUTH_ACTIONS.SET_ERROR,
          payload: response.message || 'Registration failed',
        });
        toast.error(response.message || 'Registration failed');
        return { success: false, message: response.message };
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: message });
      toast.error(message);
      return { success: false, message };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      // Call logout API if available
      await authAPI.logout().catch(() => {});
    } catch (error) {
      // Ignore logout API errors
    } finally {
      // Always clear local state
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('refreshToken');
      authAPI.clearAuthToken();
      
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      toast.success('Logged out successfully');
    }
  };

  // Update user function
  const updateUser = (userData) => {
    const updatedUser = { ...state.user, ...userData };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    dispatch({ type: AUTH_ACTIONS.UPDATE_USER, payload: userData });
  };

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

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
