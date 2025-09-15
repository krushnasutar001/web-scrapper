const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// SQLite database configuration
const DB_PATH = path.join(__dirname, '..', 'database', 'linkedin_automation.db');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

/**
 * Initialize SQLite database
 */
const initializeDatabase = async () => {
  return new Promise((resolve, reject) => {
    try {
      console.log('🔄 Initializing SQLite database...');
      
      db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          console.error('❌ SQLite connection failed:', err);
          reject(err);
          return;
        }
        
        console.log('✅ SQLite database connected successfully');
        
        // Create tables
        createTables()
          .then(() => {
            console.log('✅ Database tables created successfully');
            resolve(db);
          })
          .catch(reject);
      });
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      reject(error);
    }
  });
};

/**
 * Create database tables
 */
const createTables = async () => {
  return new Promise((resolve, reject) => {
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      )`,
      
      // LinkedIn accounts table
      `CREATE TABLE IF NOT EXISTS linkedin_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_name TEXT NOT NULL,
        email TEXT NOT NULL,
        username TEXT,
        is_active BOOLEAN DEFAULT 1,
        validation_status TEXT DEFAULT 'ACTIVE',
        daily_request_limit INTEGER DEFAULT 150,
        requests_today INTEGER DEFAULT 0,
        last_request_at DATETIME,
        cooldown_until DATETIME,
        blocked_until DATETIME,
        consecutive_failures INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, email)
      )`,
      
      // Jobs table
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_name TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        max_results INTEGER DEFAULT 100,
        configuration TEXT,
        total_urls INTEGER DEFAULT 0,
        processed_urls INTEGER DEFAULT 0,
        successful_urls INTEGER DEFAULT 0,
        failed_urls INTEGER DEFAULT 0,
        result_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        paused_at DATETIME,
        resumed_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      
      // Job URLs table
      `CREATE TABLE IF NOT EXISTS job_urls (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        processed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      )`,
      
      // Job results table
      `CREATE TABLE IF NOT EXISTS job_results (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        job_url_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        scraped_data TEXT NOT NULL,
        name TEXT,
        title TEXT,
        company TEXT,
        location TEXT,
        email TEXT,
        linkedin_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (job_url_id) REFERENCES job_urls(id) ON DELETE CASCADE
      )`,
      
      // Job account assignments table
      `CREATE TABLE IF NOT EXISTS job_account_assignments (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        linkedin_account_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
        UNIQUE(job_id, linkedin_account_id)
      )`
    ];
    
    let completed = 0;
    const total = tables.length;
    
    tables.forEach((sql, index) => {
      db.run(sql, (err) => {
        if (err) {
          console.error(`❌ Error creating table ${index + 1}:`, err);
          reject(err);
          return;
        }
        
        completed++;
        if (completed === total) {
          // Insert default user for testing
          insertDefaultUser()
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  });
};

/**
 * Insert default user for testing
 */
const insertDefaultUser = async () => {
  return new Promise((resolve, reject) => {
    const sql = `INSERT OR IGNORE INTO users (id, email, password_hash, name) 
                 VALUES ('mock-user-id', 'test@example.com', '$2b$10$dummy.hash.for.testing', 'Test User')`;
    
    db.run(sql, (err) => {
      if (err) {
        console.error('❌ Error inserting default user:', err);
        reject(err);
      } else {
        console.log('✅ Default user created');
        resolve();
      }
    });
  });
};

/**
 * Execute a query
 */
const query = async (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } else {
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ affectedRows: this.changes, insertId: this.lastID });
        }
      });
    }
  });
};

/**
 * Execute a transaction
 */
const transaction = async (callback) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      try {
        const result = callback({
          execute: (sql, params) => query(sql, params)
        });
        
        if (result instanceof Promise) {
          result
            .then((res) => {
              db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve(res);
              });
            })
            .catch((err) => {
              db.run('ROLLBACK');
              reject(err);
            });
        } else {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve(result);
          });
        }
      } catch (error) {
        db.run('ROLLBACK');
        reject(error);
      }
    });
  });
};

/**
 * Health check
 */
const healthCheck = async () => {
  try {
    await query('SELECT 1 as health');
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
  }
};

/**
 * Close database connection
 */
const closeDatabase = async () => {
  return new Promise((resolve) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err);
        } else {
          console.log('✅ Database connection closed');
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
};

module.exports = {
  initializeDatabase,
  query,
  transaction,
  healthCheck,
  closeDatabase
};