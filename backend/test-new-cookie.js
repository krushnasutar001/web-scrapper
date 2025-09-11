/**
 * Test script for the new LinkedIn cookie
 * Tests immediate validation and account addition
 */

const OptimizedLinkedInValidator = require('./optimized-validator');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// New cookie provided by user
const NEW_COOKIE = 'AQEDAVIYJnMCe5EDAAABmR6x5g4AAAGZQr5qDk0AQ5RVrd-SfiZANkk64STLQyYEpDQh5zAk7otXPjPyz_Hh7k2bGuLomC9XHkGtWw_cvROb_OVZ08Gzx09a9YmUjDXt1ZbTAQJubGcaFKI2kfPEJFHZ';

class NewCookieTest {
  constructor() {
    this.validator = new OptimizedLinkedInValidator();
    this.validator.setHttpFirst(true);
    this.validator.setTimeouts(3000, 10000);
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
    // Simple encryption for demo - in production use proper encryption
    return Buffer.from(text).toString('base64');
  }

  async testNewCookie() {
    console.log('🔍 === NEW LINKEDIN COOKIE TEST ===');
    console.log(`Testing cookie: ${NEW_COOKIE.substring(0, 20)}...${NEW_COOKIE.substring(NEW_COOKIE.length - 10)}`);
    console.log(`Cookie Length: ${NEW_COOKIE.length} characters`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    
    try {
      await this.initDatabase();
      
      // Step 1: Test cookie validation
      console.log('\n🚀 === STEP 1: COOKIE VALIDATION ===');
      const validationStart = Date.now();
      
      const validationResult = await this.validator.validateCookie(
        NEW_COOKIE, 
        null, 
        'NewCookie-Test'
      );
      
      const validationTime = Date.now() - validationStart;
      
      console.log('\n📊 Validation Results:');
      console.log(`   Status: ${validationResult.status}`);
      console.log(`   Method: ${validationResult.method}`);
      console.log(`   Time: ${validationTime}ms`);
      console.log(`   Valid: ${validationResult.isValid}`);
      console.log(`   Message: ${validationResult.message}`);
      
      if (!validationResult.isValid) {
        console.log('❌ Cookie validation failed - cannot proceed with account creation');
        return;
      }
      
      // Step 2: Add account to database
      console.log('\n💾 === STEP 2: DATABASE ACCOUNT CREATION ===');
      const accountStart = Date.now();
      
      // Generate unique account name and IDs
      const accountId = uuidv4();
      const userId = '0e5719e5-009c-4e99-b50c-b2730f659d55'; // Use existing user ID
      const accountName = `TestAccount_${Date.now()}`;
      const encryptedCookie = this.encrypt(NEW_COOKIE);
      
      console.log(`Creating account: ${accountName}`);
      
      const [result] = await this.db.execute(`
        INSERT INTO linkedin_accounts (
          id, user_id, account_name, email, session_cookie, 
          validation_status, is_active, created_at, last_validated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        accountId,
        userId,
        accountName,
        'test@example.com',
        encryptedCookie,
        validationResult.status, // Use validation result
        1 // Active
      ]);
      const accountTime = Date.now() - accountStart;
      
      console.log(`✅ Account created successfully:`);
      console.log(`   Account ID: ${accountId}`);
      console.log(`   Account Name: ${accountName}`);
      console.log(`   Status: ${validationResult.status}`);
      console.log(`   Creation Time: ${accountTime}ms`);
      
      // Step 3: Verify account in database
      console.log('\n🔍 === STEP 3: DATABASE VERIFICATION ===');
      
      const [accounts] = await this.db.execute(`
        SELECT id, account_name, validation_status, is_active, 
               created_at, last_validated_at
        FROM linkedin_accounts 
        WHERE id = ?
      `, [accountId]);
      
      if (accounts.length > 0) {
        const account = accounts[0];
        console.log('✅ Account verified in database:');
        console.log(`   ID: ${account.id}`);
        console.log(`   Name: ${account.account_name}`);
        console.log(`   Status: ${account.validation_status}`);
        console.log(`   Active: ${account.is_active ? 'Yes' : 'No'}`);
        console.log(`   Created: ${account.created_at}`);
        console.log(`   Last Validated: ${account.last_validated_at}`);
        
        if (account.validation_status === 'ACTIVE') {
          console.log('🎉 SUCCESS: Account is ACTIVE and ready for scraping!');
        } else {
          console.log('⚠️ WARNING: Account status is not ACTIVE');
        }
      } else {
        console.log('❌ ERROR: Account not found in database');
      }
      
      // Step 4: Test account retrieval (simulate UI fetch)
      console.log('\n📱 === STEP 4: UI SIMULATION ===');
      
      const [allAccounts] = await this.db.execute(`
        SELECT id, account_name, validation_status, is_active,
               created_at, last_validated_at
        FROM linkedin_accounts 
        ORDER BY created_at DESC
        LIMIT 5
      `);
      
      console.log(`Found ${allAccounts.length} accounts for user:`);
      allAccounts.forEach((acc, index) => {
        const statusIcon = acc.validation_status === 'ACTIVE' ? '✅' : 
                          acc.validation_status === 'INVALID' ? '❌' : 
                          acc.validation_status === 'pending' ? '⏳' : '❓';
        
        console.log(`   ${index + 1}. ${statusIcon} ${acc.account_name} - ${acc.validation_status}`);
      });
      
      // Step 5: Performance summary
      console.log('\n⚡ === PERFORMANCE SUMMARY ===');
      const totalTime = Date.now() - validationStart;
      
      console.log(`Total Process Time: ${totalTime}ms`);
      console.log(`   Validation: ${validationTime}ms`);
      console.log(`   Database Creation: ${accountTime}ms`);
      console.log(`   Overhead: ${totalTime - validationTime - accountTime}ms`);
      
      if (totalTime < 2000) {
        console.log('🚀 EXCELLENT: Total process under 2 seconds!');
      } else if (totalTime < 5000) {
        console.log('✅ GOOD: Total process under 5 seconds');
      } else {
        console.log('⚠️ SLOW: Process took over 5 seconds');
      }
      
      // Step 6: Recommendations
      console.log('\n💡 === RECOMMENDATIONS ===');
      
      if (validationResult.method === 'HTTP') {
        console.log('✅ HTTP validation worked perfectly - optimal performance');
        console.log('🚀 System is ready for production use');
      } else {
        console.log('⚠️ Fell back to browser validation - consider HTTP optimization');
      }
      
      if (validationResult.status === 'ACTIVE') {
        console.log('✅ Cookie is valid and working');
        console.log('🎯 Account can be used immediately for scraping');
      } else {
        console.log('❌ Cookie validation failed - check cookie validity');
      }
      
      console.log('\n🎉 === TEST COMPLETE ===');
      console.log('The system should now show the account as ACTIVE immediately after upload!');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      console.error('Stack:', error.stack);
    } finally {
      if (this.db) {
        await this.db.end();
      }
    }
  }

  async simulateCSVUpload() {
    console.log('\n📄 === CSV UPLOAD SIMULATION ===');
    
    try {
      await this.initDatabase();
      
      // Simulate CSV data
      const csvData = [
        {
          account_name: `CSVAccount_${Date.now()}`,
          li_at: NEW_COOKIE
        }
      ];
      
      console.log(`Simulating CSV upload with ${csvData.length} account(s)`);
      
      for (const row of csvData) {
        console.log(`\n🔄 Processing: ${row.account_name}`);
        
        // Step 1: Create account with PENDING status
        const accountId = uuidv4();
        const userId = '0e5719e5-009c-4e99-b50c-b2730f659d55'; // Use existing user ID
        
        const [result] = await this.db.execute(`
          INSERT INTO linkedin_accounts (
            id, user_id, account_name, email, session_cookie, 
            validation_status, is_active, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          accountId,
          userId,
          row.account_name,
          'csv@example.com',
          this.encrypt(row.li_at),
          'pending', // Start as pending
          1
        ]);
        console.log(`   ⏳ Account created with PENDING status (ID: ${accountId})`);
        
        // Step 2: Immediate background validation
        console.log(`   🔍 Starting background validation...`);
        
        const validationResult = await this.validator.validateCookie(
          row.li_at,
          null,
          row.account_name
        );
        
        // Step 3: Update status based on validation
        await this.db.execute(`
          UPDATE linkedin_accounts 
          SET validation_status = ?, last_validated_at = NOW()
          WHERE id = ?
        `, [validationResult.status, accountId]);
        
        console.log(`   ${validationResult.isValid ? '✅' : '❌'} Validation complete: ${validationResult.status}`);
        console.log(`   📝 Database updated with final status`);
      }
      
      // Show final results
      const [finalAccounts] = await this.db.execute(`
        SELECT account_name, validation_status, created_at, last_validated_at
        FROM linkedin_accounts 
        WHERE account_name LIKE 'CSVAccount_%'
        ORDER BY created_at DESC
        LIMIT 5
      `);
      
      console.log('\n📊 Final CSV Upload Results:');
      finalAccounts.forEach((acc, index) => {
        const statusIcon = acc.validation_status === 'ACTIVE' ? '✅' : 
                          acc.validation_status === 'INVALID' ? '❌' : '⏳';
        console.log(`   ${index + 1}. ${statusIcon} ${acc.account_name} - ${acc.validation_status}`);
      });
      
    } catch (error) {
      console.error('❌ CSV simulation failed:', error.message);
    } finally {
      if (this.db) {
        await this.db.end();
      }
    }
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  const tester = new NewCookieTest();
  
  async function runAllTests() {
    await tester.testNewCookie();
    await tester.simulateCSVUpload();
  }
  
  runAllTests().catch(console.error);
}

module.exports = NewCookieTest;