const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const testToken = '$freshToken';

console.log('JWT Token Analysis:');
console.log('==================');
console.log('JWT_SECRET:', JWT_SECRET);
console.log('Token length:', testToken.length);
console.log('Token preview:', testToken.substring(0, 50) + '...');

try {
  // Decode without verification to see payload
  const decoded = jwt.decode(testToken);
  console.log('\nDecoded payload:');
  console.log(JSON.stringify(decoded, null, 2));
  
  // Verify with secret
  const verified = jwt.verify(testToken, JWT_SECRET);
  console.log('\n Token verification: SUCCESS');
  console.log('User ID:', verified.userId);
  console.log('Email:', verified.email);
  console.log('Expires:', new Date(verified.exp * 1000));
  
} catch (error) {
  console.log('\n❌ Token verification: FAILED');
  console.log('Error:', error.message);
}
