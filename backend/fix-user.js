const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

async function fixUser() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation_saas'
    });
    
    console.log('Connected to database');
    
    // Generate proper hash
    const hash = await bcrypt.hash('Krushna_Sutar@0809', 10);
    console.log('Generated hash:', hash);
    console.log('Hash length:', hash.length);
    
    // Delete existing user
    await connection.execute('DELETE FROM users WHERE email = ?', ['krushna.sutar001@gmail.com']);
    console.log('Deleted existing user');
    
    // Create new user
    const userId = uuidv4();
    await connection.execute(
      'INSERT INTO users (id, email, password_hash, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
      [userId, 'krushna.sutar001@gmail.com', hash, 'Krushna Sutar']
    );
    console.log('Created new user with ID:', userId);
    
    // Verify the user
    const [rows] = await connection.execute('SELECT id, email, password_hash FROM users WHERE email = ?', ['krushna.sutar001@gmail.com']);
    const storedHash = rows[0].password_hash;
    console.log('Stored hash length:', storedHash.length);
    console.log('Stored hash starts with:', storedHash.substring(0, 10));
    
    // Test password verification
    const result = await bcrypt.compare('Krushna_Sutar@0809', storedHash);
    console.log('Password verification result:', result);
    
    await connection.end();
    console.log('User fix completed successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

fixUser();