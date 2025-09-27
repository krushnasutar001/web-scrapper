#!/usr/bin/env node

/**
 * Schema Fix Script for Scralytics Hub
 * This script fixes missing columns in the database schema
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

class SchemaFixer {
  constructor() {
    this.dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    };
  }
  
  async fixSchema() {
    console.log('🔧 Fixing Scralytics Hub Database Schema');
    console.log('=' .repeat(50));
    
    try {
      const connection = await mysql.createConnection(this.dbConfig);
      
      // Check and add missing columns to users table
      await this.fixUsersTable(connection);
      
      // Check and add missing columns to other tables if needed
      await this.fixOtherTables(connection);
      
      await connection.end();
      
      console.log('\n✅ Schema fixes completed successfully!');
      console.log('🎉 Ready for comprehensive testing');
      
    } catch (error) {
      console.error('❌ Schema fix failed:', error);
      process.exit(1);
    }
  }
  
  async fixUsersTable(connection) {
    console.log('\n📋 Fixing users table...');
    
    try {
      // Check if 'name' column exists
      const [nameColumns] = await connection.execute(
        "SHOW COLUMNS FROM users LIKE 'name'"
      );
      
      if (nameColumns.length === 0) {
        console.log('  Adding name column...');
        await connection.execute(
          "ALTER TABLE users ADD COLUMN name VARCHAR(255) AFTER email"
        );
        console.log('  ✅ Added name column');
      } else {
        console.log('  ✅ Name column already exists');
      }
      
      // Check if 'credits' column exists
      const [creditColumns] = await connection.execute(
        "SHOW COLUMNS FROM users LIKE 'credits'"
      );
      
      if (creditColumns.length === 0) {
        console.log('  Adding credits column...');
        await connection.execute(
          "ALTER TABLE users ADD COLUMN credits INT DEFAULT 0 AFTER name"
        );
        console.log('  ✅ Added credits column');
      } else {
        console.log('  ✅ Credits column already exists');
      }
      
    } catch (error) {
      console.error('❌ Error fixing users table:', error);
      throw error;
    }
  }
  
  async fixOtherTables(connection) {
    console.log('\n📋 Checking other tables...');
    
    try {
      // Check linkedin_accounts table for required columns
      const [accountColumns] = await connection.execute(
        "SHOW COLUMNS FROM linkedin_accounts"
      );
      
      const accountColumnNames = accountColumns.map(col => col.Field);
      
      // Add missing columns if needed
      const requiredAccountColumns = [
        { name: 'name', type: 'VARCHAR(255)', after: 'email' },
        { name: 'status', type: "ENUM('active','inactive','suspended','expired') DEFAULT 'active'", after: 'password' },
        { name: 'last_used_at', type: 'DATETIME', after: 'status' },
        { name: 'cookies_updated_at', type: 'DATETIME', after: 'last_used_at' },
        { name: 'chrome_profile_path', type: 'VARCHAR(500)', after: 'cookies_updated_at' },
        { name: 'extension_jwt', type: 'TEXT', after: 'chrome_profile_path' }
      ];
      
      for (const col of requiredAccountColumns) {
        if (!accountColumnNames.includes(col.name)) {
          console.log(`  Adding ${col.name} column to linkedin_accounts...`);
          await connection.execute(
            `ALTER TABLE linkedin_accounts ADD COLUMN ${col.name} ${col.type} AFTER ${col.after}`
          );
          console.log(`  ✅ Added ${col.name} column`);
        } else {
          console.log(`  ✅ ${col.name} column already exists in linkedin_accounts`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error fixing other tables:', error);
      // Don't throw here, continue with what we have
    }
  }
  
  async validateSchema() {
    console.log('\n📋 Validating schema fixes...');
    
    const connection = await mysql.createConnection(this.dbConfig);
    
    try {
      // Check users table structure
      const [userColumns] = await connection.execute("DESCRIBE users");
      console.log('\n👥 Users table columns:');
      for (const col of userColumns) {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? '(NOT NULL)' : '(NULL)'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
      }
      
      // Check linkedin_accounts table structure
      const [accountColumns] = await connection.execute("DESCRIBE linkedin_accounts");
      console.log('\n🔗 LinkedIn accounts table columns:');
      for (const col of accountColumns) {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? '(NOT NULL)' : '(NULL)'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
      }
      
    } finally {
      await connection.end();
    }
  }
}

// Run fix if this file is executed directly
if (require.main === module) {
  const fixer = new SchemaFixer();
  fixer.fixSchema()
    .then(() => fixer.validateSchema())
    .catch(console.error);
}

module.exports = SchemaFixer;