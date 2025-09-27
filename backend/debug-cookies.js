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
    
    // Test creating account with cookies - SINGLE stringify only
    const testCookies = [
      { name: 'li_at', value: 'test_value_123', domain: '.linkedin.com' },
      { name: 'JSESSIONID', value: 'ajax:test_session', domain: '.linkedin.com' }
    ];
    
    console.log('🍪 Creating account with cookies (single stringify):', JSON.stringify(testCookies));
    
    const account = await LinkedInAccount.create({
      user_id: userId,
      account_name: 'Debug Cookie Account',
      email: 'debug_cookies_' + Date.now() + '@example.com',
      username: 'debuguser',
      cookies_json: JSON.stringify(testCookies) // Single stringify only
    });
    
    console.log('✅ Account created with ID:', account.id);
    
    // Check what's actually stored in the database
    const dbResult = await query('SELECT cookies_json FROM linkedin_accounts WHERE id = ?', [account.id]);
    console.log('🍪 Raw DB value:', dbResult[0].cookies_json);
    console.log('🍪 DB value type:', typeof dbResult[0].cookies_json);
    
    // Test retrieving cookies with our flexible parser
    console.log('\n--- Testing getCookies() method ---');
    const retrievedCookies = account.getCookies();
    
    console.log('\n--- Final Results ---');
    console.log('✅ Retrieved cookies count:', retrievedCookies.length);
    if (retrievedCookies.length > 0) {
      console.log('✅ Cookie names:', retrievedCookies.map(c => c.name));
      console.log('✅ First cookie:', retrievedCookies[0]);
    } else {
      console.log('❌ No cookies retrieved - check parsing logic');
    }
    
    // Test account availability
    console.log('✅ Account is available:', account.isAvailable());
    console.log('✅ Account validation status:', account.validation_status);
    
    // Clean up
    await account.delete();
    console.log('✅ Test account deleted');
    
    if (retrievedCookies.length === 2) {
      console.log('🎉 SUCCESS: Cookie handling is working correctly!');
    } else {
      console.log('❌ FAILURE: Expected 2 cookies, got', retrievedCookies.length);
    }
    
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugCookieHandling();