const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded data

// Add multer for handling multipart/form-data
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Configure multer for file uploads

// Mock JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'mock-jwt-secret-for-testing';

// Mock authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔐 Auth Debug - Header:', authHeader);
  console.log('🔐 Auth Debug - Token:', token);
  console.log('🔐 Auth Debug - JWT_SECRET:', JWT_SECRET);

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token decoded successfully:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Real LinkedIn accounts data (empty initially, populated from database)
const linkedinAccounts = [];

// Helper function to add account to in-memory storage (simulating database)
const addLinkedInAccount = (accountData) => {
  const newAccount = {
    id: uuidv4(),
    account_name: accountData.account_name,
    email: accountData.email,
    username: accountData.username || accountData.email,
    is_active: true,
    validation_status: 'ACTIVE',
    daily_request_limit: 150,
    requests_today: 0,
    last_request_at: null,
    cooldown_until: null,
    blocked_until: null,
    consecutive_failures: 0,
    created_at: new Date().toISOString()
  };
  
  linkedinAccounts.push(newAccount);
  console.log(`✅ Added LinkedIn account: ${newAccount.account_name} (${newAccount.email})`);
  return newAccount;
};

// Helper function to get display name for accounts
const getAccountDisplayName = (account) => {
  return `${account.account_name} (${account.email})`;
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Mock authentication - accept any email/password for testing
  if (email && password) {
    const token = jwt.sign(
      { id: 'mock-user-id', email: email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      data: {
        token: token,
        user: {
          id: 'mock-user-id',
          email: email,
          name: 'Test User'
        }
      }
    });
  } else {
    res.status(400).json({ error: 'Email and password required' });
  }
});

// Get available LinkedIn accounts
app.get('/api/linkedin-accounts/available', authenticateToken, (req, res) => {
  try {
    console.log('📋 Fetching available accounts for user:', req.user.id);
    
    // Filter accounts based on availability criteria
    const availableAccounts = linkedinAccounts.filter(account => {
      const now = new Date();
      const notBlocked = !(account.blocked_until && new Date(account.blocked_until) > now);
      const notCooldown = !(account.cooldown_until && new Date(account.cooldown_until) > now);
      
      if (!notBlocked || !notCooldown) return false;
      
      // Include ACTIVE accounts that can make requests
      if (account.validation_status === 'ACTIVE') {
        return account.is_active && account.requests_today < account.daily_request_limit;
      }
      
      // Include PENDING accounts that are active
      if (account.validation_status === 'PENDING') {
        return account.is_active;
      }
      
      return false;
    });
    
    // Add display names for frontend
    const accountsWithDisplayNames = availableAccounts.map(account => ({
      ...account,
      displayName: getAccountDisplayName(account)
    }));
    
    console.log(`✅ Found ${availableAccounts.length} available accounts`);
    if (availableAccounts.length > 0) {
      console.log('📋 Available accounts:', availableAccounts.map(acc => `${acc.account_name} (${acc.email})`));
    }
    
    res.json({
      success: true,
      data: accountsWithDisplayNames,
      total: accountsWithDisplayNames.length
    });
  } catch (error) {
    console.error('❌ Error fetching available accounts:', error);
    res.status(500).json({ error: 'Failed to fetch available accounts' });
  }
});

