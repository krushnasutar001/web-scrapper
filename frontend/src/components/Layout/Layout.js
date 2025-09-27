import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  HomeIcon,
  BriefcaseIcon,
  DocumentTextIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { useState } from 'react';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Unified Dashboard', href: '/unified-dashboard', icon: DocumentTextIcon },
    { name: 'Jobs', href: '/jobs', icon: BriefcaseIcon },
    { name: 'LinkedIn Accounts', href: '/linkedin-accounts', icon: UsersIcon },
    { name: 'Profile', href: '/profile', icon: UserIcon },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black bg-opacity-75" onClick={() => setSidebarOpen(false)}></div>
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-slate-800 shadow-xl">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center">
              <img src="/scralytics-hub-logo.svg" alt="Scralytics Hub" className="h-8 w-auto" />
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-slate-400 hover:text-slate-300 transition-colors duration-200"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    isActive 
                      ? 'bg-sky-600 text-white shadow-lg' 
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-slate-800 border-r border-slate-700 shadow-sm">
          <div className="flex h-16 items-center px-4">
            <img src="/scralytics-hub-logo.svg" alt="Scralytics Hub - Automate. Enrich. Analyze." className="h-10 w-auto" />
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    isActive 
                      ? 'bg-sky-600 text-white shadow-lg transform scale-105' 
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white hover:scale-105'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-slate-700 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-sky-600 flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {user?.firstName?.[0] || user?.email?.[0] || 'U'}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-white">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email}
                </p>
                <button
                  onClick={handleLogout}
                  className="flex items-center text-xs text-slate-400 hover:text-slate-300 transition-colors duration-200"
                >
                  <ArrowRightOnRectangleIcon className="mr-1 h-3 w-3" />
                  Sign out
                </button>
              </div>
            </div>
            {/* Powered by Scralytics Hub footer */}
            <div className="mt-auto p-4 border-t border-slate-700">
              <p className="text-xs text-slate-400 text-center">
                Powered by <span className="text-sky-400 font-medium">Scralytics Hub</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 bg-slate-800 shadow-sm lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="border-r border-slate-700 px-4 text-slate-400 hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 lg:hidden transition-colors duration-200"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <div className="flex flex-1 items-center justify-between px-4">
            <img src="/scralytics-hub-logo.svg" alt="Scralytics Hub" className="h-8 w-auto" />
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-slate-300 transition-colors duration-200"
            >
              <ArrowRightOnRectangleIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-white">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;