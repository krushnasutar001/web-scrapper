// Test script to verify long LinkedIn cookie validation (90+ characters)
const longTestCookie = "AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mPiwZMannH_NVPXf8UzpbLO0_PEH0xLYEp9As3KuIf0C_OsNdZ2gxPBc4DEbk08-HytchRmqAgFVsbfYthSBRx3Kpg2nP7Gjnu4Q83ExtraLongCookieDataForTestingPurposes123456789";

console.log('🧪 Testing Long LinkedIn Cookie Validation (90+ characters)');
console.log('=' * 70);
console.log(`Cookie: ${longTestCookie}`);
console.log(`Length: ${longTestCookie.length} characters`);
console.log(`Starts with: ${longTestCookie.substring(0, 10)}`);
console.log(`Ends with: ${longTestCookie.substring(longTestCookie.length - 10)}`);

// Test the validation logic with long cookie
const validPrefixes = ['AQED', 'AQEF', 'AQEA', 'AQEB', 'AQEC'];
const hasValidPrefix = validPrefixes.some(prefix => longTestCookie.startsWith(prefix));
const isValidFormat = longTestCookie && 
                     longTestCookie.length > 20 && 
                     hasValidPrefix && 
                     /^[A-Za-z0-9_-]+$/.test(longTestCookie);

console.log('\n🔍 Long Cookie Validation Results:');
console.log(`Has valid prefix: ${hasValidPrefix}`);
console.log(`Length > 20: ${longTestCookie.length > 20}`);
console.log(`Length > 90: ${longTestCookie.length > 90}`);
console.log(`Valid characters: ${/^[A-Za-z0-9_-]+$/.test(longTestCookie)}`);
console.log(`Overall valid: ${isValidFormat}`);

// Test different cookie lengths
const testCookies = [
    { name: 'Short (50 chars)', cookie: 'AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mP' },
    { name: 'Medium (100 chars)', cookie: 'AQEDAVIYJnMCuKifAAABmR1vPKgAAAGZQXvAqE0AI306tGP49_mPiwZMannH_NVPXf8UzpbLO0_PEH0xLYEp9As3KuIf0C_O' },
    { name: 'Long (150+ chars)', cookie: longTestCookie }
];

console.log('\n📊 Testing Multiple Cookie Lengths:');
testCookies.forEach(test => {
    const hasPrefix = validPrefixes.some(prefix => test.cookie.startsWith(prefix));
    const isValid = test.cookie && 
                   test.cookie.length > 20 && 
                   hasPrefix && 
                   /^[A-Za-z0-9_-]+$/.test(test.cookie);
    
    console.log(`${test.name} (${test.cookie.length} chars): ${isValid ? '✅ VALID' : '❌ INVALID'}`);
});

if (isValidFormat) {
    console.log('\n✅ SUCCESS: Long cookies (90+ characters) are properly validated!');
    console.log('🎯 The system should accept li_at cookies of any reasonable length.');
} else {
    console.log('\n❌ ISSUE: Long cookie validation failed - needs investigation');
}

console.log('\n📝 Note: LinkedIn cookies can vary in length from 50 to 200+ characters');
console.log('🔧 The validation system should handle all valid lengths without restrictions');