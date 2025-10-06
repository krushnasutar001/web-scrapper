// Create a compatible test user in linkedin_automation_saas
require('dotenv').config();

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function run() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'linkedin_automation_saas',
  };

  const email = process.env.TEST_USER_EMAIL || 'test@example.com';
  const password = process.env.TEST_USER_PASSWORD || 'password123';
  const name = process.env.TEST_USER_NAME || 'Test User';

  let conn;
  try {
    console.log('🔄 Connecting to MySQL...', dbConfig);
    conn = await mysql.createConnection(dbConfig);
    console.log('✅ Connected');

    // Ensure users table has password_hash field by checking DESCRIBE
    const [columns] = await conn.execute('DESCRIBE users');
    const hasPasswordHash = columns.some(c => c.Field === 'password_hash');
    const hasName = columns.some(c => c.Field === 'name');
    const hasIsActive = columns.some(c => c.Field === 'is_active');
    if (!hasPasswordHash || !hasName || !hasIsActive) {
      console.warn('⚠️ Users table might not match expected schema. Columns:', columns.map(c => c.Field));
    }

    const [existing] = await conn.execute('SELECT id, is_active FROM users WHERE email = ?', [email]);
    if (existing.length) {
      console.log(`ℹ️ User already exists: ${email} (active=${existing[0].is_active})`);
      return;
    }

    const id = uuidv4();
    const hash = await bcrypt.hash(password, 12);

    await conn.execute(
      `INSERT INTO users (id, email, password_hash, name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
      [id, email, hash, name]
    );

    console.log('🎉 Test user created');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('🆔 ID:', id);
  } catch (err) {
    console.error('❌ Failed to create test user:', err.message);
    if (err.sqlMessage) console.error('SQL:', err.sqlMessage);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

run();