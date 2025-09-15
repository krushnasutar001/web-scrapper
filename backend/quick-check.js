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
      "SELECT account_name, validation_status, is_active FROM linkedin_accounts"
    );
    
    console.log(`Found ${accounts.length} accounts:`);
    accounts.forEach(acc => {
      console.log(`- ${acc.account_name}: status=${acc.validation_status}, active=${acc.is_active}`);
    });
    
    // Check API filter
    const [filtered] = await connection.execute(
      "SELECT * FROM linkedin_accounts WHERE is_active = 1 AND validation_status IN ('ACTIVE', 'PENDING')"
    );
    
    console.log(`\nAPI would return: ${filtered.length} accounts`);
    if (filtered.length === 0) {
      console.log(' This is why job creation shows no accounts!');
    }
    
    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

quickCheck();
