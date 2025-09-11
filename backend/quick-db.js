const mysql = require('mysql2/promise');

async function quickCheck() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation'
    });
    
    const [accounts] = await connection.execute(
      "SELECT account_name, validation_status FROM linkedin_accounts"
    );
    
    console.log(`Found ${accounts.length} accounts in database:`);
    accounts.forEach(acc => {
      console.log(`- ${acc.account_name}: ${acc.validation_status}`);
    });
    
    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

quickCheck();
