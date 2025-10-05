// Minimal mock backend server for the frontend
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoint should be registered before the 404 handler
app.get('/health', (req, res) => {
  ok(res, { status: 'OK' });
});

// In-memory mock storage
const state = {
  users: [{ id: 1, email: 'test@example.com' }],
  sessions: {}, // token -> user
  accounts: [{ id: 1, name: 'Test Account', status: 'active' }],
  linkedinAccounts: [{ id: 1, name: 'Test Account', status: 'active' }],
  jobs: [
    { id: 1, title: 'Profile Scraping', status: 'running' },
    { id: 2, title: 'Email Extraction', status: 'completed' }
  ]
};

// Helpers
function ok(res, data) { res.json(data); }
function err(res, code, message) { res.status(code).json({ error: message }); }
function genToken(email) { return `mock-token-${Buffer.from(email).toString('hex')}`; }
function getUserFromAuth(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : null;
  return token ? state.sessions[token] || null : null;
}

// Auth APIs
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 400, 'Email and password required');
  const token = genToken(email);
  // Find or create user for multi-user support
  let user = state.users.find(u => u.email === email);
  if (!user) {
    const nextId = state.users.length ? Math.max(...state.users.map(u => u.id)) + 1 : 1;
    user = { id: nextId, email };
    state.users.push(user);
  }
  state.sessions[token] = { id: user.id, email: user.email };
  ok(res, { success: true, token, user });
});

// Legacy/alias login endpoint used by some clients
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 400, 'Email and password required');
  const token = genToken(email);
  // Find or create user for multi-user support
  let user = state.users.find(u => u.email === email);
  if (!user) {
    const nextId = state.users.length ? Math.max(...state.users.map(u => u.id)) + 1 : 1;
    user = { id: nextId, email };
    state.users.push(user);
  }
  state.sessions[token] = { id: user.id, email: user.email };
  ok(res, { success: true, token, user });
});

app.post('/api/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 400, 'Email and password required');
  const exists = state.users.find(u => u.email === email);
  if (exists) return err(res, 400, 'User already exists');
  const newUser = { id: state.users.length + 1, email };
  state.users.push(newUser);
  ok(res, { success: true, user: newUser });
});

app.get('/api/me', (req, res) => {
  const user = getUserFromAuth(req);
  if (!user) return err(res, 401, 'Not authenticated');
  ok(res, { success: true, user });
});

// Alias used by frontend authAPI.getProfile()
app.get('/api/auth/me', (req, res) => {
  const user = getUserFromAuth(req);
  if (!user) return err(res, 401, 'Not authenticated');
  ok(res, { success: true, user });
});

// Logout endpoint to clear session
app.post('/api/auth/logout', (req, res) => {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : null;
  if (!token) return err(res, 400, 'Authorization token required');
  if (state.sessions[token]) {
    delete state.sessions[token];
  }
  ok(res, { success: true, message: 'Logged out' });
});

// Alias logout
app.post('/api/logout', (req, res) => {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : null;
  if (!token) return err(res, 400, 'Authorization token required');
  if (state.sessions[token]) {
    delete state.sessions[token];
  }
  ok(res, { success: true, message: 'Logged out' });
});

// Compatibility for extension auth check
app.get('/api/auth/verify', (req, res) => {
  const user = getUserFromAuth(req);
  if (!user) return err(res, 401, 'Not authenticated');
  ok(res, { success: true, user });
});

// Dashboard API
app.get('/api/dashboard/stats', (req, res) => {
  const completed = state.jobs.filter(j => j.status === 'completed').length;
  const running = state.jobs.filter(j => j.status === 'running').length;
  const queued = state.jobs.filter(j => j.status === 'queued' || j.status === 'pending').length;
  const failed = state.jobs.filter(j => j.status === 'failed').length;
  const stats = { completed, running, queued, failed };
  ok(res, { stats, recentJobs: state.jobs.slice(0, 5) });
});

// Fallback endpoints expected by frontend
app.get('/api/stats', (req, res) => {
  const completed = state.jobs.filter(j => j.status === 'completed').length;
  const running = state.jobs.filter(j => j.status === 'running').length;
  const queued = state.jobs.filter(j => j.status === 'queued' || j.status === 'pending').length;
  const failed = state.jobs.filter(j => j.status === 'failed').length;
  ok(res, { stats: { completed, running, queued, failed } });
});

