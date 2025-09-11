const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkLinkedInAccounts() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    
    // Check linkedin_accounts table
    const [accounts] = await connection.execute(
      "SELECT id, account_name, email, validation_status, is_active, created_at FROM linkedin_accounts ORDER BY created_at DESC"
    );
    
    console.log('\n LinkedIn Accounts in Database:');
    console.log('================================');
    
    if (accounts.length === 0) {
      console.log('❌ No LinkedIn accounts found in database');
      return;
    }
    
    accounts.forEach((account, index) => {
      console.log(`${index + 1}. Account: ${account.account_name}`);
      console.log(`   Email: ${account.email}`);
      console.log(`   Status: ${account.validation_status}`);
      console.log(`   Active: ${account.is_active}`);
      console.log(`   Created: ${account.created_at}`);
      console.log(`   ID: ${account.id}`);
      console.log('');
    });
    
    // Count by status
    const activeCount = accounts.filter(acc => acc.validation_status === 'ACTIVE').length;
    const pendingCount = accounts.filter(acc => acc.validation_status === 'PENDING').length;
    const failedCount = accounts.filter(acc => acc.validation_status === 'FAILED').length;
    
    console.log(' Account Status Summary:');
    console.log(`   ACTIVE: ${activeCount}`);
    console.log(`   PENDING: ${pendingCount}`);
    console.log(`   FAILED: ${failedCount}`);
    console.log(`   TOTAL: ${accounts.length}`);
    
  } catch (error) {
    console.error(' Database check error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkLinkedInAccounts();
