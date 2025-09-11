const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabaseSchema() {
  console.log(' Checking database schema...');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: 'Krushna_Sutar@0809',
    database: process.env.DB_NAME || 'linkedin_automation'
  };
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log(' Connected to database');
    
    // Check scraping_jobs table structure
    const [columns] = await connection.execute(
      "DESCRIBE scraping_jobs"
    );
    
    console.log('\n scraping_jobs table structure:');
    columns.forEach(column => {
      console.log(`  ${column.Field}: ${column.Type} ${column.Null === 'YES' ? '(nullable)' : '(not null)'} ${column.Key ? '(' + column.Key + ')' : ''}`);
    });
    
    // Check required columns
    const requiredColumns = ['id', 'job_name', 'job_type', 'status', 'user_id', 'created_at', 'updated_at'];
    const existingColumns = columns.map(col => col.Field);
    
    console.log('\n Required columns check:');
    requiredColumns.forEach(col => {
      if (existingColumns.includes(col)) {
        console.log(`  ✅ ${col}: exists`);
      } else {
        console.log(`  ❌ ${col}: missing`);
      }
    });
    
    // Check users table
    const [userColumns] = await connection.execute(
      "DESCRIBE users"
    );
    
    console.log('\n users table structure:');
    userColumns.forEach(column => {
      console.log(`  ${column.Field}: ${column.Type}`);
    });
    
    // Check if test user exists
    const [users] = await connection.execute(
      "SELECT id, email, is_active FROM users WHERE email = ?",
      ['test@example.com']
    );
    
    if (users.length > 0) {
      console.log('\n✅ Test user exists:');
      console.log(`  ID: ${users[0].id}`);
      console.log(`  Email: ${users[0].email}`);
      console.log(`  Active: ${users[0].is_active}`);
    } else {
      console.log('\n Test user not found');
    }
    
  } catch (error) {
    console.error(' Database schema check error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkDatabaseSchema();
