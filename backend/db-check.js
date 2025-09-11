const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkAccounts() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    
    const [accounts] = await connection.execute(
      "SELECT id, account_name, email, validation_status, is_active FROM linkedin_accounts"
    );
    
    console.log('DATABASE ACCOUNTS:');
    console.log('==================');
    
    if (accounts.length === 0) {
      console.log(' NO ACCOUNTS IN DATABASE');
      return;
    }
    
    accounts.forEach((acc, i) => {
      console.log(`${i+1}. ${acc.account_name} (${acc.email})`);
      console.log(`   Status: ${acc.validation_status}`);
      console.log(`   Active: ${acc.is_active}`);
      console.log(`   ID: ${acc.id}`);
      console.log('');
    });
    
    const activeCount = accounts.filter(a => a.validation_status === 'ACTIVE').length;
    const pendingCount = accounts.filter(a => a.validation_status === 'PENDING').length;
    
    console.log(`SUMMARY: ${accounts.length} total, ${activeCount} ACTIVE, ${pendingCount} PENDING`);
    
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

checkAccounts();
