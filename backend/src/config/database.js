const { Sequelize } = require('sequelize');
require('dotenv').config();

const logger = require('../utils/logger');

// Database configuration based on environment
const getDatabaseConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'development' && process.env.USE_SQLITE === 'true') {
    // SQLite for development
    return {
      dialect: 'sqlite',
      storage: process.env.SQLITE_PATH || './database/linkedin_automation.sqlite',
      logging: (msg) => logger.debug(msg),
      define: {
        timestamps: true,
        underscored: true,
      },
    };
  } else {
    // MySQL for production and default
    return {
      dialect: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      database: process.env.DB_NAME || 'linkedin_automation',
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      logging: env === 'development' ? (msg) => logger.debug(msg) : false,
      pool: {
        max: parseInt(process.env.DB_POOL_MAX) || 10,
        min: parseInt(process.env.DB_POOL_MIN) || 0,
        acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
        idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
      },
      define: {
        timestamps: true,
        underscored: true,
      },
      dialectOptions: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
      },
    };
  }
};

// Initialize Sequelize instance
const sequelize = new Sequelize(getDatabaseConfig());

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection has been established successfully.');
    return true;
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    return false;
  }
};

// Close database connection
const closeConnection = async () => {
  try {
    await sequelize.close();
    logger.info('Database connection closed.');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
};

module.exports = {
  sequelize,
  testConnection,
  closeConnection,
  Sequelize,
};