require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function createTestUser() {
  let connection;
  try {
    // Create MySQL connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'linkedin_automation_saas',
      port: process.env.DB_PORT || 3306
    });
    
    console.log('✅ MySQL database connected successfully');
    
    const testUserId = uuidv4();
    const testEmail = 'test@example.com';
    const testPassword = 'testpassword123';
    const testName = 'Test User';
    
    // Check if user already exists
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [testEmail]
    );
    
    if (existingUsers.length > 0) {
      console.log('✅ Test user already exists');
      return;
    }
    
    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(testPassword, saltRounds);
    
    // Create test user
    await connection.execute(`
      INSERT INTO users (id, email, name, password_hash, credits, created_at, updated_at)
      VALUES (?, ?, ?, ?, 100, NOW(), NOW())
    `, [testUserId, testEmail, testName, passwordHash]);
    
    console.log('✅ Test user created successfully');
    console.log(`   Email: ${testEmail}`);
    console.log(`   Password: ${testPassword}`);
    console.log(`   User ID: ${testUserId}`);
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createTestUser()
  .then(() => {
    console.log('✅ Test user setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test user setup failed:', error);
    process.exit(1);
  });