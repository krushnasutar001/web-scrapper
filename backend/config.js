const path = require('path');
const fs = require('fs');

/**
 * Configuration module that validates required environment variables at startup
 * and provides centralized configuration management
 */

// Load environment variables
require('dotenv').config();

/**
 * Required environment variables with their validation rules
 */
const REQUIRED_ENV_VARS = {
  // Database Configuration
  DATABASE_URL: {
    required: true,
    description: 'MySQL connection string (e.g., mysql://user:pass@localhost:3306/dbname)'
  },
  
  // Redis Configuration
  REDIS_URL: {
    required: true,
    description: 'Redis connection string (e.g., redis://localhost:6379)'
  },
  
  // JWT Configuration
  JWT_SECRET: {
    required: true,
    description: 'Secret key for JWT token signing'
  },
  
  JOB_SIGN_SECRET: {
    required: true,
    description: 'Secret key for job token signing'
  },
  
  // File System Configuration
  PROFILES_BASE: {
    required: true,
    description: 'Base directory for browser profiles (e.g., /profiles)'
  },
  
  SCRAPER_EXTENSION_PATH: {
    required: true,
    description: 'Path to the scraper extension directory'
  },
  
  // Worker Configuration
  WORKER_CONCURRENCY: {
    required: false,
    default: '2',
    description: 'Number of concurrent jobs per worker'
  },
  
  // Optional S3 Configuration
  S3_BUCKET: {
    required: false,
    description: 'S3 bucket name for storing results (optional)'
  },
  
  // Server Configuration
  PORT: {
    required: false,
    default: '5001',
    description: 'Server port'
  },
  
  NODE_ENV: {
    required: false,
    default: 'development',
    description: 'Node environment (development, production, test)'
  }
};

/**
 * Validates environment variables and returns configuration object
 */
function validateAndLoadConfig() {
  const config = {};
  const errors = [];
  const warnings = [];

  // Validate each required environment variable
  for (const [key, rules] of Object.entries(REQUIRED_ENV_VARS)) {
    const value = process.env[key];
    
    if (rules.required && !value) {
      errors.push(`Missing required environment variable: ${key} - ${rules.description}`);
    } else if (!value && rules.default) {
      config[key] = rules.default;
      warnings.push(`Using default value for ${key}: ${rules.default}`);
    } else if (value) {
      config[key] = value;
    }
  }

  // Additional validation for specific variables
  if (config.PROFILES_BASE && !path.isAbsolute(config.PROFILES_BASE)) {
    config.PROFILES_BASE = path.resolve(process.cwd(), config.PROFILES_BASE);
    warnings.push(`Converting PROFILES_BASE to absolute path: ${config.PROFILES_BASE}`);
  }

  if (config.SCRAPER_EXTENSION_PATH && !path.isAbsolute(config.SCRAPER_EXTENSION_PATH)) {
    config.SCRAPER_EXTENSION_PATH = path.resolve(process.cwd(), config.SCRAPER_EXTENSION_PATH);
    warnings.push(`Converting SCRAPER_EXTENSION_PATH to absolute path: ${config.SCRAPER_EXTENSION_PATH}`);
  }

  // Validate numeric values
  if (config.WORKER_CONCURRENCY) {
    const concurrency = parseInt(config.WORKER_CONCURRENCY, 10);
    if (isNaN(concurrency) || concurrency < 1) {
      errors.push('WORKER_CONCURRENCY must be a positive integer');
    } else {
      config.WORKER_CONCURRENCY = concurrency;
    }
  }

  if (config.PORT) {
    const port = parseInt(config.PORT, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('PORT must be a valid port number (1-65535)');
    } else {
      config.PORT = port;
    }
  }

  // Validate file/directory existence
  if (config.SCRAPER_EXTENSION_PATH && !fs.existsSync(config.SCRAPER_EXTENSION_PATH)) {
    errors.push(`SCRAPER_EXTENSION_PATH does not exist: ${config.SCRAPER_EXTENSION_PATH}`);
  }

  // Create profiles directory if it doesn't exist
  if (config.PROFILES_BASE) {
    try {
      if (!fs.existsSync(config.PROFILES_BASE)) {
        fs.mkdirSync(config.PROFILES_BASE, { recursive: true });
        warnings.push(`Created profiles directory: ${config.PROFILES_BASE}`);
      }
    } catch (error) {
      errors.push(`Failed to create profiles directory ${config.PROFILES_BASE}: ${error.message}`);
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.warn('Configuration warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  // Handle errors
  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  return config;
}

/**
 * Generate example .env content
 */
function generateEnvExample() {
  const lines = ['# Environment Configuration for LinkedIn Automation SaaS', ''];
  
  for (const [key, rules] of Object.entries(REQUIRED_ENV_VARS)) {
    lines.push(`# ${rules.description}`);
    if (rules.required) {
      lines.push(`${key}=`);
    } else {
      lines.push(`${key}=${rules.default || ''}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

// Load and validate configuration
const config = validateAndLoadConfig();

// Add derived configuration
config.IS_PRODUCTION = config.NODE_ENV === 'production';
config.IS_DEVELOPMENT = config.NODE_ENV === 'development';
config.IS_TEST = config.NODE_ENV === 'test';

// Job configuration
config.JOB_TOKEN_EXPIRY = '1h'; // Job tokens expire in 1 hour
config.MAX_JOB_RETRIES = 3;
config.JOB_TIMEOUT_MS = 300000; // 5 minutes

// Browser configuration
config.BROWSER_TIMEOUT_MS = 30000; // 30 seconds
config.BROWSER_HEADLESS = config.IS_PRODUCTION;

console.log(`Configuration loaded successfully for ${config.NODE_ENV} environment`);

module.exports = {
  ...config,
  generateEnvExample,
  validateAndLoadConfig
};