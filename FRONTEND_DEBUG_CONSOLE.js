// ========================================
//    FRONTEND DEBUG CONSOLE SCRIPT
//    Run this in browser console (F12)
// ========================================

console.log('🔍 FRONTEND DEBUG SCRIPT LOADED');
console.log('========================================');

// Function to test authentication
function testAuth() {
    console.log('\n🔐 TESTING AUTHENTICATION');
    console.log('==========================');
    
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    console.log('Token:', token ? `Present (${token.substring(0, 20)}...)` : 'MISSING');
    console.log('User:', user ? `Present (${JSON.parse(user).email})` : 'MISSING');
    
    if (!token || !user) {
        console.error('❌ AUTHENTICATION MISSING!');
        console.log('🎯 SOLUTION: You need to log in first');
        return false;
    }
    
    console.log('✅ Authentication data found');
    return true;
}

// Function to test API call exactly like the frontend does
async function testAccountsAPI() {
    console.log('\n🌐 TESTING ACCOUNTS API');
    console.log('========================');
    
    if (!testAuth()) {
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        console.log('📡 Making API call to /api/linkedin-accounts/available...');
        
        const response = await fetch('/api/linkedin-accounts/available', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📊 Response Status:', response.status);
        console.log('📊 Response Headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            console.error('Error Body:', errorText);
            return;
        }
        
        const data = await response.json();
        console.log('📋 Raw Response Data:', data);
        
        if (data && data.success) {
            const accounts = data.data || [];
            console.log(`✅ SUCCESS: Found ${accounts.length} accounts`);
            
            if (accounts.length > 0) {
                console.log('📋 Account Details:');
                accounts.forEach((account, index) => {
                    console.log(`   ${index + 1}. ${account.account_name} (${account.validation_status})`);
                });
            } else {
                console.warn('⚠️ API returned success but 0 accounts');
            }
            
            return accounts;
        } else {
            console.error('❌ API returned success=false');
            console.error('Error message:', data.message || 'No error message');
        }
        
    } catch (error) {
        console.error('❌ API Call Failed:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
    }
}

// Function to simulate the exact frontend flow
async function simulateFrontendFlow() {
    console.log('\n🎭 SIMULATING FRONTEND FLOW');
    console.log('=============================');
    
    // Step 1: Check if modal would open
    console.log('1. Modal opening - would trigger fetchAvailableAccounts()');
    
    // Step 2: Simulate the exact API call
    console.log('2. Calling fetchAvailableAccounts()...');
    
    try {
        console.log('🔍 Fetching available accounts...');
        
        // This is the exact same call as in NewJobModal.js
        const response = await fetch('/api/linkedin-accounts/available', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('📋 Available accounts response:', data);
        
        if (response && data && data.success) {
            const accounts = data.data || [];
            console.log(`✅ Found ${accounts.length} available accounts:`, accounts);
            
            // Step 3: Check what would happen in the UI
            if (accounts.length === 0) {
                console.log('🚨 UI WOULD SHOW: "No LinkedIn accounts available"');
                console.log('🎯 This is the problem!');
            } else {
                console.log('✅ UI WOULD SHOW: Account selection interface');
                console.log('🎉 This should work!');
            }
            
            return accounts;
        } else {
            console.warn('⚠️ Invalid accounts response format:', data);
            console.log('🚨 UI WOULD SHOW: "No LinkedIn accounts available"');
            return [];
        }
        
    } catch (error) {
        console.error('❌ Failed to fetch available accounts:', error);
        console.log('🚨 UI WOULD SHOW: "No LinkedIn accounts available"');
        return [];
    }
}

// Function to check network requests
function checkNetworkRequests() {
    console.log('\n🌐 NETWORK REQUESTS CHECK');
    console.log('==========================');
    console.log('1. Open DevTools → Network tab');
    console.log('2. Filter by "linkedin-accounts"');
    console.log('3. Refresh the Jobs page or open the modal');
    console.log('4. Look for the API call and check:');
    console.log('   - Status code (should be 200)');
    console.log('   - Request headers (should include Authorization)');
    console.log('   - Response body (should contain accounts)');
}

// Function to fix common issues
function quickFix() {
    console.log('\n🔧 QUICK FIX ATTEMPTS');
    console.log('======================');
    
    // Clear any cached data
    console.log('1. Clearing potential cache issues...');
    
    // Force refresh the page
    console.log('2. To force refresh: location.reload(true)');
    
    // Clear auth and re-login
    console.log('3. To clear auth: clearAuth() then re-login');
}

function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    console.log('🧹 Authentication cleared. Please log in again.');
}

// Auto-run diagnostics
console.log('\n🚀 AUTO-RUNNING DIAGNOSTICS...');
console.log('================================');

// Run tests
testAuth();
setTimeout(() => {
    testAccountsAPI();
}, 1000);

setTimeout(() => {
    simulateFrontendFlow();
}, 2000);

// Export functions to global scope
window.testAuth = testAuth;
window.testAccountsAPI = testAccountsAPI;
window.simulateFrontendFlow = simulateFrontendFlow;
window.checkNetworkRequests = checkNetworkRequests;
window.quickFix = quickFix;
window.clearAuth = clearAuth;

console.log('\n📋 AVAILABLE FUNCTIONS:');
console.log('========================');
console.log('- testAuth() - Check authentication');
console.log('- testAccountsAPI() - Test accounts API');
console.log('- simulateFrontendFlow() - Simulate exact frontend flow');
console.log('- checkNetworkRequests() - Guide for network debugging');
console.log('- quickFix() - Show quick fix options');
console.log('- clearAuth() - Clear authentication data');

console.log('\n🎯 NEXT STEPS:');
console.log('==============');
console.log('1. Check the auto-run results above');
console.log('2. If API fails, check Network tab in DevTools');
console.log('3. If API works but UI shows no accounts, it\'s a rendering issue');
console.log('4. Run simulateFrontendFlow() to see exact frontend behavior');