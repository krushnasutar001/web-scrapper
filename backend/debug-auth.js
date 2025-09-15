// Load environment variables
require('dotenv').config();

const { initializeDatabase } = require('./utils/database');
const User = require('./models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateTokens } = require('./middleware/auth');

console.log('🔍 Environment variables loaded:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '***' : 'NOT SET');
console.log('');

async function debugAuthentication() {
  try {
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    console.log('\n🔍 Testing direct password verification...');
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation_saas'
    });
    
    const [rows] = await connection.execute(
      'SELECT id, email, password_hash, name, is_active FROM users WHERE email = ?',
      ['krushna.sutar001@gmail.com']
    );
    
    if (rows.length === 0) {
      console.log('❌ User not found in database');
      await connection.end();
      return;
    }
    
    const dbUser = rows[0];
    console.log('✅ User found in database:', {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      is_active: dbUser.is_active,
      hash_length: dbUser.password_hash.length,
      hash_start: dbUser.password_hash.substring(0, 15)
    });
    
    const passwordMatch = await bcrypt.compare('Krushna_Sutar@0809', dbUser.password_hash);
    console.log('🔐 Direct password verification:', passwordMatch);
    
    await connection.end();
    
    console.log('\n🔍 Testing User.authenticate method...');
    const authenticatedUser = await User.authenticate('krushna.sutar001@gmail.com', 'Krushna_Sutar@0809');
    
    if (authenticatedUser) {
      console.log('✅ User.authenticate successful:', {
        id: authenticatedUser.id,
        email: authenticatedUser.email,
        name: authenticatedUser.name,
        is_active: authenticatedUser.is_active
      });
      
      console.log('\n🔍 Testing JWT token generation...');
      const tokens = generateTokens(authenticatedUser);
      console.log('✅ Tokens generated:', {
        accessTokenLength: tokens.accessToken.length,
        refreshTokenLength: tokens.refreshToken.length,
        accessTokenStart: tokens.accessToken.substring(0, 20),
        expiresIn: tokens.expiresIn
      });
      
      console.log('\n🔍 Testing JWT token verification...');
      try {
        const decoded = jwt.verify(tokens.accessToken, process.env.JWT_SECRET || 'linkedin-automation-jwt-secret-key');
        console.log('✅ Token verification successful:', {
          id: decoded.id,
          email: decoded.email,
          type: decoded.type,
          exp: new Date(decoded.exp * 1000).toISOString()
        });
      } catch (jwtError) {
        console.log('❌ Token verification failed:', jwtError.message);
      }
      
    } else {
      console.log('❌ User.authenticate failed - returned null');
    }
    
    console.log('\n🔍 Testing with wrong password...');
    const wrongPasswordUser = await User.authenticate('krushna.sutar001@gmail.com', 'wrongpassword');
    console.log('🔐 Wrong password result:', wrongPasswordUser ? 'Should be null!' : 'Correctly null');
    
    console.log('\n✅ Authentication debugging completed');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  } finally {
    process.exit(0);
  }
}

debugAuthentication();