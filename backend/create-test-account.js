require('dotenv').config();
const { initializeDatabase } = require('./database');
const LinkedInAccount = require('./models/LinkedInAccount');

async function setupTestAccount() {
  try {
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    
    console.log('📋 Checking linkedin_accounts table...');
    const [tables] = await require('./utils/database').query('SHOW TABLES LIKE "linkedin_accounts"');
    
    if (tables.length === 0) {
      console.log('🔨 Creating linkedin_accounts table...');
      await require('./utils/database').query(`
        CREATE TABLE linkedin_accounts (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          account_name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          username VARCHAR(255),
          is_active BOOLEAN DEFAULT TRUE,
          validation_status ENUM('ACTIVE', 'INACTIVE', 'BLOCKED', 'PENDING') DEFAULT 'ACTIVE',
          daily_request_limit INT DEFAULT 150,
          requests_today INT DEFAULT 0,
          last_request_at TIMESTAMP NULL,
          cooldown_until TIMESTAMP NULL,
          blocked_until TIMESTAMP NULL,
          consecutive_failures INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_user_email (user_id, email)
        )
      `);
      console.log('✅ linkedin_accounts table created');
    } else {
      console.log('✅ linkedin_accounts table already exists');
    }
    
    // Check for existing accounts
    const [accounts] = await require('./utils/database').query(
      'SELECT COUNT(*) as count FROM linkedin_accounts WHERE user_id = ?', 
      ['553cd272-33e3-4af5-a30c-f695345dd0ca']
    );
    
    console.log(`📊 Existing accounts for user: ${accounts[0].count}`);
    
    if (accounts[0].count === 0) {
      console.log('🔧 Creating test LinkedIn account...');
      await LinkedInAccount.create({
        user_id: '553cd272-33e3-4af5-a30c-f695345dd0ca',
        account_name: 'Test Account',
        email: 'test@linkedin.com',
        username: 'testuser'
      });
      console.log('✅ Test account created successfully');
    } else {
      console.log('✅ Account already exists');
    }
    
    // Verify the account was created
    const [finalAccounts] = await require('./utils/database').query(
      'SELECT * FROM linkedin_accounts WHERE user_id = ?', 
      ['553cd272-33e3-4af5-a30c-f695345dd0ca']
    );
    
    console.log(`🎉 Final account count: ${finalAccounts.length}`);
    if (finalAccounts.length > 0) {
      console.log('📋 Account details:', finalAccounts.map(acc => ({
        name: acc.account_name,
        email: acc.email,
        status: acc.validation_status
      })));
    }
    
  } catch (error) {
    console.error('❌ Error setting up test account:', error.message);
    console.error(error.stack);
  }
}

setupTestAccount();