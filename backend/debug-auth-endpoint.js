/**
 * Debug Auth Endpoint Error
 * Tests the /api/auth/me endpoint and LinkedIn cookie validation
 */

const OptimizedLinkedInValidator = require('./optimized-validator');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// User's LinkedIn cookie
const LINKEDIN_COOKIE = 'AQEDAVIYJnMCe5EDAAABmR6x5g4AAAGZQr5qDk0AQ5RVrd-SfiZANkk64STLQyYEpDQh5zAk7otXPjPyz_Hh7k2bGuLomC9XHkGtWw_cvROb_OVZ08Gzx09a9YmUjDXt1ZbTAQJubGcaFKI2kfPEJFHZ';

class AuthEndpointDebugger {
  constructor() {
    this.validator = new OptimizedLinkedInValidator();
    this.validator.setHttpFirst(true);
    this.validator.setTimeouts(5000, 15000);
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
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  encrypt(text) {
    return Buffer.from(text).toString('base64');
  }

  async testAuthEndpoint() {
    console.log('🔍 === AUTH ENDPOINT DEBUG SESSION ===');
    console.log(`Cookie: ${LINKEDIN_COOKIE.substring(0, 20)}...${LINKEDIN_COOKIE.substring(LINKEDIN_COOKIE.length - 10)}`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    try {
      await this.initDatabase();
      
      // Step 1: Test LinkedIn cookie validation
      console.log('\n🚀 Step 1: LinkedIn Cookie Validation');
      const validationStart = Date.now();
      
      const validationResult = await this.validator.validateCookie(
        LINKEDIN_COOKIE,
        null,
        'AuthDebug-Cookie'
      );
      
      const validationTime = Date.now() - validationStart;
      
      console.log('📊 Cookie Validation Results:');
      console.log(`   Status: ${validationResult.status}`);
      console.log(`   Method: ${validationResult.method}`);
      console.log(`   Valid: ${validationResult.isValid}`);
      console.log(`   Time: ${validationTime}ms`);
      console.log(`   Message: ${validationResult.message}`);
      
      if (!validationResult.isValid) {
        console.log('❌ Cookie validation failed - this may cause auth endpoint errors');
        return;
      }
      
      // Step 2: Test database user authentication
      console.log('\n👤 Step 2: Database User Authentication');
      
      // Check if user exists
      const [users] = await this.db.execute(`
        SELECT id, email, username, created_at 
        FROM users 
        LIMIT 5
      `);
      
      console.log(`📊 Found ${users.length} users in database:`);
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email} (ID: ${user.id.substring(0, 8)}...)`);
      });
      
      if (users.length === 0) {
        console.log('❌ No users found in database - this will cause auth endpoint errors');
        return;
      }
      
      const testUser = users[0];
      console.log(`✅ Using test user: ${testUser.email}`);
      
      // Step 3: Test LinkedIn account creation with validated cookie
      console.log('\n💾 Step 3: LinkedIn Account Creation');
      
      const accountId = uuidv4();
      const accountName = `AuthDebug_${Date.now()}`;
      const encryptedCookie = this.encrypt(LINKEDIN_COOKIE);
      
      console.log(`Creating account: ${accountName}`);
      
      const [result] = await this.db.execute(`
        INSERT INTO linkedin_accounts (
          id, user_id, account_name, email, session_cookie,
          validation_status, is_active, created_at, last_validated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        accountId,
        testUser.id,
        accountName,
        'debug@example.com',
        encryptedCookie,
        validationResult.status,
        1
      ]);
      
      console.log(`✅ Account created successfully:`);
      console.log(`   Account ID: ${accountId}`);
      console.log(`   User ID: ${testUser.id}`);
      console.log(`   Status: ${validationResult.status}`);
      
      // Step 4: Test auth endpoint simulation
      console.log('\n🌐 Step 4: Auth Endpoint Simulation');
      
      // Simulate what /api/auth/me endpoint does
      console.log('Simulating /api/auth/me endpoint logic...');
      
      // Check user authentication
      const [authUser] = await this.db.execute(`
        SELECT id, email, username, role, created_at
        FROM users
        WHERE id = ?
      `, [testUser.id]);
      
      if (authUser.length === 0) {
        console.log('❌ User not found - would return 401 Unauthorized');
        return;
      }
      
      console.log('✅ User authenticated successfully:');
      console.log(`   ID: ${authUser[0].id}`);
      console.log(`   Email: ${authUser[0].email}`);
      console.log(`   Role: ${authUser[0].role || 'user'}`);
      
      // Check user's LinkedIn accounts
      const [linkedinAccounts] = await this.db.execute(`
        SELECT id, account_name, validation_status, is_active
        FROM linkedin_accounts
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `, [testUser.id]);
      
      console.log(`✅ Found ${linkedinAccounts.length} LinkedIn accounts for user:`);
      linkedinAccounts.forEach((acc, index) => {
        const statusIcon = acc.validation_status === 'ACTIVE' ? '✅' : 
                          acc.validation_status === 'INVALID' ? '❌' : '⏳';
        console.log(`   ${index + 1}. ${statusIcon} ${acc.account_name} - ${acc.validation_status}`);
      });
      
      // Step 5: Test HTTP request to auth endpoint
      console.log('\n🔗 Step 5: HTTP Request to Auth Endpoint');
      
      try {
const response = await fetch('http://localhost:5001/api/auth/me', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test-token', // You'd need a real JWT token
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`📊 Auth endpoint response:`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Status Text: ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
        } else {
          const errorText = await response.text();
          console.log(`   Error: ${errorText}`);
        }
        
      } catch (fetchError) {
        console.log(`❌ Auth endpoint request failed: ${fetchError.message}`);
        console.log('   This could be the source of the net::ERR_ABORTED error');
      }
      
      // Step 6: Recommendations
      console.log('\n💡 === DEBUGGING RECOMMENDATIONS ===');
      
      if (validationResult.isValid) {
        console.log('✅ LinkedIn cookie is valid and working');
      } else {
        console.log('❌ LinkedIn cookie validation failed:');
        console.log('   - Check if cookie is expired');
        console.log('   - Verify cookie format and value');
        console.log('   - Test cookie manually in browser');
      }
      
      if (users.length > 0) {
        console.log('✅ Database users exist');
      } else {
        console.log('❌ No users in database:');
        console.log('   - Create a test user');
        console.log('   - Check database connection');
        console.log('   - Verify user table schema');
      }
      
      if (linkedinAccounts.length > 0) {
        const activeAccounts = linkedinAccounts.filter(acc => acc.validation_status === 'ACTIVE');
        console.log(`✅ ${activeAccounts.length}/${linkedinAccounts.length} LinkedIn accounts are ACTIVE`);
      } else {
        console.log('⚠️  No LinkedIn accounts found for user');
      }
      
      console.log('\n🔧 === POTENTIAL FIXES ===');
      console.log('1. Check backend server logs for detailed error messages');
      console.log('2. Verify JWT token authentication in frontend');
      console.log('3. Check CORS settings for API endpoints');
      console.log('4. Ensure database connections are stable');
      console.log('5. Test auth endpoints with proper authentication headers');
      
    } catch (error) {
      console.error('\n❌ === DEBUG SESSION FAILED ===');
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    } finally {
      if (this.db) {
        await this.db.end();
      }
    }
  }

