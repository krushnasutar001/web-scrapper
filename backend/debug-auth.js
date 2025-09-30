const bcrypt = require('bcrypt');
const { query, initializeDatabase } = require('./utils/database');

async function debugAuth() {
  try {
    console.log('🔍 Debugging authentication...');
    
    // Initialize database first
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Get the user from database
    const sql = 'SELECT id, email, password_hash, name, is_active FROM users WHERE email = ?';
    const results = await query(sql, ['test@example.com']);
    
    if (results.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = results[0];
    console.log('✅ User found:', {
      id: user.id,
      email: user.email,
      name: user.name,
      is_active: user.is_active,
      password_hash_length: user.password_hash.length,
      password_hash_starts_with: user.password_hash.substring(0, 10)
    });
    
    // Test password comparison
    const testPassword = 'testpassword123';
    console.log('🔍 Testing password:', testPassword);
    
    const isValidPassword = await bcrypt.compare(testPassword, user.password_hash);
    console.log('🔍 Password comparison result:', isValidPassword);
    
    // Test with different variations
    const variations = ['testpassword123', 'TestPassword123', 'testPassword123'];
    for (const variation of variations) {
      const result = await bcrypt.compare(variation, user.password_hash);
      console.log(`🔍 Testing "${variation}":`, result);
    }
    
    // Generate a new hash for comparison
    const newHash = await bcrypt.hash('testpassword123', 10);
    console.log('🔍 New hash generated:', newHash);
    const newHashTest = await bcrypt.compare('testpassword123', newHash);
    console.log('🔍 New hash test:', newHashTest);
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  } finally {
    process.exit(0);
  }
}

debugAuth();