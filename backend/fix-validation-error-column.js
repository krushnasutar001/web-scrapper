const mysql = require('mysql2/promise');

async function fixValidationErrorColumn() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Krushna_Sutar@0809',
    database: 'linkedin_automation'
  });

  try {
    console.log('🔧 Adding validation_error column to linkedin_accounts table...');
    
    // Check if validation_error column exists first
    const [columns] = await connection.execute(`
      SHOW COLUMNS FROM linkedin_accounts LIKE 'validation_error'
    `);
    
    if (columns.length === 0) {
      // Add validation_error column if it doesn't exist
      await connection.execute(`
        ALTER TABLE linkedin_accounts 
        ADD COLUMN validation_error TEXT DEFAULT NULL
      `);
      console.log('✅ Successfully added validation_error column');
    } else {
      console.log('ℹ️ validation_error column already exists');
    }
    
    // Check if validation_details column exists
    const [detailsColumns] = await connection.execute(`
      SHOW COLUMNS FROM linkedin_accounts LIKE 'validation_details'
    `);
    
    if (detailsColumns.length === 0) {
      // Add validation_details column for more comprehensive error tracking
      await connection.execute(`
        ALTER TABLE linkedin_accounts 
        ADD COLUMN validation_details JSON DEFAULT NULL
      `);
      console.log('✅ Successfully added validation_details column');
    } else {
      console.log('ℹ️ validation_details column already exists');
    }
    
  } catch (error) {
    console.error('❌ Error fixing validation_error column:', error.message);
  } finally {
    await connection.end();
  }
}

fixValidationErrorColumn();