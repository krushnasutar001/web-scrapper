const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function fixPassword() {
  let db;
  
  try {
    // Connect to database
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation'
    });
    
    console.log('✅ Connected to database');
    
    // Hash the password properly
    const password = 'Krushna_Sutar@0809';
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    console.log('🔄 Generated hash:', passwordHash);
    console.log('🔄 Hash length:', passwordHash.length);
    
    // Update the user's password
    const [result] = await db.execute(
      'UPDATE users SET password_hash = ? WHERE email = ?',
      [passwordHash, 'krushna.sutar001@gmail.com']
    );
    
    console.log('✅ Password updated. Affected rows:', result.affectedRows);
    
    // Verify the update
    const [users] = await db.execute(
      'SELECT email, LENGTH(password_hash) as hash_length FROM users WHERE email = ?',
      ['krushna.sutar001@gmail.com']
    );
    
    if (users.length > 0) {
      console.log('✅ Verification - Hash length:', users[0].hash_length);
      
      // Test bcrypt comparison
      const [testUsers] = await db.execute(
        'SELECT password_hash FROM users WHERE email = ?',
        ['krushna.sutar001@gmail.com']
      );
      
      const isValid = await bcrypt.compare(password, testUsers[0].password_hash);
      console.log('✅ Password comparison test:', isValid ? 'PASS' : 'FAIL');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (db) {
      await db.end();
    }
  }
}

fixPassword();