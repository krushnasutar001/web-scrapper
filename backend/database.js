// MySQL Database Connection Module
const mysql = require('mysql2/promise');
const config = require('./config');

// Create MySQL connection pool using DATABASE_URL
// Supports DSN format: mysql://user:pass@host:port/dbname
let pool;

async function testConnection() {
  try {
    // Lazily create pool if not already created
    if (!pool) {
      pool = mysql.createPool(config.DATABASE_URL);
    }
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ MySQL database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ MySQL database connection failed:', error.message);
    return false;
  }
}

async function initializeDatabase() {
  // Ensure pool is created
  if (!pool) {
    pool = mysql.createPool(config.DATABASE_URL);
  }
  const isConnected = await testConnection();
  if (!isConnected) {
    console.warn('⚠️  Database not available, some features may not work');
  }
  return pool;
}

// Execute query and return [rows] to match mysql2.execute signature used across codebase
async function execute(sql, params = []) {
  if (!pool) await initializeDatabase();
  const [rows] = await pool.execute(sql, params);
  return [rows];
}

// Convenience query that returns rows directly
async function query(sql, params = []) {
  if (!pool) await initializeDatabase();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Get a raw connection from the pool
async function getClient() {
  if (!pool) await initializeDatabase();
  return await pool.getConnection();
}

// Transaction helper using a pooled connection
async function withTransaction(callback) {
  const conn = await getClient();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function end() {
  if (pool) {
    try {
      await pool.end();
      console.log('✅ MySQL pool closed');
    } catch (error) {
      console.error('❌ Error closing MySQL pool:', error.message);
    } finally {
      pool = undefined;
    }
  }
}

// Alias to align with working-server.js usage
async function connectDB() {
  return initializeDatabase();
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  await end();
  process.exit(0);
});

module.exports = {
  query,
  getClient,
  withTransaction,
  pool,
  testConnection,
  initializeDatabase,
  execute,
  end,
  connectDB
};

// Initialize on module load
initializeDatabase().catch(console.error);