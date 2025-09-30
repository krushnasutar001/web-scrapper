const mysql = require('mysql2/promise');

async function fixDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation_saas'
    });
    
    console.log('Connected to MySQL database');
    
    // Add missing last_validated_at column to linkedin_accounts
    try {
      await connection.execute('ALTER TABLE linkedin_accounts ADD COLUMN last_validated_at TIMESTAMP NULL');
      console.log('✅ Added last_validated_at column to linkedin_accounts');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️  last_validated_at column already exists');
      } else {
        console.log('❌ Error adding last_validated_at:', err.message);
      }
    }
    
    // Fix scraping_jobs status column to use proper ENUM
    try {
      const statusEnum = 'ENUM("pending","fetching","parsing","completed","failed","cancelled")';
      await connection.execute(`ALTER TABLE scraping_jobs MODIFY COLUMN status ${statusEnum} DEFAULT "pending"`);
      console.log('✅ Fixed scraping_jobs status column ENUM');
    } catch (err) {
      console.log('❌ Error fixing scraping_jobs status:', err.message);
    }
    
    console.log('Database schema fixes completed');
    
  } catch (error) {
    console.error('Database connection error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

fixDatabase();