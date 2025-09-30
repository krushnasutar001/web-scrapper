// PostgreSQL Database Connection Module
const { Pool } = require('pg');
const config = require('./config');

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: config.IS_PRODUCTION ? { rejectUnauthorized: false } : false
});

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL database connected successfully');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL database connection failed:', error.message);
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

// Database query wrapper with error handling and logging
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (config.IS_DEVELOPMENT) {
      console.log('Executed query', { 
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''), 
        duration, 
        rows: res.rowCount 
      });
    }
    
    return res;
  } catch (error) {
    console.error('Database query error:', {
      query: text,
      params,
      error: error.message
    });
    throw error;
  }
}

// Get a client from the pool for transactions
async function getClient() {
  try {
    return await pool.connect();
  } catch (error) {
    console.error('Failed to get database client:', error);
    throw error;
  }
}

// Transaction wrapper
async function withTransaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  await pool.end();
  process.exit(0);
});

// Export the pool and utility functions
module.exports = {
  query,
  getClient,
  withTransaction,
  pool,
  testConnection,
  initializeDatabase
};

// Initialize on module load
initializeDatabase().catch(console.error);