  async createTestUser() {
    console.log('\n👤 === CREATING TEST USER ===');
    
    try {
      await this.initDatabase();
      
      const userId = uuidv4();
      const email = 'test@linkedin-automation.com';
      const username = 'testuser';
      
      // Check if user already exists
      const [existingUsers] = await this.db.execute(`
        SELECT id FROM users WHERE email = ?
      `, [email]);
      
      if (existingUsers.length > 0) {
        console.log('✅ Test user already exists');
        return existingUsers[0].id;
      }
      
      // Create new test user
      await this.db.execute(`
        INSERT INTO users (id, email, username, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, [
        userId,
        email,
        username,
        'test-password-hash', // In production, use proper password hashing
        'user'
      ]);
      
      console.log(`✅ Test user created:`);
      console.log(`   ID: ${userId}`);
      console.log(`   Email: ${email}`);
      console.log(`   Username: ${username}`);
      
      return userId;
      
    } catch (error) {
      console.error('❌ Failed to create test user:', error.message);
      throw error;
    } finally {
      if (this.db) {
        await this.db.end();
      }
    }
  }
}

// Run debug session
if (require.main === module) {
  const debugger = new AuthEndpointDebugger();
  
  async function runDebugSession() {
    try {
      // Check command line arguments
      if (process.argv.includes('--create-user')) {
        await debugger.createTestUser();
      } else {
        await debugger.testAuthEndpoint();
      }
    } catch (error) {
      console.error('Debug session failed:', error.message);
      process.exit(1);
    }
  }
  
  runDebugSession();
}

module.exports = AuthEndpointDebugger;