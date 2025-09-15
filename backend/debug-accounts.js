const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkLinkedInAccounts() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: 'Krushna_Sutar@0809',
      database: process.env.DB_NAME || 'linkedin_automation'
    });
    
    console.log('\n=== DIRECT DATABASE QUERY ===');
    
    // Get all LinkedIn accounts with full details
    const [accounts] = await connection.execute(`
      SELECT 
        id, 
        account_name, 
        email, 
        validation_status, 
        is_active, 
        created_at,
        updated_at
      FROM linkedin_accounts 
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${accounts.length} LinkedIn accounts in database:`);
    console.log('================================================');
    
    accounts.forEach((acc, index) => {
      console.log(`${index + 1}. Account Details:`);
      console.log(`   ID: ${acc.id}`);
      console.log(`   Name: ${acc.account_name}`);
      console.log(`   Email: ${acc.email || 'NULL'}`);
      console.log(`   Status: ${acc.validation_status}`);
      console.log(`   Active: ${acc.is_active}`);
      console.log(`   Created: ${acc.created_at}`);
      console.log(`   Updated: ${acc.updated_at}`);
      console.log('');
    });
    
    // Check what the API query should return
    console.log('\n=== API QUERY SIMULATION ===');
    const apiQuery = `
      SELECT * FROM linkedin_accounts 
      WHERE is_active = 1 
      AND validation_status IN ('ACTIVE', 'PENDING')
    `;
    
    console.log('API Query:', apiQuery);
    
    const [apiResults] = await connection.execute(apiQuery);
    console.log(`API Query Results: ${apiResults.length} accounts`);
    
    if (apiResults.length === 0) {
      console.log('\n PROBLEM IDENTIFIED: API query returns 0 accounts');
      console.log('This explains why job creation shows "No accounts available"');
      
      // Analyze why accounts are filtered out
      const [activeCheck] = await connection.execute(
        "SELECT COUNT(*) as count FROM linkedin_accounts WHERE is_active = 1"
      );
      const [statusCheck] = await connection.execute(
        "SELECT COUNT(*) as count FROM linkedin_accounts WHERE validation_status IN ('ACTIVE', 'PENDING')"
      );
      
      console.log('\n🔍 FILTER ANALYSIS:');
      console.log(`Accounts with is_active = 1: ${activeCheck[0].count}`);
      console.log(`Accounts with status ACTIVE/PENDING: ${statusCheck[0].count}`);
      
      if (activeCheck[0].count === 0) {
        console.log('\n SOLUTION: Set is_active = 1 for your account');
      }
      if (statusCheck[0].count === 0) {
        console.log('\n SOLUTION: Set validation_status to ACTIVE or PENDING');
      }
    } else {
      console.log('\n API query should return accounts:');
      apiResults.forEach(acc => {
        console.log(`  - ${acc.account_name}: ${acc.validation_status}`);
      });
    }
    
    await connection.end();
  } catch (error) {
    console.error('Database error:', error.message);
  }
}

checkLinkedInAccounts();
