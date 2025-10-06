import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

const Login = () => {
  const { login, loading, error } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    await login(formData.email, formData.password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {/* Scralytics Hub Logo */}
          <div className="flex justify-center mb-6">
            <img 
              src={process.env.PUBLIC_URL + '/scralytics-hub-logo.svg'} 
              alt="Scralytics Hub - Automate. Enrich. Analyze." 
              className="h-16 w-auto"
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Sign in to Scralytics Hub
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Or{' '}
            <Link
              to="/register"
              className="font-medium text-sky-400 hover:text-sky-300 transition-colors duration-200"
            >
              create a new account
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="form-group">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`w-full px-3 py-2 bg-slate-800 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all duration-200 ${
                  formErrors.email ? 'border-rose-500' : 'border-slate-600 hover:border-slate-500'
                }`}
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
              />
              {formErrors.email && (
                <p className="text-sm text-rose-400 mt-1">{formErrors.email}</p>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className={`w-full px-3 py-2 pr-10 bg-slate-800 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all duration-200 ${
                    formErrors.password ? 'border-rose-500' : 'border-slate-600 hover:border-slate-500'
                  }`}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-300 transition-colors duration-200"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
              {formErrors.password && (
                <p className="text-sm text-rose-400 mt-1">{formErrors.password}</p>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-rose-900/50 border border-rose-500/50 p-4">
              <p className="text-sm text-rose-300">{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  Signing in...
                </div>
              ) : (
                'Sign in to Scralytics Hub'
              )}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/forgot-password"
              className="text-sm text-sky-400 hover:text-sky-300 transition-colors duration-200"
            >
              Forgot your password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;