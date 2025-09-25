const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixUserReferences() {
  console.log('🔧 Fixing user references and foreign key constraints...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: 'linkedin_automation_saas'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connection successful');
    
    // Get the first available user ID
    const [users] = await connection.execute('SELECT id FROM users LIMIT 1');
    if (users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }
    
    const defaultUserId = users[0].id;
    console.log('📋 Using default user ID:', defaultUserId);
    
    // Check if mock-user-id exists, if not create it
    const [mockUsers] = await connection.execute('SELECT id FROM users WHERE id = ?', ['mock-user-id']);
    if (mockUsers.length === 0) {
      console.log('🔄 Creating mock-user-id...');
      await connection.execute(`
        INSERT INTO users (id, email, password_hash, name) VALUES 
        ('mock-user-id', 'mock@example.com', '$2b$10$dummy.hash.for.testing', 'Mock User')
      `);
      console.log('✅ Created mock-user-id');
    }
    
    // Update any jobs that might have invalid user_id references
    console.log('🔄 Updating jobs with invalid user_id references...');
    const [updateResult] = await connection.execute(`
      UPDATE jobs 
      SET user_id = ? 
      WHERE user_id NOT IN (SELECT id FROM users)
    `, [defaultUserId]);
    
    console.log(`✅ Updated ${updateResult.affectedRows} jobs with valid user_id`);
    
    // Update linkedin_accounts with invalid user_id references
    console.log('🔄 Updating linkedin_accounts with invalid user_id references...');
    const [accountUpdateResult] = await connection.execute(`
      UPDATE linkedin_accounts 
      SET user_id = ? 
      WHERE user_id NOT IN (SELECT id FROM users)
    `, [defaultUserId]);
    
    console.log(`✅ Updated ${accountUpdateResult.affectedRows} linkedin_accounts with valid user_id`);
    
    // Test job creation with valid user_id
    console.log('🧪 Testing job creation with valid user_id...');
    const testJobId = 'test-' + Date.now();
    
    try {
      await connection.execute(`
        INSERT INTO jobs (id, user_id, job_name, job_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())
      `, [testJobId, defaultUserId, 'Test Job', 'profile_scraping']);
      
      console.log('✅ Test job creation successful');
      
      // Clean up
      await connection.execute('DELETE FROM jobs WHERE id = ?', [testJobId]);
      console.log('✅ Test job cleaned up');
      
    } catch (testError) {
      console.error('❌ Test job creation failed:', testError.message);
    }
    
    // Show current database state
    console.log('📊 Current database state:');
    const [jobCount] = await connection.execute('SELECT COUNT(*) as count FROM jobs');
    const [accountCount] = await connection.execute('SELECT COUNT(*) as count FROM linkedin_accounts');
    const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM users');
    
    console.log(`  Users: ${userCount[0].count}`);
    console.log(`  LinkedIn Accounts: ${accountCount[0].count}`);
    console.log(`  Jobs: ${jobCount[0].count}`);
    
    console.log('🎉 User references fixed successfully!');
    
  } catch (error) {
    console.error('❌ Fix user references failed:', error.message);
    console.error('Error code:', error.code);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  fixUserReferences().catch(console.error);
}

module.exports = { fixUserReferences };