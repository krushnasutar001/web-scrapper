require('dotenv').config();
const { initializeDatabase, query } = require('./utils/database');

async function createTestUser() {
  try {
    await initializeDatabase();
    
    const testUserId = 'test-user-123';
    
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE id = ?',
      [testUserId]
    );
    
    if (existingUser.length > 0) {
      console.log('✅ Test user already exists');
      return;
    }
    
    // Create test user with INSERT IGNORE to avoid duplicate errors
    await query(`
      INSERT IGNORE INTO users (id, email, name, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `, [testUserId, 'test@example.com', 'Test User', 'dummy_hash']);
    
    console.log('✅ Test user created successfully (or already exists)');
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
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