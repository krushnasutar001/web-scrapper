const mysql = require('mysql2/promise');

async function checkAccounts() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation_saas'
    });

    console.log('=== LINKEDIN ACCOUNTS COOKIE CHECK ===');
    const [rows] = await connection.execute(`
      SELECT id, account_name, JSON_LENGTH(cookies) AS cookie_size, 
             validation_status, is_active 
      FROM linkedin_accounts
    `);
    
    if (rows.length === 0) {
      console.log('No LinkedIn accounts found');
    } else {
      rows.forEach(row => {
        console.log(`ID: ${row.id}`);
        console.log(`Name: ${row.account_name}`);
        console.log(`Cookie Size: ${row.cookie_size || 0}`);
        console.log(`Status: ${row.validation_status}`);
        console.log(`Active: ${row.is_active}`);
        console.log('---');
      });
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAccounts();