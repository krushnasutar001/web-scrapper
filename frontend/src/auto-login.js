// Auto-login script to fix authentication issues
// This script will automatically log in the test user and set the token

const autoLogin = async () => {
  try {
    console.log('🔐 Auto-login: Checking current authentication status...');
    
    // Check if already logged in
    const existingToken = localStorage.getItem('token');
    if (existingToken) {
      console.log('✅ Token already exists, testing validity...');
      
      // Test if the token is valid by making a request to dashboard stats
      try {
        const response = await fetch('http://localhost:5001/api/dashboard/stats', {
          headers: {
            'Authorization': `Bearer ${existingToken}`
          }
        });
        
        if (response.ok) {
          console.log('✅ Existing token is valid, no need to re-login');
          return;
        } else {
          console.log('❌ Existing token is invalid, clearing and re-logging in...');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.log('❌ Error testing existing token, clearing and re-logging in...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    
    console.log('🔐 Logging in with test user credentials...');
    
    const response = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'testuser@example.com',
        password: 'password123'
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.data.accessToken) {
      // Store the token and user data
      localStorage.setItem('token', result.data.accessToken);
      localStorage.setItem('user', JSON.stringify(result.data.user));
      
      console.log('✅ Auto-login successful!');
      console.log('📊 User:', result.data.user.name, '(' + result.data.user.email + ')');
      
      // Test the dashboard endpoint
      const testResponse = await fetch('http://localhost:5001/api/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${result.data.accessToken}`
        }
      });
      
      if (testResponse.ok) {
        const dashboardData = await testResponse.json();
        console.log('✅ Dashboard API test successful:', dashboardData);
        
        // Refresh the page to apply the authentication
        console.log('🔄 Refreshing page to apply authentication...');
        window.location.reload();
      } else {
        console.error('❌ Dashboard API test failed:', testResponse.status, testResponse.statusText);
      }
    } else {
      console.error('❌ Auto-login failed:', result.error || result.message);
    }
  } catch (error) {
    console.error('❌ Auto-login error:', error);
  }
};

// Export for manual use
window.autoLogin = autoLogin;

// Auto-execute if not already authenticated
if (!localStorage.getItem('token')) {
  autoLogin();
} else {
  console.log('🔐 Token exists, testing validity...');
  autoLogin();
}