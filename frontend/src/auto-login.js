// Auto-login script (disabled)
// This file previously auto-logged a test user.
// Per new requirements, auto-login is disabled and kept only for manual debugging.

const autoLogin = async () => {
  try {
    console.log('🔐 Auto-login is disabled. Invoke window.autoLogin() manually only for debugging.');
    
    // Intentionally do nothing. Manual credential-based login flow is now required.
  } catch (error) {
    console.error('❌ Auto-login (debug) error:', error);
  }
};

// Export for manual use
window.autoLogin = autoLogin;

// Do not auto-execute. Export for manual debugging only.
// window.autoLogin = autoLogin;