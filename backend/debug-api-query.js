const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: 'Krushna_Sutar@0809',
      database: process.env.DB_NAME || 'linkedin_automation'
    });
    
    // Get all accounts
    const [allAccounts] = await connection.execute(
      "SELECT id, account_name, email, validation_status, is_active, created_at FROM linkedin_accounts"
    );
    
    console.log('\nDATABASE ACCOUNTS:');
    console.log('==================');
    
    if (allAccounts.length === 0) {
      console.log(' NO ACCOUNTS IN DATABASE');
      return;
    }
    
    allAccounts.forEach((acc, i) => {
      console.log(`${i+1}. ${acc.account_name} (${acc.email})`);
      console.log(`   Status: ${acc.validation_status}`);
      console.log(`   Active: ${acc.is_active}`);
      console.log(`   ID: ${acc.id}`);
      console.log(`   Created: ${acc.created_at}`);
      console.log('');
    });
    
    // Check what the API query should return
    const [apiQuery] = await connection.execute(
      "SELECT * FROM linkedin_accounts WHERE is_active = 1 AND validation_status IN ('ACTIVE', 'PENDING')"
    );
    
    console.log('API QUERY SIMULATION:');
    console.log('=====================');
    console.log(`Query: SELECT * FROM linkedin_accounts WHERE is_active = 1 AND validation_status IN ('ACTIVE', 'PENDING')`);
    console.log(`Results: ${apiQuery.length} accounts`);
    
    if (apiQuery.length === 0) {
      console.log('❌ API QUERY RETURNS 0 RESULTS');
      console.log('This explains why frontend shows "No accounts available"');
      
      // Check what conditions are failing
      const [activeCheck] = await connection.execute(
        "SELECT COUNT(*) as count FROM linkedin_accounts WHERE is_active = 1"
      );
      const [statusCheck] = await connection.execute(
        "SELECT COUNT(*) as count FROM linkedin_accounts WHERE validation_status IN ('ACTIVE', 'PENDING')"
      );
      
      console.log('\nCONDITION ANALYSIS:');
      console.log(`Accounts with is_active = 1: ${activeCheck[0].count}`);
      console.log(`Accounts with status ACTIVE/PENDING: ${statusCheck[0].count}`);
    } else {
      console.log('✅ API query should return accounts');
      apiQuery.forEach(acc => {
        console.log(`  - ${acc.account_name}: ${acc.validation_status}`);
      });
    }
    
    await connection.end();
  } catch (error) {
    console.error('Database error:', error.message);
  }
}

checkDatabase();
