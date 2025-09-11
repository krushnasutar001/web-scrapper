// Test script to verify LinkedIn cookie validation
const testCookie = "AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mPiwZMannH_NVPXf8UzpbLO0_PEH0xLYEp9As3KuIf0C_OsNdZ2gxPBc4DEbk08-HytchRmqAgFVsbfYthSBRx3Kpg2nP7Gjnu4Q83";

console.log('🧪 Testing LinkedIn Cookie Validation');
console.log('=' * 50);
console.log(`Cookie: ${testCookie}`);
console.log(`Length: ${testCookie.length}`);
console.log(`Starts with: ${testCookie.substring(0, 10)}`);

// Test the validation logic
const validPrefixes = ['AQED', 'AQEF', 'AQEA', 'AQEB', 'AQEC'];
const hasValidPrefix = validPrefixes.some(prefix => testCookie.startsWith(prefix));
const isValidFormat = testCookie && 
                     testCookie.length > 20 && 
                     hasValidPrefix && 
                     /^[A-Za-z0-9_-]+$/.test(testCookie);

console.log('\n🔍 Validation Results:');
console.log(`Has valid prefix: ${hasValidPrefix}`);
console.log(`Length > 20: ${testCookie.length > 20}`);
console.log(`Valid characters: ${/^[A-Za-z0-9_-]+$/.test(testCookie)}`);
console.log(`Overall valid: ${isValidFormat}`);

if (isValidFormat) {
    console.log('\n✅ SUCCESS: Cookie should now be validated as VALID!');
} else {
    console.log('\n❌ FAILED: Cookie validation logic needs further adjustment');
}

console.log('\n🎯 Expected Result: This cookie should be marked as VALID');
console.log('📝 Note: The cookie starts with "AQEDA" which is a valid LinkedIn cookie prefix');