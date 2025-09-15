const mysql = require('mysql2/promise');

async function verifyDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation'
    });
    
    console.log('=== CURRENT DATABASE STATUS ===');
    
    const [accounts] = await connection.execute(
      "SELECT id, account_name, email, validation_status, is_active FROM linkedin_accounts"
    );
    
    console.log(`Total accounts: ${accounts.length}`);
    accounts.forEach((acc, i) => {
      console.log(`${i+1}. ${acc.account_name}`);
      console.log(`   Status: ${acc.validation_status}`);
      console.log(`   Active: ${acc.is_active}`);
      console.log(`   Email: ${acc.email || 'NULL'}`);
      console.log(`   ID: ${acc.id}`);
    });
    
    // Check API filter results
    const [apiResults] = await connection.execute(
      "SELECT * FROM linkedin_accounts WHERE is_active = 1 AND validation_status IN ('ACTIVE', 'PENDING')"
    );
    
    console.log(`\n=== API FILTER RESULTS ===`);
    console.log(`Accounts passing API filter: ${apiResults.length}`);
    
    if (apiResults.length === 0) {
      console.log(' NO ACCOUNTS PASS API FILTER!');
      console.log('Applying fix now...');
      
      await connection.execute(
        "UPDATE linkedin_accounts SET is_active = 1, validation_status = 'ACTIVE'"
      );
      
      console.log(' Applied database fix');
      
      // Verify fix
      const [fixed] = await connection.execute(
        "SELECT * FROM linkedin_accounts WHERE is_active = 1 AND validation_status IN ('ACTIVE', 'PENDING')"
      );
      
      console.log(`Now ${fixed.length} accounts available`);
    } else {
      console.log(' Database status is correct');
      apiResults.forEach(acc => {
        console.log(`  - ${acc.account_name}: ${acc.validation_status}`);
      });
    }
    
    await connection.end();
  } catch (error) {
    console.error('Database error:', error.message);
  }
}

verifyDatabase();
