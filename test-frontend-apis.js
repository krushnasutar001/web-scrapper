const axios = require('axios');

async function run() {
  console.log('🧪 Frontend API proxy tests');
  const tests = [];

  async function test(name, fn) {
    try {
      const res = await fn();
      console.log(`✅ ${name}:`, res.status || res.statusCode || 200);
      if (res.data) {
        console.log(JSON.stringify(res.data).slice(0, 300));
      }
    } catch (e) {
      const status = e.response?.status;
      const data = e.response?.data || e.message;
      console.log(`❌ ${name}:`, status || 'error');
      console.log(data);
    }
  }

  // Health via backend direct
  tests.push(test('Backend /health (5001)', () => axios.get('http://localhost:5001/health')));

  // Login via backend direct
  tests.push(test('Backend /api/auth/login (5001)', () => axios.post('http://localhost:5001/api/auth/login', {
    email: 'admin@test.com',
    password: 'admin123',
  })));

  // Login via frontend dev servers proxy
  tests.push(test('Proxy 3021 /api/auth/login', () => axios.post('http://localhost:3021/api/auth/login', {
    email: 'admin@test.com',
    password: 'admin123',
  })));
  tests.push(test('Proxy 3022 /api/auth/login', () => axios.post('http://localhost:3022/api/auth/login', {
    email: 'admin@test.com',
    password: 'admin123',
  })));

  await Promise.all(tests);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});