// Get all LinkedIn accounts
app.get('/api/linkedin-accounts', authenticateToken, (req, res) => {
  try {
    console.log('📋 Fetching all accounts for user:', req.user.id);
    
    // Add display names for frontend
    const accountsWithDisplayNames = linkedinAccounts.map(account => ({
      ...account,
      displayName: getAccountDisplayName(account)
    }));
    
    res.json({
      success: true,
      data: accountsWithDisplayNames,
      total: accountsWithDisplayNames.length
    });
  } catch (error) {
    console.error('❌ Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Add new LinkedIn account
app.post('/api/linkedin-accounts', authenticateToken, (req, res) => {
  try {
    const { account_name, email, username } = req.body;
    
    console.log('📋 Adding new LinkedIn account:', { account_name, email, username });
    
    // Validate required fields
    if (!account_name || !email) {
      return res.status(400).json({ 
        error: 'Account name and email are required',
        received: { account_name, email, username }
      });
    }
    
    // Check if account already exists
    const existingAccount = linkedinAccounts.find(acc => acc.email === email);
    if (existingAccount) {
      return res.status(400).json({ 
        error: 'Account with this email already exists',
        existing: existingAccount.account_name
      });
    }
    
    // Add the account
    const newAccount = addLinkedInAccount({ account_name, email, username });
    
    res.json({
      success: true,
      message: 'LinkedIn account added successfully',
      data: {
        ...newAccount,
        displayName: getAccountDisplayName(newAccount)
      }
    });
  } catch (error) {
    console.error('❌ Error adding LinkedIn account:', error);
    res.status(500).json({ error: 'Failed to add LinkedIn account' });
  }
});

// Real jobs data (empty initially, populated from database)
const jobs = [];

// Helper function to add job to in-memory storage (simulating database)
const addJob = (jobData) => {
  const newJob = {
    id: uuidv4(),
    type: jobData.type,
    query: jobData.query,
    maxResults: jobData.maxResults || 100,
    configuration: jobData.configuration || {},
    urlList: jobData.urlList || [],
    status: 'pending',
    resultCount: 0,
    progress: {
      totalUrls: jobData.urlList ? jobData.urlList.length : 0,
      processed: 0,
      successful: 0,
      failed: 0,
      pending: jobData.urlList ? jobData.urlList.length : 0
    },
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    resumedAt: null,
    error: null,
    userId: jobData.userId
  };
  
  jobs.push(newJob);
  console.log(`✅ Added job to database: ${newJob.query} (${newJob.progress.totalUrls} URLs)`);
  return newJob;
};

// Helper function to update job in storage
const updateJob = (jobId, updates) => {
  const jobIndex = jobs.findIndex(j => j.id === jobId);
  if (jobIndex !== -1) {
    jobs[jobIndex] = { ...jobs[jobIndex], ...updates };
    console.log(`📊 Updated job ${jobId}: status=${jobs[jobIndex].status}`);
    return jobs[jobIndex];
  }
  return null;
};

// Dashboard stats endpoint
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  try {
    // Calculate dashboard statistics from real jobs
    const totalJobs = jobs.length;
    const completedJobs = jobs.filter(job => job.status === 'completed').length;
    const runningJobs = jobs.filter(job => job.status === 'running').length;
    const pausedJobs = jobs.filter(job => job.status === 'paused').length;
    const failedJobs = jobs.filter(job => job.status === 'failed').length;
    const pendingJobs = jobs.filter(job => job.status === 'pending').length;
    
    // Calculate total results from all completed jobs
    const totalResults = jobs
      .filter(job => job.status === 'completed')
      .reduce((sum, job) => sum + (job.resultCount || 0), 0);
    
    // Calculate success rate
    const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
    
    // Get recent jobs (last 5) with proper date formatting
    const recentJobs = jobs
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(job => ({
        id: job.id,
        type: job.type,
        query: job.query,
        status: job.status,
        resultCount: job.resultCount || 0,
        urlCount: job.progress ? job.progress.totalUrls : 0,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      }));
    
    console.log('📊 Dashboard stats calculated from real data:', {
      totalJobs,
      completedJobs,
      runningJobs,
      pausedJobs,
      totalResults,
      successRate
    });
    
    res.json({
      success: true,
      data: {
        totalJobs: completedJobs, // Show completed jobs as requested
        activeJobs: runningJobs + pausedJobs, // Include paused jobs as active
        totalResults,
        successRate,
        pendingJobs,
        failedJobs,
        recentJobs
      }
    });
  } catch (error) {
    console.error('❌ Error calculating dashboard stats:', error);
    res.status(500).json({ error: 'Failed to calculate dashboard statistics' });
  }
});

// Jobs endpoints
app.get('/api/jobs', authenticateToken, (req, res) => {
  try {
    console.log('📋 Fetching jobs for user:', req.user.id);
    console.log(`📊 Found ${jobs.length} jobs in database`);
    
    // Return jobs with proper formatting
    const formattedJobs = jobs.map(job => ({
      ...job,
      // Ensure dates are properly formatted
      createdAt: job.createdAt || new Date().toISOString(),
      completedAt: job.completedAt || null,
      // Ensure progress is included
      progress: job.progress || {
        totalUrls: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        pending: 0
      }
    }));
    
    res.json({
      success: true,
      jobs: formattedJobs,
      total: formattedJobs.length
    });
  } catch (error) {
    console.error('❌ Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Enhanced job queue simulation
const jobQueue = [];
const processingJobs = new Map();
const pausedJobs = new Set();

// URL validation function
const validateURL = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('linkedin.com');
  } catch {
    return false;
  }
};

// Enhanced job processing with detailed progress tracking
const processJob = async (job) => {
  console.log(`🔄 Starting job processing: ${job.id}`);
  console.log(`📊 Job details: Type=${job.type}, Query=${job.query}, URLs=${job.urlList?.length || 0}`);
  
  // Update job status to running
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  job.progress = {
    totalUrls: job.urlList?.length || 0,
    processed: 0,
    successful: 0,
    failed: 0,
    pending: job.urlList?.length || 0
  };
  
  // Update job in database
  updateJob(job.id, job);
  
  console.log(`🚀 Worker picked up job ${job.id} - Processing ${job.progress.totalUrls} URLs`);
  
  // Process URLs one by one with realistic timing
  const processUrls = async () => {
    if (!job.urlList || job.urlList.length === 0) {
      console.log(`⚠️ No URLs to process for job ${job.id}`);
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
        resultCount: 0
      };
      updateJob(job.id, updates);
      processingJobs.delete(job.id);
      return;
    }
    
    for (let i = 0; i < job.urlList.length; i++) {
      // Check if job is paused
      if (pausedJobs.has(job.id)) {
        console.log(`⏸️ Job ${job.id} is paused, waiting...`);
        // Wait for resume (check every 2 seconds)
        while (pausedJobs.has(job.id)) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.log(`▶️ Job ${job.id} resumed`);
      }
      
      const url = job.urlList[i];
      console.log(`🔍 Processing URL ${i + 1}/${job.urlList.length}: ${url}`);
      
      // Simulate processing time per URL (1-3 seconds)
      const urlProcessingTime = Math.random() * 2000 + 1000;
      
      await new Promise(resolve => setTimeout(resolve, urlProcessingTime));
      
      // Simulate success/failure (85% success rate per URL)
      const isUrlSuccess = Math.random() > 0.15;
      
      if (isUrlSuccess) {
        job.progress.successful++;
        console.log(`✅ Successfully scraped: ${url}`);
      } else {
        job.progress.failed++;
        console.log(`❌ Failed to scrape: ${url}`);
      }
      
      job.progress.processed++;
      job.progress.pending = job.progress.totalUrls - job.progress.processed;
      job.resultCount = job.progress.successful;
      
      // Update job progress in database
      updateJob(job.id, {
        progress: job.progress,
        resultCount: job.resultCount
      });
      
      console.log(`📊 Progress: ${job.progress.processed}/${job.progress.totalUrls} (${job.progress.successful} success, ${job.progress.failed} failed)`);
    }
    
    // Job completed
    const completionUpdates = {
      status: 'completed',
      completedAt: new Date().toISOString(),
      progress: job.progress,
      resultCount: job.resultCount
    };
    
    updateJob(job.id, completionUpdates);
    
    console.log(`✅ Job ${job.id} completed: ${job.progress.successful}/${job.progress.totalUrls} URLs scraped successfully`);
    
    // Remove from processing queue
    processingJobs.delete(job.id);
  };
  
  // Start processing URLs
  processUrls().catch(error => {
    console.error(`❌ Job ${job.id} failed with error:`, error);
    
    const errorUpdates = {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error.message || 'Unknown error occurred'
    };
    
    updateJob(job.id, errorUpdates);
    processingJobs.delete(job.id);
  });
};

// Handle both JSON and FormData requests
app.post('/api/jobs', authenticateToken, upload.single('file'), (req, res) => {
  console.log('📋 Raw request body:', req.body);
  console.log('📋 Request file:', req.file);
  console.log('📋 Content-Type:', req.headers['content-type']);
  
  // Debug URL parsing
  console.log('📋 URLs field received:', {
    urls: req.body.urls,
    type: typeof req.body.urls,
    isArray: Array.isArray(req.body.urls),
    length: req.body.urls ? req.body.urls.length : 0
  });
  
  // Extract fields from both JSON and FormData
  const { 
    type, jobType,           // Backend expects 'type', frontend might send 'jobType'
    query, jobName,          // Backend expects 'query', frontend might send 'jobName'
    maxResults, maxPages,    // Backend expects 'maxResults', frontend might send 'maxPages'
    configuration,
    urls, searchQuery, accountSelectionMode, selectedAccountIds 
  } = req.body;
  
  // Map frontend fields to backend fields
  const mappedType = type || jobType;
  const mappedQuery = query || jobName || searchQuery;
  const mappedMaxResults = maxResults || maxPages || 100;
  
  console.log('📋 Extracted and mapped fields:', { 
    type: mappedType, 
    query: mappedQuery, 
    maxResults: mappedMaxResults,
    configuration, urls, accountSelectionMode, selectedAccountIds 
  });
  
  // Validate required fields using mapped values
  if (!mappedType || !mappedQuery) {
    return res.status(400).json({ 
      error: 'Job type and query are required',
      received: { type: mappedType, query: mappedQuery }
    });
  }
  
  // Extract and validate URLs
  let urlList = [];
  
  if (urls && Array.isArray(urls)) {
    urlList = urls;
  } else if (urls && typeof urls === 'string') {
    urlList = urls.split('\n').map(url => url.trim()).filter(Boolean);
  } else if (configuration && configuration.urls) {
    urlList = Array.isArray(configuration.urls) ? configuration.urls : [];
  }
  
  // Validate URLs
  const validUrls = [];
  const invalidUrls = [];
  
  urlList.forEach(url => {
    if (validateURL(url)) {
      validUrls.push(url);
    } else {
      invalidUrls.push(url);
    }
  });
  
  console.log(`📋 URL Validation: ${validUrls.length} valid, ${invalidUrls.length} invalid`);
  if (invalidUrls.length > 0) {
    console.log(`❌ Invalid URLs:`, invalidUrls);
  }
  
  // Create enhanced configuration object
  const jobConfig = {
    ...configuration,
    accountSelectionMode: accountSelectionMode || 'rotation',
    selectedAccountIds: selectedAccountIds || [],
    urls: validUrls,
    invalidUrls: invalidUrls,
    originalJobName: jobName,
    originalJobType: jobType,
    file: req.file ? req.file.filename : null
  };
  
  // Create job data
  const jobData = {
    type: mappedType,
    query: mappedQuery,
    maxResults: mappedMaxResults,
    configuration: jobConfig,
    urlList: validUrls,
    userId: req.user.id
  };
  
  console.log(`📋 Creating job with ${validUrls.length} valid URLs`);
  
  // Add job to database
  const newJob = addJob(jobData);
  
  // Add job to processing queue
  jobQueue.push(newJob);
  processingJobs.set(newJob.id, newJob);
  
  console.log('✅ Created new job:', {
    id: newJob.id,
    type: newJob.type,
    query: newJob.query,
    urlCount: newJob.progress.totalUrls,
    status: newJob.status
  });
  console.log('🚀 Starting job processing...');
  
  // Start processing the job immediately
  processJob(newJob);
  
  res.json({
    success: true,
    job: newJob
  });
});

// Job pause/resume endpoints
app.post('/api/jobs/:jobId/pause', authenticateToken, (req, res) => {
  const { jobId } = req.params;
  
  const job = jobs.find(j => j.id === jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (job.status !== 'running') {
    return res.status(400).json({ error: 'Job is not running' });
  }
  
  pausedJobs.add(jobId);
  const pausedAt = new Date().toISOString();
  
  updateJob(jobId, {
    status: 'paused',
    pausedAt: pausedAt
  });
  
  console.log(`⏸️ Job ${jobId} paused`);
  
  res.json({
    success: true,
    message: 'Job paused successfully',
    job: {
      id: jobId,
      status: 'paused',
      pausedAt: pausedAt
    }
  });
});

app.post('/api/jobs/:jobId/resume', authenticateToken, (req, res) => {
  const { jobId } = req.params;
  
  const job = jobs.find(j => j.id === jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (job.status !== 'paused') {
    return res.status(400).json({ error: 'Job is not paused' });
  }
  
  pausedJobs.delete(jobId);
  const resumedAt = new Date().toISOString();
  
  updateJob(jobId, {
    status: 'running',
    resumedAt: resumedAt
  });
  
  console.log(`▶️ Job ${jobId} resumed`);
  
  res.json({
    success: true,
    message: 'Job resumed successfully',
    job: {
      id: jobId,
      status: 'running',
      resumedAt: resumedAt
    }
  });
});

// Job status and progress endpoint
app.get('/api/jobs/:jobId/status', authenticateToken, (req, res) => {
  const { jobId } = req.params;
  
  const job = jobs.find(j => j.id === jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    success: true,
    job: {
      id: job.id,
      type: job.type,
      query: job.query,
      status: job.status,
      progress: job.progress || {
        totalUrls: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        pending: 0
      },
      resultCount: job.resultCount || 0,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      pausedAt: job.pausedAt,
      resumedAt: job.resumedAt,
      error: job.error
    }
  });
});

// Job download endpoint
app.get('/api/jobs/:jobId/download/:format', authenticateToken, (req, res) => {
  const { jobId, format } = req.params;
  
  // Find the job
  const job = jobs.find(j => j.id === jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job is not completed yet' });
  }
  
  // Generate mock CSV data
  const generateCSVData = () => {
    const headers = 'Name,Title,Company,LinkedIn URL,Email,Location\n';
    let csvData = headers;
    
    for (let i = 1; i <= job.resultCount; i++) {
      csvData += `Person ${i},${job.type === 'profile_scraping' ? 'Software Engineer' : 'Manager'},Company ${i},https://linkedin.com/in/person${i},person${i}@company${i}.com,"New York, NY"\n`;
    }
    
    return csvData;
  };
  
  // Generate mock JSON data
  const generateJSONData = () => {
    const results = [];
    for (let i = 1; i <= job.resultCount; i++) {
      results.push({
        id: i,
        name: `Person ${i}`,
        title: job.type === 'profile_scraping' ? 'Software Engineer' : 'Manager',
        company: `Company ${i}`,
        linkedinUrl: `https://linkedin.com/in/person${i}`,
        email: `person${i}@company${i}.com`,
        location: 'New York, NY',
        scrapedAt: new Date().toISOString()
      });
    }
    return results;
  };
  
  try {
    if (format === 'csv') {
      const csvData = generateCSVData();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${job.query}_results.csv"`);
      res.send(csvData);
    } else if (format === 'json') {
      const jsonData = generateJSONData();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${job.query}_results.json"`);
      res.json({
        success: true,
        job: {
          id: job.id,
          type: job.type,
          query: job.query,
          status: job.status,
          resultCount: job.resultCount,
          completedAt: job.completedAt
        },
        results: jsonData
      });
    } else if (format === 'excel') {
      // For Excel, we'll return CSV with Excel MIME type
      const csvData = generateCSVData();
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="${job.query}_results.xlsx"`);
      res.send(csvData);
    } else {
      res.status(400).json({ error: 'Invalid format. Supported formats: csv, json, excel' });
    }
    
    console.log(`📥 Downloaded ${format} results for job ${jobId} (${job.resultCount} results)`);
  } catch (error) {
    console.error('❌ Error generating download:', error);
    res.status(500).json({ error: 'Failed to generate download' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Simple LinkedIn Automation Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Available accounts: http://localhost:${PORT}/api/linkedin-accounts/available`);
});

module.exports = app;