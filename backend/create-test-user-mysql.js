const { initializeDatabase, query } = require('./utils/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function createTestUser() {
  try {
    // Initialize database connection
    await initializeDatabase();
    console.log('✅ MySQL database connected successfully');

    const testUserId = uuidv4();
    const testEmail = 'test@example.com';
    const testName = 'Test User';
    const testPassword = 'testpassword123';

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = ?',
      [testEmail]
    );

    if (existingUser.length > 0) {
      console.log('⚠️ Test user already exists');
      console.log(`   Email: ${testEmail}`);
      console.log(`   Password: ${testPassword}`);
      console.log(`   User ID: ${existingUser[0].id}`);
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(testPassword, 10);

    // Create test user
    await query(`
      INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `, [testUserId, testEmail, testName, passwordHash]);

    console.log('✅ Test user created successfully');
    console.log(`   Email: ${testEmail}`);
    console.log(`   Password: ${testPassword}`);
    console.log(`   User ID: ${testUserId}`);
    console.log('✅ Test user setup completed');

  } catch (error) {
    console.error('❌ Error creating test user:', error);
    console.error('❌ Test user setup failed:', error);
  } finally {
    process.exit(0);
  }
}

createTestUser();