/*
 * Probe: Detect accounts from extension flow
 * Logs in, posts mock account payload to detection endpoint,
 * then fetches available accounts to verify results.
 */

const axios = require('axios');

async function main() {
  const BASE = process.env.API_BASE_URL || 'http://localhost:5001';
  const adminCreds = { email: 'admin@test.com', password: 'admin123' };

  console.log('Logging in at:', `${BASE}/api/auth/login`);
  let token;
  try {
    const login = await axios.post(`${BASE}/api/auth/login`, adminCreds, {
      headers: { 'Content-Type': 'application/json' }
    });
    token = login.data?.data?.accessToken || login.data?.token;
    console.log('Token acquired:', token ? token.slice(0, 20) + '...' : 'NONE');
  } catch (err) {
    console.error('Login failed:', err.response?.data || err.message);
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${token}` };

  const payload = {
    accounts: [
      {
        name: 'Ext Test',
        email: 'ext.test@example.com',
        profileUrl: 'https://www.linkedin.com/in/ext-test/',
        cookies: [
          { name: 'li_at', value: 'dummy', domain: '.linkedin.com' }
        ],
        chromeProfileId: 'Profile 1',
        browserFingerprint: 'fp-123',
        sessionInfo: { ua: 'Chrome', ts: Date.now() }
      }
    ]
  };

  const detectUrl = `${BASE}/api/linkedin-accounts/detect-from-extension`;
  console.log('Posting detect payload to:', detectUrl);
  try {
    const resp = await axios.post(detectUrl, payload, { headers });
    console.log('Detect response:', JSON.stringify(resp.data));
  } catch (err) {
    console.error('Detect failed:', err.response?.status, err.response?.data || err.message);
  }

  try {
    const avail = await axios.get(`${BASE}/api/linkedin-accounts/available`, { headers });
    console.log('Available:', JSON.stringify(avail.data));
  } catch (err) {
    console.error('Available failed:', err.response?.status, err.response?.data || err.message);
  }
}

main().catch((e) => {
  console.error('Probe error:', e.message);
  process.exit(1);
});