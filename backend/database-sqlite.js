// SQLite Database Connection Module
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database file path
const DB_PATH = path.join(__dirname, 'database.db');

// Create SQLite connection
let db = null;

// Initialize SQLite database
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ SQLite database connection failed:', err.message);
        reject(err);
      } else {
        console.log('✅ SQLite database connected successfully');
        
        // Create tables if they don't exist
        createTables()
          .then(() => resolve(db))
          .catch(reject);
      }
    });
  });
}

// Create necessary tables
function createTables() {
  return new Promise((resolve, reject) => {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createLinkedInAccountsTable = `
      CREATE TABLE IF NOT EXISTS linkedin_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_name TEXT NOT NULL,
        cookies TEXT,
        validation_status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    const createJobsTable = `
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_name TEXT NOT NULL,
        job_type TEXT NOT NULL,
        urls TEXT,
        status TEXT DEFAULT 'pending',
        result_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    const createProfileResultsTable = `
      CREATE TABLE IF NOT EXISTS profile_results (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        profile_url TEXT,
        profile_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs (id)
      )
    `;

    db.serialize(() => {
      db.run(createUsersTable);
      db.run(createLinkedInAccountsTable);
      db.run(createJobsTable);
      db.run(createProfileResultsTable, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ SQLite tables created successfully');
          resolve();
        }
      });
    });
  });
}

// Database query wrapper
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({ rows, rowCount: rows.length });
        }
      });
    } else {
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ 
            rows: [], 
            rowCount: this.changes,
            insertId: this.lastID 
          });
        }
      });
    }
  });
}

// Test database connection
async function testConnection() {
  try {
    await query('SELECT 1');
    console.log('✅ SQLite database test successful');
    return true;
  } catch (error) {
    console.error('❌ SQLite database test failed:', error.message);
    return false;
  }
}

// Health check function
async function healthCheck() {
  try {
    await query('SELECT 1');
    return { status: 'healthy', type: 'sqlite' };
  } catch (error) {
    return { status: 'unhealthy', type: 'sqlite', error: error.message };
  }
}

// Close database connection
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

module.exports = {
  initializeDatabase,
  query,
  testConnection,
  healthCheck,
  closeDatabase
};