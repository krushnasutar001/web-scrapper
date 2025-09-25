const LinkedInAccount = require("./models/LinkedInAccount");
const { initializeDatabase } = require('./utils/database');

async function testAccountAuthentication() {
  console.log("🔍 Testing LinkedIn Account Authentication...");
  
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Get all accounts - using findByUserId with a test user ID
    // First, let's get all accounts by querying the database directly
    const { query } = require('./utils/database');
    const results = await query('SELECT * FROM linkedin_accounts ORDER BY created_at DESC');
    const accounts = results.map(account => new LinkedInAccount(account));
    console.log(`Found ${accounts.length} LinkedIn accounts`);
    
    for (const account of accounts) {
      console.log(`\n📋 Account: ${account.account_name}`);
      console.log(`   ID: ${account.id}`);
      console.log(`   Has cookies: ${account.cookies_json ? "Yes" : "No"}`);
      
      if (account.cookies_json) {
        try {
          const cookies = JSON.parse(account.cookies_json);
          console.log(`   Cookie count: ${cookies.length}`);
        } catch (e) {
          console.log(`   Cookie parsing error: ${e.message}`);
        }
      }
      
      // Test getCookies method
      const cookies = account.getCookies();
      console.log(`   getCookies() result: ${cookies ? "Valid cookies" : "No valid cookies"}`);
    }
    
  } catch (error) {
    console.error("❌ Error testing authentication:", error.message);
  }
}

testAccountAuthentication().then(() => {
  console.log("✅ Authentication test completed");
  process.exit(0);
}).catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});