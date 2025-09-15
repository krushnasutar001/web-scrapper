// Database Connection Module
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'linkedin_automation',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Initialize database connection
async function initializeDatabase() {
  const isConnected = await testConnection();
  if (!isConnected) {
    console.warn('⚠️  Database not available, some features may not work');
  }
  return pool;
}

// Export the pool and utility functions
module.exports = {
  execute: async (query, params) => {
    try {
      return await pool.execute(query, params);
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },
  query: async (query, params) => {
    try {
      return await pool.query(query, params);
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },
  pool,
  testConnection,
  initializeDatabase
};

// Initialize on module load
initializeDatabase().catch(console.error);