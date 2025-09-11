const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function createAdminUser() {
  let connection;
  
  try {
    console.log('🔄 Connecting to MySQL database...');
    
    // Connect to the specific database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation'
    });
    
    console.log('✅ Connected to database');
    
    // User details
    const email = 'krushna.sutar001@gmail.com';
    const password = 'Krushna_Sutar@0809';
    const firstName = 'Krushna';
    const lastName = 'Sutar';
    
    // Check if user already exists
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existingUsers.length > 0) {
      console.log('⚠️  User already exists with email:', email);
      console.log('✅ You can sign in with the existing account');
      return;
    }
    
    // Generate UUID for user ID
    const userId = uuidv4();
    
    // Hash the password
    console.log('🔄 Hashing password...');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Insert the admin user
    console.log('🔄 Creating admin user...');
    await connection.execute(`
      INSERT INTO users (
        id, 
        email, 
        password_hash, 
        first_name, 
        last_name, 
        is_active, 
        email_verified_at,
        created_at, 
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `, [
      userId,
      email,
      passwordHash,
      firstName,
      lastName,
      true,
      new Date() // Mark email as verified
    ]);
    
    console.log('🎉 Admin user created successfully!');
    console.log('');
    console.log('📋 Login Credentials:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('');
    console.log('🌐 Access the application at:');
    console.log('   Frontend: http://localhost:3000');
    console.log('   Backend API: http://localhost:5000');
    console.log('');
    console.log('✅ You can now sign in with these credentials!');
    
  } catch (error) {
    console.error('❌ Failed to create admin user:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Please check your MySQL credentials in the .env file');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 Please make sure MySQL server is running');
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error('💡 Please run the database setup first: node setup-database.js');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
if (require.main === module) {
  createAdminUser();
}

module.exports = createAdminUser;