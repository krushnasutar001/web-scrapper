// Reset a user's password by email in the configured MySQL DB
require('dotenv').config();

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function run() {
  const email = process.env.RESET_EMAIL || 'test@example.com';
  const newPassword = process.env.RESET_PASSWORD || 'password123';

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'linkedin_automation_saas',
  };

  let conn;
  try {
    console.log('🔄 Connecting to MySQL...', dbConfig);
    conn = await mysql.createConnection(dbConfig);
    console.log('✅ Connected');

    const [users] = await conn.execute(
      'SELECT id, email, is_active FROM users WHERE email = ?',
      [email]
    );
    if (!users.length) {
      console.error(`❌ No user found with email ${email}`);
      process.exitCode = 1;
      return;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await conn.execute(
      'UPDATE users SET password_hash = ?, is_active = 1, updated_at = NOW() WHERE email = ?',
      [hash, email]
    );

    console.log(`🎉 Password reset for ${email}`);
  } catch (err) {
    console.error('❌ Failed to reset password:', err.message);
    if (err.sqlMessage) console.error('SQL:', err.sqlMessage);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

run();