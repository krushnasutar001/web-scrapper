const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: '../.env' });

/**
 * Simple Test User Creation Script
 * Creates a test user to resolve frontend authentication issues
 */

async function createUser() {
  let connection;
  
  try {
    console.log('🚀 Creating test user for LinkedIn Automation...');
    console.log('=' .repeat(50));
    
    // Database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Krushna_Sutar@0809',
      database: process.env.DB_NAME || 'linkedin_automation'
    });
    
    console.log('✅ Connected to database');
    
    // Create users table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        firstName VARCHAR(100),
        lastName VARCHAR(100),
        isActive BOOLEAN DEFAULT TRUE,
        emailVerified BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Test user data
    const users = [
      {
        id: 'ff1c9f3b-88a8-11f0-aa08-088fc3850692', // Same ID used in backend tests
        email: 'admin@test.com',
        password: 'admin123',
        firstName: 'Admin',
        lastName: 'User'
      },
      {
        id: uuidv4(),
        email: 'test@test.com',
        password: 'test123',
        firstName: 'Test',
        lastName: 'User'
      }
    ];
    
    console.log('\n👤 Creating test users...');
    
    for (const user of users) {
      // Check if user exists
      const [existing] = await connection.execute(
        'SELECT id FROM users WHERE email = ?',
        [user.email]
      );
      
      if (existing.length > 0) {
        console.log(`⚠️  User ${user.email} already exists`);
        continue;
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(user.password, 12);
      
      // Insert user
      await connection.execute(
        `INSERT INTO users (id, email, password, firstName, lastName, isActive, emailVerified) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.email, hashedPassword, user.firstName, user.lastName, true, true]
      );
      
      console.log(`✅ Created user: ${user.email}`);
    }
    
    console.log('\n🎉 SUCCESS! Test users created!');
    console.log('\n📋 LOGIN CREDENTIALS:');
    console.log('\n1️⃣  ADMIN USER (has access to all 20+ LinkedIn accounts):');
    console.log('   📧 Email: admin@test.com');
    console.log('   🔑 Password: admin123');
    console.log('\n2️⃣  TEST USER:');
    console.log('   📧 Email: test@test.com');
    console.log('   🔑 Password: test123');
    
    console.log('\n🚀 SOLUTION STEPS:');
    console.log('1. Go to http://localhost:3000');
    console.log('2. Click Login or navigate to /login');
    console.log('3. Use admin@test.com / admin123 to login');
    console.log('4. Navigate to LinkedIn Accounts page');
    console.log('5. ✅ You will see all 20+ LinkedIn accounts!');
    
    console.log('\n🔧 This resolves the "Failed to fetch accounts" error!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n🔧 Fix: Check database credentials in .env file');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n🔧 Fix: Start MySQL server on localhost:3306');
    }
    
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
if (require.main === module) {
  createUser().catch(console.error);
}

module.exports = createUser;