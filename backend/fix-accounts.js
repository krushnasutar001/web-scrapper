const mysql = require('mysql2/promise');

async function fixAccounts() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation'
    });
    
    // Update all accounts to be active and have ACTIVE status
    const [result] = await connection.execute(
      "UPDATE linkedin_accounts SET is_active = 1, validation_status = 'ACTIVE' WHERE 1=1"
    );
    
    console.log(`Updated ${result.affectedRows} accounts`);
    
    // Verify fix
    const [fixed] = await connection.execute(
      "SELECT account_name FROM linkedin_accounts WHERE is_active = 1 AND validation_status = 'ACTIVE'"
    );
    
    console.log(`Now ${fixed.length} accounts available for job creation:`);
    fixed.forEach(acc => {
      console.log(`✅ ${acc.account_name}`);
    });
    
    await connection.end();
  } catch (error) {
    console.error('Fix error:', error.message);
  }
}

fixAccounts();
