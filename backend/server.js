// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import utilities and services
// Database connection - using SQLite fallback
const { initializeDatabase, closeDatabase, healthCheck } = require('./utils/database');
const jobWorker = require('./services/jobWorker');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { validateRateLimit } = require('./middleware/validation');
const { authenticateToken } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const jobRoutes = require('./routes/jobs');
const dashboardRoutes = require('./routes/dashboard');
const extensionRoutes = require('./routes/extension');
const loginAliasRoutes = require('./src/routes/loginAlias');

// Create Express app
const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isDev = (process.env.NODE_ENV !== 'production');
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:8081',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:8081'
    ];
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    const isExtension = /^chrome-extension:\/\//i.test(origin);
    if (allowedOrigins.includes(origin) || isLocalhost || isExtension || isDev) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: dbHealth,
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('🔐 Auth Header:', req.headers.authorization ? req.headers.authorization.substring(0, 50) + '...' : 'None');
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
// Alias route to support POST /api/login returning { success, authToken, user }
app.use('/api', loginAliasRoutes);
app.use('/api/linkedin-accounts', accountRoutes);
app.use('/api/accounts', accountRoutes); // Route alias for frontend compatibility
app.use('/api/jobs', jobRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/extension', extensionRoutes); // Chrome extension API routes

// Stats endpoint for LinkedInAccountManager compatibility
app.get('/api/stats', async (req, res) => {
  try {
    // Return basic stats for account management
    res.json({
      success: true,
      stats: {
        totalAccounts: 0,
        activeAccounts: 0,
        validatedAccounts: 0,
        pendingValidation: 0
      }
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

// Enhanced error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Legacy route compatibility (for existing frontend)
app.get('/api/linkedin-accounts/available', (req, res, next) => {
  req.url = '/available';
  accountRoutes(req, res, next);
});

// Serve static files from public directory (includes favicon)
app.use(express.static(path.join(__dirname, 'public')));

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsDir));

// Handle favicon.ico requests explicitly to avoid 500 errors
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, 'public', 'favicon.svg');
  if (fs.existsSync(faviconPath)) {
    res.sendFile(faviconPath);
  } else {
    // Return 204 No Content if favicon doesn't exist
    res.status(204).end();
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server Error:', error);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(error.status || 500).json({
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: error.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close database connections
    const { closeDatabase } = require('./utils/database');
    await closeDatabase();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Initialize and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting LinkedIn Automation SaaS Server...');
    console.log('📊 Environment:', process.env.NODE_ENV || 'development');
    
    // Initialize database
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    // Initialize job worker
    console.log('🔄 Initializing job worker...');
    jobWorker.initializeJobWorker();
    console.log('✅ Job worker initialized successfully');
    
    // Start periodic tasks
    console.log('🔄 Starting periodic tasks...');
    
    // Restart failed jobs every 30 minutes
    setInterval(() => {
      jobWorker.restartFailedJobs();
    }, 30 * 60 * 1000);
    
    // Reset daily request counts at midnight
    const LinkedInAccount = require('./models/LinkedInAccount');
    const resetDailyCountsAtMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      setTimeout(() => {
        LinkedInAccount.resetDailyRequestCounts();
        // Set up daily reset
        setInterval(() => {
          LinkedInAccount.resetDailyRequestCounts();
        }, 24 * 60 * 60 * 1000);
      }, msUntilMidnight);
    };
    
    resetDailyCountsAtMidnight();
    console.log('✅ Periodic tasks started');
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log('\n🎉 Server started successfully!');
      console.log(`📍 Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
      console.log('\n📋 Available Endpoints:');
      console.log('   🔐 Authentication: /api/auth/*');
      console.log('   👤 LinkedIn Accounts: /api/linkedin-accounts/*');
      console.log('   💼 Jobs: /api/jobs/*');
      console.log('   📊 Dashboard: /api/dashboard/*');
      console.log('\n✅ Ready to accept requests!');
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });
    
    return server;
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;

// Cookie validation endpoint for extension compatibility
app.post('/api/cookies/validate', authenticateToken, (req, res) => {
  try {
    const { cookies } = req.body;
    const userId = req.user?.id;

    console.log(`🔍 Validating cookies for user ${userId || 'unknown'}`);

    if (!cookies) {
      return res.status(400).json({
        success: false,
        message: 'Cookies are required'
      });
    }

    // Normalize cookies into string
    let cookieString = '';
    if (Array.isArray(cookies)) {
      cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    } else if (typeof cookies === 'object') {
      try {
        cookieString = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
      } catch (_) {
        cookieString = String(cookies);
      }
    } else if (typeof cookies === 'string') {
      cookieString = cookies;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid cookies format' });
    }

    const hasLiAt = cookieString.includes('li_at=');
    const hasJsessionId = cookieString.includes('JSESSIONID=');
    const valid = hasLiAt || hasJsessionId;

    return res.json({
      success: true,
      data: {
        valid,
        expired: false,
        message: valid ? 'Cookies are valid' : 'Missing essential LinkedIn cookies (li_at or JSESSIONID)'
      }
    });
  } catch (error) {
    console.error('❌ Cookie validation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to validate cookies' });
  }
});