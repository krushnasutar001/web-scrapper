require('dotenv').config();
const LinkedInAccount = require('./models/LinkedInAccount');
const { initializeDatabase, query } = require('./utils/database');

async function debugCookieHandling() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Get existing user ID
    const users = await query('SELECT id FROM users LIMIT 1');
    const userId = users[0].id;
    console.log('✅ Using user ID:', userId);
    
    // Test creating account with cookies
    const testCookies = [
      { name: 'li_at', value: 'test_value_123', domain: '.linkedin.com' },
      { name: 'JSESSIONID', value: 'ajax:test_session', domain: '.linkedin.com' }
    ];
    
    console.log('🍪 Creating account with cookies:', JSON.stringify(testCookies));
    
    const account = await LinkedInAccount.create({
      user_id: userId,
      account_name: 'Debug Cookie Account',
      email: 'debug_cookies_' + Date.now() + '@example.com',
      username: 'debuguser',
      cookies_json: JSON.stringify(testCookies)
    });
    
    console.log('✅ Account created with ID:', account.id);
    console.log('🍪 Account cookies_json field:', account.cookies_json);
    
    // Test retrieving cookies
    const retrievedCookies = account.getCookies();
    console.log('✅ Final result - cookies count:', retrievedCookies.length);
    if (retrievedCookies.length > 0) {
      console.log('✅ Cookie names:', retrievedCookies.map(c => c.name));
    }
    
    // Clean up
    await account.delete();
    console.log('✅ Test account deleted');
    
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  }
}

debugCookieHandling();