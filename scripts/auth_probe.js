const axios = require('axios');
const baseUrl = 'http://localhost:5001';

async function main() {
  function log(...args) { console.log(...args); }
  const candidates = [
    { email: 'admin@test.com', password: 'admin123' },
    { email: 'test@example.com', password: 'password123' }
  ];
  let token = null;
  for (const c of candidates) {
    try {
      log('Attempting login:', c.email);
      const resp = await axios.post(`${baseUrl}/api/auth/login`, c);
      log('Login response:', JSON.stringify(resp.data));
      if (resp.data && resp.data.success && resp.data.data) {
        token = resp.data.data.token || resp.data.data.accessToken || null;
        if (token) { break; }
      }
    } catch (e) {
      log('Login error:', e.response ? JSON.stringify(e.response.data) : e.message);
    }
  }
  log('TOKEN_PREFIX:', token ? token.substring(0,20) : 'NONE');
  if (!token) return;

  try {
    const acc = await axios.get(`${baseUrl}/api/linkedin-accounts/available`, { headers: { Authorization: `Bearer ${token}` }});
    log('AVAILABLE:', JSON.stringify(acc.data));
  } catch (e) {
    log('AVAILABLE error:', e.response ? JSON.stringify(e.response.data) : e.message);
  }

  try {
    const me = await axios.get(`${baseUrl}/api/extension/auth/me`, { headers: { Authorization: `Bearer ${token}` }});
    log('EXT_ME:', JSON.stringify(me.data));
  } catch (e) {
    log('EXT_ME error:', e.response ? JSON.stringify(e.response.data) : e.message);
  }
}
main();
