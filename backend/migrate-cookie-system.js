/**
 * Database Migration for Advanced Cookie System
 * Updates linkedin_accounts table to support full cookie jar validation
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

class CookieSystemMigration {
  constructor() {
    this.db = null;
  }

  async initDatabase() {
    try {
      this.db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'Krushna_Sutar@0809',
        database: process.env.DB_NAME || 'linkedin_automation'
      });
      
      console.log('✅ Database connected successfully');
      return this.db;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  async checkTableStructure() {
    console.log('\n🔍 === CHECKING TABLE STRUCTURE ===');
    
    try {
      // Get current table structure
      const [columns] = await this.db.execute(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'linkedin_accounts'
        ORDER BY ORDINAL_POSITION
      `, [process.env.DB_NAME || 'linkedin_automation']);
      
      console.log('📊 Current linkedin_accounts table structure:');
      columns.forEach((col, index) => {
        console.log(`   ${index + 1}. ${col.COLUMN_NAME} (${col.DATA_TYPE}) - ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
      
      return columns;
      
    } catch (error) {
      console.error('❌ Failed to check table structure:', error.message);
      throw error;
    }
  }

  async addMissingColumns() {
    console.log('\n🔧 === ADDING MISSING COLUMNS ===');
    
    const requiredColumns = [
      {
        name: 'cookie_file_path',
        definition: 'VARCHAR(500) NULL COMMENT "Path to cookie JSON file"',
        description: 'Path to cookie JSON file'
      },
      {
        name: 'browser_user_agent',
        definition: 'TEXT NULL COMMENT "Browser user agent string"',
        description: 'Browser user agent string'
      },
      {
        name: 'browser_viewport_width',
        definition: 'INT DEFAULT 1920 COMMENT "Browser viewport width"',
        description: 'Browser viewport width'
      },
      {
        name: 'browser_viewport_height',
        definition: 'INT DEFAULT 1080 COMMENT "Browser viewport height"',
        description: 'Browser viewport height'
      },
      {
        name: 'browser_locale',
        definition: 'VARCHAR(10) DEFAULT "en-US" COMMENT "Browser locale"',
        description: 'Browser locale'
      },
      {
        name: 'browser_timezone',
        definition: 'VARCHAR(50) DEFAULT "America/New_York" COMMENT "Browser timezone"',
        description: 'Browser timezone'
      },
      {
        name: 'validation_method',
        definition: 'ENUM("HTTP", "Browser", "CookieJar") DEFAULT "CookieJar" COMMENT "Validation method used"',
        description: 'Validation method used'
      },
      {
        name: 'auth_elements_found',
        definition: 'INT DEFAULT 0 COMMENT "Number of auth elements found during validation"',
        description: 'Number of auth elements found during validation'
      },
      {
        name: 'login_elements_found',
        definition: 'INT DEFAULT 0 COMMENT "Number of login elements found during validation"',
        description: 'Number of login elements found during validation'
      },
      {
        name: 'final_validation_url',
        definition: 'TEXT NULL COMMENT "Final URL after validation"',
        description: 'Final URL after validation'
      },
      {
        name: 'validation_response_code',
        definition: 'INT NULL COMMENT "HTTP response code during validation"',
        description: 'HTTP response code during validation'
      },
      {
        name: 'parallel_validation_batch',
        definition: 'VARCHAR(50) NULL COMMENT "Batch ID for parallel validation"',
        description: 'Batch ID for parallel validation'
      }
    ];
    
    // Check which columns exist
    const [existingColumns] = await this.db.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'linkedin_accounts'
    `, [process.env.DB_NAME || 'linkedin_automation']);
    
    const existingColumnNames = existingColumns.map(col => col.COLUMN_NAME);
    
    // Add missing columns
    let addedColumns = 0;
    
    for (const column of requiredColumns) {
      if (!existingColumnNames.includes(column.name)) {
        try {
          await this.db.execute(`
            ALTER TABLE linkedin_accounts 
            ADD COLUMN ${column.name} ${column.definition}
          `);
          
          console.log(`✅ Added column: ${column.name} - ${column.description}`);
          addedColumns++;
          
        } catch (error) {
          console.error(`❌ Failed to add column ${column.name}: ${error.message}`);
        }
      } else {
        console.log(`ℹ️  Column already exists: ${column.name}`);
      }
    }
    
    console.log(`\n📊 Added ${addedColumns} new columns`);
    return addedColumns;
  }

  async updateValidationStatusEnum() {
    console.log('\n🔄 === UPDATING VALIDATION STATUS ENUM ===');
    
    try {
      // Check current enum values
      const [enumInfo] = await this.db.execute(`
        SELECT COLUMN_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'linkedin_accounts' AND COLUMN_NAME = 'validation_status'
      `, [process.env.DB_NAME || 'linkedin_automation']);
      
      if (enumInfo.length > 0) {
        console.log(`Current validation_status enum: ${enumInfo[0].COLUMN_TYPE}`);
        
        // Update enum to include new values
        await this.db.execute(`
          ALTER TABLE linkedin_accounts 
          MODIFY COLUMN validation_status ENUM(
            'ACTIVE', 'INVALID', 'ERROR', 'PENDING', 
            'expired', 'blocked', 'pending', 'valid', 'invalid'
          ) DEFAULT 'PENDING'
        `);
        
        console.log('✅ Updated validation_status enum with new values');
      }
      
    } catch (error) {
      console.error('❌ Failed to update validation_status enum:', error.message);
    }
  }

  async createCookieFilesTable() {
    console.log('\n📁 === CREATING COOKIE FILES TABLE ===');
    
    try {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS linkedin_cookie_files (
          id CHAR(36) PRIMARY KEY,
          account_id CHAR(36) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          cookie_count INT DEFAULT 0,
          file_size INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE,
          
          FOREIGN KEY (account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
          INDEX idx_account_id (account_id),
          INDEX idx_file_name (file_name),
          INDEX idx_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log('✅ Created linkedin_cookie_files table');
      
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  linkedin_cookie_files table already exists');
      } else {
        console.error('❌ Failed to create linkedin_cookie_files table:', error.message);
      }
    }
  }

  async createValidationLogsTable() {
    console.log('\n📋 === CREATING VALIDATION LOGS TABLE ===');
    
    try {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS linkedin_validation_logs (
          id CHAR(36) PRIMARY KEY,
          account_id CHAR(36) NOT NULL,
          validation_method ENUM('HTTP', 'Browser', 'CookieJar') NOT NULL,
          status ENUM('ACTIVE', 'INVALID', 'ERROR') NOT NULL,
          reason TEXT,
          final_url TEXT,
          response_code INT,
          auth_elements_found INT DEFAULT 0,
          login_elements_found INT DEFAULT 0,
          elapsed_time INT DEFAULT 0,
          batch_id VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
          INDEX idx_account_id (account_id),
          INDEX idx_status (status),
          INDEX idx_validation_method (validation_method),
          INDEX idx_batch_id (batch_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log('✅ Created linkedin_validation_logs table');
      
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  linkedin_validation_logs table already exists');
      } else {
        console.error('❌ Failed to create linkedin_validation_logs table:', error.message);
      }
    }
  }

  async testDatabaseConnections() {
    console.log('\n🔗 === TESTING DATABASE CONNECTIONS ===');
    
    try {
      // Test basic connection
      const [result] = await this.db.execute('SELECT 1 as test');
      console.log('✅ Basic database connection working');
      
      // Test linkedin_accounts table
      const [accounts] = await this.db.execute(`
        SELECT COUNT(*) as count FROM linkedin_accounts
      `);
      console.log(`✅ linkedin_accounts table accessible (${accounts[0].count} records)`);
      
      // Test new tables
      const [cookieFiles] = await this.db.execute(`
        SELECT COUNT(*) as count FROM linkedin_cookie_files
      `);
      console.log(`✅ linkedin_cookie_files table accessible (${cookieFiles[0].count} records)`);
      
      const [validationLogs] = await this.db.execute(`
        SELECT COUNT(*) as count FROM linkedin_validation_logs
      `);
      console.log(`✅ linkedin_validation_logs table accessible (${validationLogs[0].count} records)`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      return false;
    }
  }

  async runMigration() {
    console.log('🚀 === LINKEDIN COOKIE SYSTEM MIGRATION ===');
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    try {
      // Initialize database
      await this.initDatabase();
      
      // Check current structure
      await this.checkTableStructure();
      
      // Add missing columns
      await this.addMissingColumns();
      
      // Update enums
      await this.updateValidationStatusEnum();
      
      // Create new tables
      await this.createCookieFilesTable();
      await this.createValidationLogsTable();
      
      // Test connections
      const testResult = await this.testDatabaseConnections();
      
      if (testResult) {
        console.log('\n🎉 === MIGRATION COMPLETED SUCCESSFULLY ===');
        console.log('✅ Database is ready for the advanced cookie system');
        console.log('✅ All tables and columns are properly configured');
        console.log('✅ Foreign key relationships are established');
        console.log('✅ Indexes are created for optimal performance');
        
        console.log('\n💡 === NEXT STEPS ===');
        console.log('1. 📁 Create cookie JSON files in the cookies/ directory');
        console.log('2. 🔧 Update account records with cookie file paths');
        console.log('3. 🧪 Run test-cookie-manager.js to validate the system');
        console.log('4. 🚀 Deploy the updated validation system');
      } else {
        console.log('\n⚠️  === MIGRATION COMPLETED WITH ISSUES ===');
        console.log('❌ Some database tests failed');
        console.log('🔧 Please check the error messages above and fix any issues');
      }
      
    } catch (error) {
      console.error('\n❌ === MIGRATION FAILED ===');
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      
    } finally {
      if (this.db) {
        await this.db.end();
        console.log('\n🔌 Database connection closed');
      }
      
      console.log(`End Time: ${new Date().toISOString()}`);
    }
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  const migration = new CookieSystemMigration();
  migration.runMigration().catch(error => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
}

module.exports = CookieSystemMigration;