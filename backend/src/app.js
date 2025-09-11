const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
require('express-async-errors');
require('dotenv').config({ path: '../.env' });

const { sequelize, syncModels } = require('./models');
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const resultRoutes = require('./routes/results');
const accountRoutes = require('./routes/accounts');
const searchRoutes = require('./routes/search');
const companyRoutes = require('./routes/company');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3000'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: 'connected'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/company', companyRoutes);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LinkedIn Automation SaaS API',
      version: '1.0.0',
      description: 'A comprehensive LinkedIn automation and data scraping platform',
      contact: {
        name: 'API Support',
        email: 'support@linkedin-automation.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server'
      },
      {
        url: process.env.API_BASE_URL || `http://localhost:${PORT}`,
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js']
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'LinkedIn Automation API Documentation'
}));

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'LinkedIn Automation SaaS API',
    version: '1.0.0',
    description: 'LinkedIn automation and data scraping platform',
    documentation: `/docs`,
    endpoints: {
      authentication: '/api/auth',
      jobs: '/api/jobs',
      results: '/api/results',
      accounts: '/api/accounts',
      search: '/api/search',
      company: '/api/company',
      health: '/health'
    }
  });
});

// 404 handler for undefined routes
app.use('*', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Database connection and server startup
const startServer = async () => {
  try {
    console.log('🔄 Starting LinkedIn Automation SaaS Backend...');
    console.log('');
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    
    // Sync database models in development
    if (process.env.NODE_ENV !== 'production') {
      await syncModels({ alter: true });
      console.log('✅ Database models synchronized.');
      
      // Create sample data in development
      if (process.env.CREATE_SAMPLE_DATA === 'true') {
        const { createSampleData } = require('./models');
        try {
          await createSampleData();
          console.log('✅ Sample data created successfully.');
        } catch (error) {
          console.log('⚠️  Sample data creation skipped (may already exist)');
        }
      }
    } else {
      // In production, just sync without altering
      await syncModels();
      console.log('✅ Database models verified.');
    }
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('🚀 LinkedIn Automation SaaS Backend Started Successfully!');
      console.log('');
      console.log('📊 Server Information:');
      console.log(`   Port: ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('');
      console.log('🌐 Access Points:');
      console.log(`   API Base: http://localhost:${PORT}/api`);
      console.log(`   Health Check: http://localhost:${PORT}/health`);
      console.log(`   Documentation: http://localhost:${PORT}/docs`);
      console.log('');
      console.log('🔐 Authentication Endpoints:');
      console.log(`   Login: POST http://localhost:${PORT}/api/auth/login`);
      console.log(`   Register: POST http://localhost:${PORT}/api/auth/register`);
      console.log('');
      console.log('✅ Backend is ready to accept requests!');
    });
    
    // Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
      console.log(`\n${signal} received, shutting down gracefully`);
      
      server.close(async () => {
        console.log('HTTP server closed');
        
        try {
          await sequelize.close();
          console.log('Database connection closed');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
      
      // Force close after 30 seconds
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Unable to start server:', error.message);
    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('1. Make sure MySQL server is running');
    console.error('2. Check database credentials in .env file');
    console.error('3. Verify all dependencies are installed (npm install)');
    console.error('');
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:', err.message);
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;