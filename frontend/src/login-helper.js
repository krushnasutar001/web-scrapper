// Helper script to automatically log in with test user credentials
// Run this in the browser console on http://localhost:3000

const loginWithTestUser = async () => {
  try {
    console.log('🔐 Logging in with test user...');
    
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
    
    if (result.success) {
      // Store the token and user data
      localStorage.setItem('token', result.data.accessToken);
      localStorage.setItem('user', JSON.stringify(result.data.user));
      
      console.log('✅ Login successful! Refreshing page...');
      
      // Refresh the page to apply the authentication
      window.location.reload();
    } else {
      console.error('❌ Login failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Login error:', error);
  }
};

// Auto-execute the login
loginWithTestUser();