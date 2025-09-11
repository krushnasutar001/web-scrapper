// ========================================
//    COMPREHENSIVE DEBUG FIX
//    Based on Debugging Plan Analysis
// ========================================

/**
 * DEBUGGING RESULTS SUMMARY:
 * 
 * ✅ Backend API: Working correctly (returns 2 accounts)
 * ✅ Database: Contains accounts with proper structure
 * ❌ Frontend: Authentication or filtering issue
 * 
 * ACCOUNTS FOUND:
 * - "john doe" (ACTIVE)
 * - "mahesh manecc" (INVALID)
 * 
 * ROOT CAUSE: Frontend authentication issue
 */

// ===========================================
// FIX 1: FRONTEND AUTHENTICATION CHECK
// ===========================================

function checkFrontendAuthentication() {
    console.log('🔍 FRONTEND AUTHENTICATION DEBUG');
    console.log('=====================================');
    
    // Check localStorage for authentication
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    console.log('Token:', token ? 'Present' : 'Missing');
    console.log('User:', user ? 'Present' : 'Missing');
    
    if (!token || !user) {
        console.error('❌ AUTHENTICATION MISSING!');
        console.log('🔧 SOLUTION: Log in to http://localhost:3000');
        console.log('📧 Email: test@example.com');
        console.log('🔑 Password: password123');
        return false;
    }
    
    console.log('✅ Authentication data found');
    return true;
}

// ===========================================
// FIX 2: API CALL TEST WITH AUTHENTICATION
// ===========================================

async function testAccountsAPI() {
    console.log('\n🌐 TESTING ACCOUNTS API');
    console.log('========================');
    
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.error('❌ No token available for API call');
        return null;
    }
    
    try {
        const response = await fetch('/api/linkedin-accounts/available', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        console.log('📊 API Response Status:', response.status);
        console.log('📋 API Response Data:', data);
        
        if (data.success && data.count > 0) {
            console.log(`✅ API returns ${data.count} accounts`);
            data.data.forEach((account, index) => {
                console.log(`   ${index + 1}. ${account.account_name} (${account.validation_status})`);
            });
            return data;
        } else {
            console.error('❌ API returns no accounts or error');
            return null;
        }
    } catch (error) {
        console.error('❌ API call failed:', error);
        return null;
    }
}

// ===========================================
// FIX 3: FRONTEND FILTER NORMALIZATION
// ===========================================

function normalizeAccountFilter(accounts) {
    console.log('\n🔧 NORMALIZING ACCOUNT FILTERS');
    console.log('===============================');
    
    if (!accounts || !Array.isArray(accounts)) {
        console.error('❌ Invalid accounts data');
        return [];
    }
    
    // Apply the user's suggested filter logic
    const validAccounts = accounts.filter(account => {
        // Normalize status checking as suggested in the debugging plan
        const isValid = account.is_valid === true || 
                       account.is_valid === 1 || 
                       account.validation_status === 'ACTIVE' ||
                       account.validation_status === 'active' ||
                       account.status === 'active';
        
        console.log(`   Account: ${account.account_name}`);
        console.log(`   - validation_status: ${account.validation_status}`);
        console.log(`   - is_valid: ${account.is_valid}`);
        console.log(`   - status: ${account.status}`);
        console.log(`   - Passes filter: ${isValid}`);
        
        return isValid;
    });
    
    console.log(`\n📊 Filter Results: ${validAccounts.length}/${accounts.length} accounts pass filter`);
    
    return validAccounts;
}

// ===========================================
// FIX 4: COMPREHENSIVE DIAGNOSTIC FUNCTION
// ===========================================

async function runComprehensiveDiagnostic() {
    console.log('🚀 COMPREHENSIVE DIAGNOSTIC STARTING');
    console.log('====================================');
    
    // Step 1: Check authentication
    const isAuthenticated = checkFrontendAuthentication();
    
    if (!isAuthenticated) {
        console.log('\n🎯 IMMEDIATE ACTION REQUIRED:');
        console.log('1. Go to http://localhost:3000');
        console.log('2. Log in with: test@example.com / password123');
        console.log('3. Clear browser cache (Ctrl+Shift+Delete)');
        console.log('4. Refresh and try again');
        return;
    }
    
    // Step 2: Test API
    const apiData = await testAccountsAPI();
    
    if (!apiData) {
        console.log('\n🎯 API ISSUE DETECTED:');
        console.log('1. Check network connectivity');
        console.log('2. Verify backend is running on http://localhost:3001');
        console.log('3. Check browser console for CORS errors');
        return;
    }
    
    // Step 3: Test filtering
    const filteredAccounts = normalizeAccountFilter(apiData.data);
    
    if (filteredAccounts.length === 0) {
        console.log('\n🎯 FILTER ISSUE DETECTED:');
        console.log('All accounts are being filtered out by frontend logic');
        console.log('Raw account data:', apiData.data);
        
        // Show what each account looks like
        apiData.data.forEach((account, index) => {
            console.log(`\nAccount ${index + 1}: ${account.account_name}`);
            console.log('Properties:', Object.keys(account));
            console.log('Values:', account);
        });
    } else {
        console.log('\n✅ DIAGNOSTIC COMPLETE - ACCOUNTS SHOULD BE VISIBLE');
        console.log(`Found ${filteredAccounts.length} valid accounts:`);
        filteredAccounts.forEach((account, index) => {
            console.log(`   ${index + 1}. ${account.account_name} (${account.validation_status})`);
        });
    }
}

// ===========================================
// FIX 5: AUTO-FIX FUNCTION
// ===========================================

function applyAutoFix() {
    console.log('\n🔧 APPLYING AUTO-FIX');
    console.log('====================');
    
    // Clear any cached data that might be causing issues
    console.log('1. Clearing cached data...');
    
    // Clear any account-related cache
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('account') || key.includes('cache'))) {
            keysToRemove.push(key);
        }
    }
    
    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`   Removed: ${key}`);
    });
    
    // Force refresh of account data
    console.log('2. Forcing account data refresh...');
    
    // Dispatch a custom event to trigger account refresh
    window.dispatchEvent(new CustomEvent('forceAccountRefresh'));
    
    console.log('✅ Auto-fix applied. Please refresh the page.');
}

// ===========================================
// USAGE INSTRUCTIONS
// ===========================================

console.log(`
📋 USAGE INSTRUCTIONS:
===================

1. Open browser console (F12)
2. Run: runComprehensiveDiagnostic()
3. Follow the specific recommendations

Quick fixes:
- checkFrontendAuthentication() - Check if logged in
- testAccountsAPI() - Test API directly
- applyAutoFix() - Clear cache and refresh

If accounts still don't appear:
1. Log out and log back in
2. Clear all browser data
3. Use the debug tool: frontend-debug-auth.html
`);

// Export functions for global use
window.checkFrontendAuthentication = checkFrontendAuthentication;
window.testAccountsAPI = testAccountsAPI;
window.normalizeAccountFilter = normalizeAccountFilter;
window.runComprehensiveDiagnostic = runComprehensiveDiagnostic;
window.applyAutoFix = applyAutoFix;

// Auto-run diagnostic if this script is loaded
if (typeof window !== 'undefined') {
    console.log('🔍 Auto-running comprehensive diagnostic...');
    setTimeout(runComprehensiveDiagnostic, 1000);
}