app.get('/api/jobs/stats', (req, res) => {
  const completed = state.jobs.filter(j => j.status === 'completed').length;
  const running = state.jobs.filter(j => j.status === 'running').length;
  const queued = state.jobs.filter(j => j.status === 'queued' || j.status === 'pending').length;
  const failed = state.jobs.filter(j => j.status === 'failed').length;
  ok(res, { stats: { completed, running, queued, failed } });
});

// Jobs API
app.get('/api/jobs', (req, res) => {
  const user = getUserFromAuth(req);
  const limit = parseInt(req.query.limit || '0', 10);
  // Only return jobs that belong to the authenticated user in this mock
  const allJobs = Array.isArray(state.jobs) ? state.jobs : [];
  const userJobs = user ? allJobs.filter(j => j.userId === user.id) : [];
  const data = userJobs.slice(0, limit > 0 ? limit : userJobs.length);
  ok(res, data);
});

// Create job (JSON payload)
app.post('/api/jobs', (req, res) => {
  const user = getUserFromAuth(req);
  if (!user) return err(res, 401, 'Not authenticated');
  const { jobType, jobName, searchQuery, urls } = req.body || {};
  const nextId = state.jobs.length ? Math.max(...state.jobs.map(j => j.id)) + 1 : 1;
  const newJob = {
    id: nextId,
    job_name: jobName || searchQuery || `Job ${nextId}`,
    type: jobType || 'search',
    status: 'queued',
    userId: user.id,
    created_at: new Date().toISOString(),
    urls: Array.isArray(urls) ? urls : [],
    resultCount: 0
  };
  // Add to top so it appears first
  state.jobs.unshift(newJob);
  ok(res, { success: true, job: newJob });
});

// Cancel job
app.post('/api/jobs/:id/cancel', (req, res) => {
  const user = getUserFromAuth(req);
  if (!user) return err(res, 401, 'Not authenticated');
  const id = parseInt(req.params.id, 10);
  const idx = state.jobs.findIndex(j => j.id === id && j.userId === user.id);
  if (idx === -1) return err(res, 404, 'Job not found');
  state.jobs[idx].status = 'cancelled';
  ok(res, { success: true, message: 'Job cancelled successfully', job: state.jobs[idx] });
});

// LinkedIn Accounts API
app.get('/api/linkedin-accounts', (req, res) => {
  ok(res, state.linkedinAccounts);
});

app.get('/api/linkedin-accounts/stats', (req, res) => {
  const total = state.linkedinAccounts.length;
  const active = state.linkedinAccounts.filter(a => a.status === 'active').length;
  const blocked = state.linkedinAccounts.filter(a => a.status === 'blocked').length;
  ok(res, { total, active, blocked });
});

// Sync endpoint used by extension/frontend to push detected account info
app.post('/api/linkedin-accounts/sync', (req, res) => {
  const { accountInfo } = req.body || {};
  if (!accountInfo || !accountInfo.profileId) {
    return err(res, 400, 'Invalid accountInfo payload');
  }
  const existingIndex = state.linkedinAccounts.findIndex(a => a.id === accountInfo.profileId);
  const payload = {
    id: accountInfo.profileId,
    name: accountInfo.name || 'Unknown',
    email: accountInfo.email || `${accountInfo.profileId}@example.com`,
    status: 'active',
    profileUrl: accountInfo.profileUrl,
    lastDetected: accountInfo.lastDetected || Date.now(),
  };
  if (existingIndex >= 0) {
    state.linkedinAccounts[existingIndex] = { ...state.linkedinAccounts[existingIndex], ...payload };
  } else {
    state.linkedinAccounts.unshift(payload);
  }
  ok(res, { success: true, synced: payload.id });
});

// Accounts API
app.get('/api/accounts', (req, res) => {
  ok(res, state.accounts);
});

app.post('/api/accounts', (req, res) => {
  const { name, status } = req.body || {};
  if (!name) return err(res, 400, 'Account name required');
  const acc = { id: state.accounts.length ? Math.max(...state.accounts.map(a => a.id)) + 1 : 1, name, status: status || 'active' };
  state.accounts.push(acc);
  ok(res, { success: true, account: acc });
});

app.delete('/api/accounts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = state.accounts.findIndex(a => a.id === id);
  if (idx === -1) return err(res, 404, 'Account not found');
  state.accounts.splice(idx, 1);
  ok(res, { success: true });
});

// 404 handler
app.use((req, res) => err(res, 404, 'Not Found'));

// Start
app.listen(PORT, () => {
  console.log(`Mock backend running on http://localhost:${PORT}`);
});