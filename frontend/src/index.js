import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import reportWebVitals from './reportWebVitals';

// Removed aggressive reload and storage clearing to prevent random page refreshes

// Global console gating and deduplication to reduce noisy logs
(() => {
  const envLevel = process.env.REACT_APP_LOG_LEVEL;
  const storedLevel = typeof window !== 'undefined' ? window.localStorage.getItem('LOG_LEVEL') : null;
  const level = (envLevel || storedLevel || 'error').toLowerCase();
  const levels = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
  const threshold = levels[level] ?? levels.warn;

  const original = {
    log: console.log.bind(console),
    info: (console.info ? console.info.bind(console) : console.log.bind(console)),
    debug: (console.debug ? console.debug.bind(console) : console.log.bind(console)),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const dedupeWindowMs = 2000;
  const lastPrinted = new Map();
  const safeKey = (method, args) => {
    try {
      const first = args && args.length ? args[0] : '';
      if (typeof first === 'string') return method + ':' + first;
      if (first instanceof Error) return method + ':Error:' + (first.message || '');
      if (first && typeof first === 'object') {
        const asString = (() => {
          try { return JSON.stringify(first); } catch (e) { return first?.toString?.() || '[object]'; }
        })();
        return method + ':' + asString;
      }
      return method + ':' + String(first);
    } catch (e) {
      return method + ':unknown';
    }
  };

  const gate = (method, levelValue, originalFn) => (...args) => {
    try {
      if (levelValue < threshold) return;
      const key = safeKey(method, args);
      const now = Date.now();
      const last = lastPrinted.get(key) || 0;
      if (now - last < dedupeWindowMs) return;
      lastPrinted.set(key, now);
      originalFn(...args);
    } catch (err) {
      try {
        originalFn('[log-gate] Logging failed:', err?.message || err);
        const safeArgs = args.map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}`;
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch (e) { return '[object]'; }
          }
          return a;
        });
        originalFn('[log-gate] Original args:', ...safeArgs);
      } catch (e) {
        originalFn('[log-gate] Logging failed; original args not printable');
      }
    }
  };

  console.log = gate('log', levels.info, original.log);
  console.info = gate('info', levels.info, original.info);
  console.debug = gate('debug', levels.debug, original.debug);
  console.warn = gate('warn', levels.warn, original.warn);
  console.error = gate('error', levels.error, original.error);

  if (typeof window !== 'undefined') {
    window.__setLogLevel = (lvl) => {
      try {
        const lower = String(lvl || '').toLowerCase();
        window.localStorage.setItem('LOG_LEVEL', lower);
        window.location.reload();
      } catch (e) {
        original.warn('Failed to set log level:', e);
      }
    };
  }
})();

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#22c55e',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();