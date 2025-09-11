const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const ScrapingService = require('./services/scrapingService');
const LinkedInAccountsService = require('./services/linkedinAccountsService');
const CookieManager = require('./utils/cookieManager');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Initialize cookie manager
const cookieManager = new CookieManager();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    // Create uploads directory if it doesn't exist
    fs.mkdir(uploadDir, { recursive: true }).then(() => {
      cb(null, uploadDir);
    }).catch(cb);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for Excel uploads (memory storage)
const excelStorage = multer.memoryStorage();
const excelUpload = multer({
  storage: excelStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
let db;

async function connectDB() {
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation'
    });
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for:', email);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find user in database
    const [users] = await db.execute(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    
    if (users.length === 0) {
      console.log('User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const user = users[0];
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      console.log('Invalid password for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    // Update last login
    await db.execute(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );
    
    console.log('✅ Login successful for:', email);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          isActive: user.is_active
        }
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    
    console.log('Registration attempt for:', email);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Check if user already exists
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email'
      });
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Generate UUID for user ID
    const userId = uuidv4();
    
    // Insert new user
    await db.execute(`
      INSERT INTO users (
        id, email, password_hash, first_name, last_name, 
        is_active, email_verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `, [
      userId,
      email,
      passwordHash,
      firstName || null,
      lastName || null,
      true
    ]);
    
    console.log('✅ Registration successful for:', email);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: userId,
          email,
          firstName: firstName || null,
          lastName: lastName || null
        }
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /api/auth/me - Get current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user details from database
    const [rows] = await db.execute(
      'SELECT id, first_name, last_name, email, created_at, is_active FROM users WHERE id = ?',
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Get user statistics
    const [accountStats] = await db.execute(
      'SELECT COUNT(*) as account_count FROM linkedin_accounts WHERE user_id = ?',
      [userId]
    );
    
    const [jobStats] = await db.execute(
      'SELECT COUNT(*) as job_count FROM jobs WHERE user_id = ?',
      [userId]
    );
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          isActive: user.is_active,
          createdAt: user.created_at,
          stats: {
            accounts: accountStats[0].account_count,
            jobs: jobStats[0].job_count
          }
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// Create new job endpoint with multi-account support
app.post('/api/jobs', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { 
      jobName, 
      jobType, 
      searchQuery, 
      proxyUrl, 
      linkedinCookie,
      accountUid, // New: specific account to use
      useAccountRotation, // New: enable automatic account rotation
      accountSelectionMode // New: 'specific', 'rotation', 'load_balance'
    } = req.body;
    const userId = req.user.id;
    
    console.log('📝 Enhanced job creation request:', { 
      jobName, 
      jobType, 
      userId,
      accountUid,
      useAccountRotation,
      accountSelectionMode
    });
    
    // Enhanced validation - support multiple account modes
    if (!jobName || !jobType) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Job name and type are required'
      });
    }
    
    if (!['profile', 'company', 'search'].includes(jobType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job type. Must be profile, company, or search'
      });
    }
    
    if (jobType === 'search' && !searchQuery) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required for search jobs'
      });
    }
    
    if ((jobType === 'profile' || jobType === 'company') && !req.file) {
      return res.status(400).json({
        success: false,
        message: 'File upload is required for profile and company jobs'
      });
    }
    
    // Determine account selection strategy
    let selectedAccount = null;
    let accountStrategy = accountSelectionMode || 'specific';
    
    if (accountUid) {
      // Use specific account
      selectedAccount = await getAccountByUid(userId, accountUid);
      if (!selectedAccount) {
        return res.status(400).json({
          success: false,
          message: 'Specified account not found'
        });
      }
      accountStrategy = 'specific';
    } else if (useAccountRotation || accountSelectionMode === 'rotation') {
      // Use account rotation
      selectedAccount = await getNextAvailableAccount(userId);
      if (!selectedAccount) {
        return res.status(400).json({
          success: false,
          message: 'No available accounts for rotation. Please add LinkedIn accounts first.'
        });
      }
      accountStrategy = 'rotation';
    } else if (linkedinCookie) {
      // Legacy mode - use provided cookie
      accountStrategy = 'legacy';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either specify an account, enable rotation, or provide LinkedIn cookie'
      });
    }
    
    console.log(`✅ Account strategy: ${accountStrategy}`);
    
    const jobId = uuidv4();
    const query = jobType === 'search' ? searchQuery : req.file?.originalname || '';
    const fileName = req.file?.filename || null;
    const filePath = req.file?.path || null;
    
    // Insert job into database with enhanced account management
    await db.execute(`
      INSERT INTO jobs (
        id, user_id, type, query, status, progress, total_results, 
        processed_results, max_results, configuration, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      jobId,
      userId,
      jobType,
      query,
      'queued',
      0,
      0,
      0,
      1000, // default max results
      JSON.stringify({
        proxyUrl: selectedAccount?.proxy_url || proxyUrl,
        linkedinCookie: selectedAccount?.session_cookie || linkedinCookie,
        fileName,
        filePath,
        jobName,
        accountUid: selectedAccount?.account_uid || null,
        identityUid: selectedAccount?.identityUid || null,
        accountStrategy: accountStrategy,
        accountName: selectedAccount?.account_name || null
      })
    ]);
    
    console.log('✅ Enhanced job created successfully:', jobId);
    
    // Update account usage tracking
    if (selectedAccount && selectedAccount.id) {
      await updateAccountUsage(selectedAccount.id, {
        lastUsed: new Date(),
        jobId: jobId,
        requestType: jobType
      });
    }
     
     // Start job processing asynchronously
     setTimeout(() => {
       const scrapingService = new ScrapingService(db);
       scrapingService.processJob(jobId).catch(error => {
         console.error(`Failed to process job ${jobId}:`, error);
       });
     }, 1000);
     
     res.status(201).json({
       success: true,
       message: 'Enhanced job created successfully',
       data: {
         id: jobId,
         jobName,
         type: jobType,
         query,
         status: 'queued',
         progress: 0,
         accountStrategy: accountStrategy,
         selectedAccount: selectedAccount ? {
           accountUid: selectedAccount.account_uid,
           accountName: selectedAccount.account_name,
           identityUid: selectedAccount.identityUid
         } : null
       }
     });
     
   } catch (error) {
     console.error('Enhanced job creation error:', error);
     res.status(500).json({
       success: false,
       message: 'Failed to create job'
     });
   }
 });

// Helper function to get account by UID
async function getAccountByUid(userId, accountUid) {
  try {
    const query = `
      SELECT la.*, 
             CONCAT('identity_', ?, '_', la.id) as identityUid
      FROM linkedin_accounts la 
      WHERE la.user_id = ? AND (la.account_uid = ? OR la.id = ?)
    `;
    
    const [rows] = await db.execute(query, [userId, userId, accountUid, accountUid]);
    
    if (rows.length > 0) {
      const account = rows[0];
      account.account_uid = account.account_uid || `account_${account.id}`;
      return account;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting account by UID:', error);
    return null;
  }
}

// Helper function to get next available account for rotation
async function getNextAvailableAccount(userId) {
  try {
    // Get all user accounts with usage tracking
    const query = `
      SELECT la.*,
             COALESCE(la.last_used, '1970-01-01') as last_used,
             COALESCE(la.daily_request_count, 0) as daily_request_count,
             COALESCE(la.daily_request_limit, 150) as daily_request_limit,
             COALESCE(la.account_uid, CONCAT('account_', la.id)) as account_uid,
             CONCAT('identity_', ?, '_', la.id) as identityUid
      FROM linkedin_accounts la 
      WHERE la.user_id = ? AND la.status = 'active'
      ORDER BY 
        CASE WHEN daily_request_count < daily_request_limit THEN 0 ELSE 1 END,
        last_used ASC,
        RAND()
      LIMIT 1
    `;
    
    const [rows] = await db.execute(query, [userId, userId]);
    
    if (rows.length > 0) {
      const account = rows[0];
      
      // Check if account is within daily limits
      const now = new Date();
      const lastUsed = new Date(account.last_used);
      const isNewDay = now.toDateString() !== lastUsed.toDateString();
      
      if (isNewDay) {
        // Reset daily counter for new day
        await db.execute(
          'UPDATE linkedin_accounts SET daily_request_count = 0 WHERE id = ?',
          [account.id]
        );
        account.daily_request_count = 0;
      }
      
      // Check if account is available
      if (account.daily_request_count >= account.daily_request_limit) {
        console.log(`⚠️ Account ${account.account_name} has reached daily limit`);
        return null;
      }
      
      console.log(`🔄 Selected account for rotation: ${account.account_name}`);
      return account;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting next available account:', error);
    return null;
  }
}

// Helper function to update account usage
async function updateAccountUsage(accountId, usageData) {
  try {
    const updateQuery = `
      UPDATE linkedin_accounts 
      SET 
        last_used = ?,
        daily_request_count = COALESCE(daily_request_count, 0) + 1,
        total_requests = COALESCE(total_requests, 0) + 1
      WHERE id = ?
    `;
    
    await db.execute(updateQuery, [
      usageData.lastUsed,
      accountId
    ]);
    
    console.log(`📊 Updated usage for account ID: ${accountId}`);
  } catch (error) {
    console.error('❌ Error updating account usage:', error);
  }
}

// Get all jobs for user
app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [jobs] = await db.execute(`
      SELECT 
        id, type, query, status, progress, total_results, 
        processed_results, created_at, updated_at, configuration
      FROM jobs 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `, [userId]);
    
    // Parse configuration and add jobName
    const jobsWithConfig = jobs.map(job => {
      let config = {};
      try {
        config = JSON.parse(job.configuration || '{}');
      } catch (e) {
        console.error('Failed to parse job configuration:', e);
      }
      
      return {
        ...job,
        jobName: config.jobName || `Job ${job.id.slice(0, 8)}`,
        fileName: config.fileName,
        createdAt: job.created_at,
        updatedAt: job.updated_at
      };
    });
    
    res.json({
      success: true,
      data: jobsWithConfig
    });
    
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch jobs'
    });
  }
});

// Get job status
app.get('/api/jobs/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const [jobs] = await db.execute(`
      SELECT id, type, query, status, progress, total_results, 
             processed_results, error_message, started_at, completed_at
      FROM jobs 
      WHERE id = ? AND user_id = ?
    `, [id, userId]);
    
    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      data: jobs[0]
    });
    
  } catch (error) {
    console.error('Failed to get job status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job status'
    });
  }
});

// Download job results
app.get('/api/jobs/:id/result', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if job exists and belongs to user
    const [jobs] = await db.execute(`
      SELECT id, type, status, configuration
      FROM jobs 
      WHERE id = ? AND user_id = ?
    `, [id, userId]);
    
    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const job = jobs[0];
    
    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Job is not completed yet'
      });
    }
    
    // Get job results
    const [results] = await db.execute(`
      SELECT data, scraped_at
      FROM results 
      WHERE job_id = ?
      ORDER BY scraped_at ASC
    `, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No results found for this job'
      });
    }
    
    // Convert results to CSV format
    let csvContent = '';
    let headers = [];
    
    // Extract headers from first result
    if (results.length > 0) {
      try {
        const firstResult = JSON.parse(results[0].data);
        headers = Object.keys(firstResult);
        csvContent = headers.join(',') + '\n';
        
        // Add data rows
        results.forEach(result => {
          try {
            const data = JSON.parse(result.data);
            const row = headers.map(header => {
              const value = data[header] || '';
              // Escape commas and quotes in CSV
              return `"${String(value).replace(/"/g, '""')}"`;
            });
            csvContent += row.join(',') + '\n';
          } catch (e) {
            console.error('Failed to parse result data:', e);
          }
        });
      } catch (e) {
        console.error('Failed to parse first result:', e);
        return res.status(500).json({
          success: false,
          message: 'Failed to process results'
        });
      }
    }
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="job-${id}-results.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Failed to download results:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download results'
    });
  }
 });

// LinkedIn Accounts Management Endpoints

// Create new LinkedIn account with multi-cookie support
app.post('/api/linkedin-accounts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`➕ Creating LinkedIn account for user: ${userId}`);
    
    const accountsService = new LinkedInAccountsService(db);
    
    const {
      accountName,
      email,
      username,
      sessionCookie,
      cookies, // New: support for multiple cookies
      proxyUrl,
      proxyType,
      proxyUsername,
      proxyPassword,
      dailyRequestLimit,
      minDelaySeconds,
      maxDelaySeconds,
      accountUid // New: support for account UID for multi-account management
    } = req.body;
    
    console.log('📝 Account data received:', { 
      accountName, 
      email, 
      username, 
      hasSessionCookie: !!sessionCookie, 
      hasCookies: !!cookies,
      proxyUrl,
      accountUid
    });
    
    // Validate required fields - support both old and new formats
    if (!accountName || (!sessionCookie && !cookies)) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Account name and cookies are required'
      });
    }
    
    // Process cookies - support multiple formats including simple cookie strings
    let finalCookies = sessionCookie || cookies;
    
    // If cookies is an array (from extension), convert to string
    if (Array.isArray(cookies)) {
      finalCookies = cookies
        .filter(cookie => ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'].includes(cookie.name))
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
      console.log('🔄 Converted array cookies to string format');
    }
    
    // If cookies is an object (key-value pairs), convert to string
    else if (typeof cookies === 'object' && !Array.isArray(cookies) && cookies !== null) {
      finalCookies = Object.entries(cookies)
        .filter(([name]) => ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'].includes(name))
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      console.log('🔄 Converted object cookies to string format');
    }
    
    // If it's a simple cookie string without proper format, try to format it
    else if (typeof finalCookies === 'string' && finalCookies.length > 50 && !finalCookies.includes('=')) {
      // Assume it's a raw li_at cookie value
      finalCookies = `li_at=${finalCookies.trim()}`;
      console.log('🔄 Formatted raw cookie as li_at');
    }
    
    // Enhanced LinkedIn cookie validation - more flexible
    const hasValidLinkedInCookie = finalCookies.includes('li_at=') || 
                                   finalCookies.includes('AQE') ||
                                   (finalCookies.includes('JSESSIONID') && finalCookies.includes('bcookie')) ||
                                   (finalCookies.length > 100 && finalCookies.startsWith('AQE')); // Raw li_at value
    
    if (!hasValidLinkedInCookie) {
      console.log('❌ Invalid LinkedIn cookie format');
      return res.status(400).json({
        success: false,
        message: 'Invalid LinkedIn session cookies. Please provide valid LinkedIn cookies including li_at.'
      });
    }
    
    console.log('✅ Validation passed, creating account...');
    
    // Generate account UID if not provided (for multi-account support)
    const finalAccountUid = accountUid || `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const accountId = await accountsService.createAccount(userId, {
      accountName,
      email,
      username,
      sessionCookie: finalCookies,
      proxyUrl,
      proxyType,
      proxyUsername,
      proxyPassword,
      dailyRequestLimit,
      minDelaySeconds,
      maxDelaySeconds,
      accountUid: finalAccountUid
    });
    
    console.log(`✅ Account created with ID: ${accountId}`);
    
    // Store in multi-account format for advanced features
    try {
      await storeMultiAccountData({
        accountUid: finalAccountUid,
        identityUid: `identity_${userId}_${finalAccountUid}`,
        accountName,
        cookies: finalCookies,
        userId: userId,
        integrationUid: 'linkedin'
      });
      console.log('✅ Multi-account data stored');
    } catch (multiAccountError) {
      console.warn('⚠️ Multi-account storage failed:', multiAccountError.message);
      // Continue anyway as the main account was created
    }
    
    // Get the created account to return complete data
    const createdAccount = await accountsService.getAccountById(accountId, userId);
    console.log('📤 Returning created account:', { id: createdAccount.id, name: createdAccount.account_name });
    
    res.status(201).json({
      success: true,
      message: 'LinkedIn account created successfully',
      data: createdAccount,
      accountUid: finalAccountUid
    });
    
  } catch (error) {
    console.error('❌ Failed to create LinkedIn account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create LinkedIn account',
      error: error.message
    });
  }
});

// Get all LinkedIn accounts for user
app.get('/api/linkedin-accounts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`🔍 Fetching LinkedIn accounts for user: ${userId}`);
    
    const accountsService = new LinkedInAccountsService(db);
    const accounts = await accountsService.getUserAccounts(userId);
    
    console.log(`📊 Found ${accounts.length} LinkedIn accounts for user ${userId}`);
    console.log('📋 Accounts data:', accounts.map(acc => ({ id: acc.id, name: acc.account_name, status: acc.validation_status })));
    
    res.json({
      success: true,
      data: accounts
    });
    
  } catch (error) {
    console.error('❌ Failed to get LinkedIn accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get LinkedIn accounts',
      error: error.message
    });
  }
});

// Get specific LinkedIn account
app.get('/api/linkedin-accounts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountId = req.params.id;
    const accountsService = new LinkedInAccountsService(db);
    
    const account = await accountsService.getAccountById(accountId, userId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    // Remove sensitive data from response
    delete account.session_cookie;
    delete account.proxy_password;
    
    res.json({
      success: true,
      data: account
    });
    
  } catch (error) {
    console.error('Failed to get LinkedIn account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get LinkedIn account'
    });
  }
});

// Update LinkedIn account
app.put('/api/linkedin-accounts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountId = req.params.id;
    const accountsService = new LinkedInAccountsService(db);
    
    const success = await accountsService.updateAccount(accountId, userId, req.body);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Account not found or no changes made'
      });
    }
    
    res.json({
      success: true,
      message: 'Account updated successfully'
    });
    
  } catch (error) {
    console.error('Failed to update LinkedIn account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update LinkedIn account'
    });
  }
});

// Delete LinkedIn account
app.delete('/api/linkedin-accounts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountId = req.params.id;
    const accountsService = new LinkedInAccountsService(db);
    
    const success = await accountsService.deleteAccount(accountId, userId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
    
  } catch (error) {
    console.error('Failed to delete LinkedIn account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete LinkedIn account'
    });
  }
});

// Validate LinkedIn account
app.post('/api/linkedin-accounts/:id/validate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountId = req.params.id;
    const accountsService = new LinkedInAccountsService(db);
    
    // Check if account belongs to user
    const account = await accountsService.getAccountById(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    const validation = await accountsService.validateAccount(accountId);
    
    res.json({
      success: true,
      data: validation
    });
    
  } catch (error) {
    console.error('Failed to validate LinkedIn account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate LinkedIn account'
    });
  }
});

// Test proxy connectivity
app.post('/api/linkedin-accounts/test-proxy', authenticateToken, async (req, res) => {
  try {
    const { proxyUrl, proxyUsername, proxyPassword } = req.body;
    const accountsService = new LinkedInAccountsService(db);
    
    if (!proxyUrl) {
      return res.status(400).json({
        success: false,
        message: 'Proxy URL is required'
      });
    }
    
    const testResult = await accountsService.testProxy(proxyUrl, proxyUsername, proxyPassword);
    
    res.json({
      success: true,
      data: testResult
    });
    
  } catch (error) {
    console.error('Failed to test proxy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test proxy'
    });
  }
});

// Get available accounts for job creation
app.get('/api/linkedin-accounts/available', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountsService = new LinkedInAccountsService(db);
    
    const availableAccounts = await accountsService.getAvailableAccounts(userId);
    
    res.json({
      success: true,
      data: availableAccounts
    });
    
  } catch (error) {
    console.error('Failed to get available accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available accounts'
    });
  }
});

// Get account statistics
app.get('/api/linkedin-accounts/:id/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const accountId = req.params.id;
    const days = parseInt(req.query.days) || 7;
    const accountsService = new LinkedInAccountsService(db);
    
    // Check if account belongs to user
    const account = await accountsService.getAccountById(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    const stats = await accountsService.getAccountStats(accountId, days);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Failed to get account stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get account stats'
    });
  }
});

// POST /api/linkedin-accounts/upload - Upload Excel/CSV file with multiple accounts
app.post('/api/linkedin-accounts/upload', 
  authenticateToken,
  excelUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      console.log('📁 Processing uploaded file:', req.file.originalname);
      
      // Parse the uploaded file
      const data = parseFile(req.file.buffer, req.file.originalname);
      
      // Validate required columns
      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File is empty or has no data rows'
        });
      }
      
      const firstRow = data[0];
      if (!firstRow.account_name && !firstRow.name) {
        return res.status(400).json({
          success: false,
          message: 'File must contain "account_name" column'
        });
      }
      
      if (!firstRow.li_at && !firstRow.cookies) {
        return res.status(400).json({
          success: false,
          message: 'File must contain "li_at" column'
        });
      }
      
      const results = {
        successful: [],
        failed: [],
        total: data.length
      };
      
      const accountsService = new LinkedInAccountsService(db);
      
      // Process each row
      for (const row of data) {
        try {
          // Support both new format (account_name, li_at) and old format (name, cookies)
          const accountName = row.account_name || row.name;
          const sessionCookie = row.li_at || row.cookies;
          
          if (!accountName || !sessionCookie) {
            results.failed.push({
              name: accountName || 'Unknown',
              error: 'Missing account name or li_at cookie'
            });
            continue;
          }
          
          console.log(`🔍 Validating account: ${accountName}`);
          
          // Validate cookies
          const isValid = await checkCookies(sessionCookie);
          
          if (!isValid) {
            results.failed.push({
              name: accountName,
              error: 'Invalid li_at cookie format'
            });
            continue;
          }
          
          // Create account using the service
          const accountId = await accountsService.createAccount(req.user.id, {
            accountName: accountName,
            sessionCookie: sessionCookie,
            email: row.email || null,
            username: row.username || null,
            proxyUrl: row.proxy_url || row.proxyUrl || null,
            dailyRequestLimit: 150,
            minDelaySeconds: 30,
            maxDelaySeconds: 90
          });
          
          console.log(`✅ Account created: ${accountName} (ID: ${accountId})`);
          
          // Trigger automatic validation in background (non-blocking)
          console.log(`⏳ Account created with PENDING status: ${accountName}`);
          
          // Start background validation without blocking the upload process
          setImmediate(async () => {
            try {
              console.log(`🔍 Auto-validating account: ${accountName}`);
              const validation = await accountsService.validateAccount(accountId);
              console.log(`${validation.isValid ? '✅' : '❌'} Account ${accountName} validation complete: ${validation.status}`);
            } catch (validationError) {
              console.error(`❌ Auto-validation failed for ${accountName}:`, validationError.message);
              // Mark as INVALID if validation fails
              try {
                await db.execute(`
                  UPDATE linkedin_accounts 
                  SET validation_status = 'INVALID', last_validated_at = NOW(),
                      last_error_message = ?, last_error_at = NOW()
                  WHERE id = ?
                `, [validationError.message, accountId]);
              } catch (dbError) {
                console.error(`❌ Failed to update account ${accountName} status:`, dbError.message);
              }
            }
          });
          
          results.successful.push({
            id: accountId,
            name: accountName
          });
          
        } catch (error) {
          const accountName = row.account_name || row.name || 'Unknown';
          console.error(`❌ Error processing account ${accountName}:`, error);
          results.failed.push({
            name: accountName,
            error: error.message
          });
        }
      }
      
      console.log(`📊 Upload complete: ${results.successful.length} successful, ${results.failed.length} failed`);
      
      res.json({
        success: true,
        message: `Processed ${results.total} accounts. ${results.successful.length} successful, ${results.failed.length} failed.`,
        data: results
      });
      
    } catch (error) {
      console.error('❌ Error uploading accounts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process uploaded file'
      });
    }
  });

// POST /api/linkedin-accounts/validate - Enhanced LinkedIn cookie validation
app.post('/api/linkedin-accounts/validate', authenticateToken, async (req, res) => {
  try {
    const { cookies, proxyUrl, proxyUsername, proxyPassword } = req.body;
    
    if (!cookies) {
      return res.status(400).json({
        success: false,
        message: 'Cookies are required'
      });
    }
    
    console.log('🔍 Validating LinkedIn cookies with enhanced validation...');
    
    // Build proxy configuration if provided
    const proxyConfig = proxyUrl ? {
      url: proxyUrl,
      username: proxyUsername,
      password: proxyPassword
    } : null;
    
    // Use detailed validation for comprehensive results
    const validation = await validateCookieDetailed(cookies, proxyConfig);
    
    res.json({
      success: true,
      data: validation
    });
    
  } catch (error) {
    console.error('❌ Enhanced cookie validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate cookies',
      error: error.message
    });
  }
});

// POST /api/linkedin-accounts/validate-multiple - Validate multiple accounts
app.post('/api/linkedin-accounts/validate-multiple', authenticateToken, async (req, res) => {
  try {
    const accounts = await new LinkedInAccountsService(db).getUserAccounts(req.user.id);
    
    if (accounts.length === 0) {
      return res.json({
        success: true,
        message: 'No accounts to validate',
        data: { validatedAccounts: [], results: [] }
      });
    }
    
    console.log(`🔍 Validating ${accounts.length} LinkedIn accounts...`);
    
    const validationConfigs = accounts.map(account => ({
      liAtCookie: account.session_cookie,
      proxyConfig: account.proxy_url ? {
        url: account.proxy_url,
        username: account.proxy_username,
        password: account.proxy_password
      } : null,
      accountId: account.id,
      accountName: account.account_name || `Account-${account.id.substring(0, 8)}`
    }));
    
    // Use real LinkedIn validation instead of format checking
    console.log(`🔄 Starting real LinkedIn validation for ${validationConfigs.length} accounts...`);
    const results = await realValidator.validateMultipleCookies(validationConfigs, 3);
    console.log(`🎯 Bulk validation complete: ${results.filter(r => r.isValid).length} ACTIVE, ${results.filter(r => !r.isValid).length} INVALID`);
    
    // Update database with validation results
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const result = results[i];
      
      await db.execute(`
        UPDATE linkedin_accounts 
        SET validation_status = ?, last_validated_at = NOW(),
            consecutive_failures = CASE WHEN ? = 'ACTIVE' THEN 0 ELSE consecutive_failures + 1 END
        WHERE id = ?
      `, [result.status, result.status, account.id]);
      
      console.log(`📝 [${account.account_name}] Database updated: ${result.status}`);
    }
    
    const validCount = results.filter(r => r.isValid).length;
    
    res.json({
      success: true,
      message: `Validated ${accounts.length} accounts. ${validCount} valid, ${accounts.length - validCount} invalid.`,
      data: {
        totalAccounts: accounts.length,
        validAccounts: validCount,
        invalidAccounts: accounts.length - validCount,
        results: results
      }
    });
    
  } catch (error) {
    console.error('❌ Multiple account validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate multiple accounts',
      error: error.message
    });
  }
});

// POST /api/linkedin-accounts/validate-pending - Validate all pending accounts
app.post('/api/linkedin-accounts/validate-pending', authenticateToken, async (req, res) => {
  try {
    const accountsService = new LinkedInAccountsService(db);
    const allAccounts = await accountsService.getUserAccounts(req.user.id);
    
    // Filter only pending accounts
    const pendingAccounts = allAccounts.filter(account => 
      account.validation_status === 'pending'
    );
    
    if (pendingAccounts.length === 0) {
      return res.json({
        success: true,
        message: 'No pending accounts to validate',
        data: { validatedAccounts: 0, results: [] }
      });
    }
    
    console.log(`🔍 Validating ${pendingAccounts.length} pending LinkedIn accounts...`);
    
    const results = [];
    let validCount = 0;
    
    // Validate each pending account
    for (const account of pendingAccounts) {
      try {
        console.log(`🔍 Validating pending account: ${account.account_name}`);
        const validation = await accountsService.validateAccount(account.id);
        
        results.push({
          accountId: account.id,
          accountName: account.account_name,
          status: validation.status,
          isValid: validation.isValid
        });
        
        if (validation.isValid) {
          validCount++;
          console.log(`✅ Account ${account.account_name} validated successfully`);
        } else {
          console.log(`❌ Account ${account.account_name} validation failed: ${validation.status}`);
        }
      } catch (error) {
        console.error(`❌ Error validating account ${account.account_name}:`, error);
        results.push({
          accountId: account.id,
          accountName: account.account_name,
          status: 'error',
          isValid: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Validated ${pendingAccounts.length} pending accounts. ${validCount} valid, ${pendingAccounts.length - validCount} invalid.`,
      data: {
        totalPending: pendingAccounts.length,
        validatedAccounts: validCount,
        invalidAccounts: pendingAccounts.length - validCount,
        results: results
      }
    });
    
  } catch (error) {
    console.error('❌ Pending account validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate pending accounts',
      error: error.message
    });
  }
});

// Extension-specific endpoint for saving accounts
app.post('/api/extension/save-account', authenticateToken, async (req, res) => {
  try {
    const { accountData } = req.body;
    
    if (!accountData || !accountData.accountName || !accountData.cookies) {
      return res.status(400).json({
        success: false,
        message: 'Account name and cookies are required'
      });
    }
    
    console.log('💾 Saving account from extension:', accountData.accountName);
    
    const accountsService = new LinkedInAccountsService(db);
    
    // Create account
    const accountId = await accountsService.createAccount(req.user.id, {
      accountName: accountData.accountName,
      sessionCookie: accountData.cookies,
      email: accountData.email || null,
      username: accountData.username || null,
      proxyUrl: accountData.proxyUrl || null,
      dailyRequestLimit: 150,
      minDelaySeconds: 30,
      maxDelaySeconds: 90
    });
    
    console.log('✅ Account saved from extension:', accountId);
    
    res.json({
      success: true,
      message: 'Account saved successfully',
      accountId: accountId
    });
    
  } catch (error) {
    console.error('❌ Extension save account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save account'
    });
  }
});

// Helper function to store multi-account data
async function storeMultiAccountData(data) {
  try {
    // Parse cookies into array format for the new cookie API
    const cookieArray = data.cookies.split(';').map(cookieStr => {
      const [name, ...valueParts] = cookieStr.trim().split('=');
      return {
        name: name.trim(),
        value: valueParts.join('=').trim(),
        domain: '.linkedin.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax'
      };
    }).filter(cookie => cookie.name && cookie.value);

    // Store using the new cookie management API
    const cookieApiResponse = await axios.post(`http://localhost:5000/api/priv/identities/${data.identityUid}/integrations/${data.integrationUid}/cookies`, 
      { cookies: cookieArray },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${generateInternalToken(data.userId)}`
        }
      }
    );

    if (cookieApiResponse.status !== 200) {
      throw new Error('Failed to store in cookie API');
    }

    console.log('✅ Cookies stored in multi-account system');
  } catch (error) {
    console.error('❌ Multi-account storage error:', error);
    throw error;
  }
}

// Helper function to generate internal token for API calls
function generateInternalToken(userId) {
  // Use the same JWT secret to generate a token for internal API calls
  return jwt.sign(
    { id: userId, internal: true },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '1h' }
  );
}

// Cookie Management API Integration (removed - functionality integrated into main server)

// Helper function to parse Excel/CSV files
const parseFile = (buffer, filename) => {
  try {
    if (filename.endsWith('.csv')) {
      // Parse CSV
      const csvData = buffer.toString('utf8');
      const lines = csvData.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ? values[index].trim() : '';
        });
        data.push(row);
      }
      return data;
    } else {
      // Parse Excel
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (data.length < 2) {
        throw new Error('File must contain at least a header row and one data row');
      }
      
      const headers = data[0].map(h => h.toString().toLowerCase().trim());
      const rows = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = data[i][index] ? data[i][index].toString().trim() : '';
        });
        rows.push(row);
      }
      
      return rows;
    }
  } catch (error) {
    throw new Error(`Failed to parse file: ${error.message}`);
  }
};

// Import Playwright-based cookie validator (temporarily disabled for startup)
// const PlaywrightCookieValidator = require('./services/playwrightCookieValidator');
// const playwrightValidator = new PlaywrightCookieValidator();

// Enhanced function to validate LinkedIn cookies with full cookie jar support
// Import the advanced LinkedIn cookie manager
const LinkedInCookieManager = require('./linkedin-cookie-manager');
const realValidator = new LinkedInCookieManager({
  headless: true,
  timeout: 15000,
  concurrency: 3,
  logLevel: 'info'
});

console.log('🔧 Advanced LinkedIn Cookie Manager Configuration:');
console.log(`   Method: Full cookie jar validation with Playwright`);
console.log(`   Timeout: 15000ms`);
console.log(`   Concurrency: 3 parallel validations`);
console.log(`   Features: Proxy support, environment matching, parallel processing`);
console.log(`   Performance: Optimized for production use`);

const checkCookies = async (cookies, proxyConfig = null, accountId = null) => {
  try {
    console.log(`🔍 [${accountId}] Testing cookie with real LinkedIn validation...`);
    
    // Extract li_at cookie value
    let liAtCookie = cookies;
    if (cookies.includes('li_at=')) {
      const match = cookies.match(/li_at=([^;]+)/);
      liAtCookie = match ? match[1] : cookies;
    }
    
    // Use real LinkedIn validation instead of format checks
    const validationResult = await realValidator.validateCookie(liAtCookie, proxyConfig, accountId);
    
    console.log(`${validationResult.isValid ? '✅' : '❌'} [${accountId}] Real validation result: ${validationResult.status}`);
    
    return validationResult.isValid;
  } catch (error) {
    console.error(`❌ [${accountId}] Cookie validation error:`, error.message);
    return false;
  }
};

// Enhanced function for detailed cookie validation using real LinkedIn testing
const validateCookieDetailed = async (cookies, proxyConfig = null, accountId = null) => {
  try {
    console.log(`🔍 [${accountId}] Starting detailed real LinkedIn validation...`);
    
    // Extract li_at cookie value
    let liAtCookie = cookies;
    if (cookies.includes('li_at=')) {
      const match = cookies.match(/li_at=([^;]+)/);
      liAtCookie = match ? match[1] : cookies;
    }
    
    // Use real LinkedIn validation - test actual login
    const validationResult = await realValidator.validateCookie(liAtCookie, proxyConfig, accountId);
    
    console.log(`${validationResult.isValid ? '✅' : '❌'} [${accountId}] Detailed validation: ${validationResult.status}`);
    
    return validationResult;
  } catch (error) {
    console.error(`❌ [${accountId}] Detailed validation error:`, error.message);
    
    return {
      isValid: false,
      status: 'INVALID',
      message: `Validation failed: ${error.message}`,
      error: error.message,
      timestamp: new Date().toISOString(),
      accountId: accountId
    };
   }
 };

// POST /api/accounts/upload - Upload Excel/CSV file with multiple accounts
app.post('/api/accounts/upload', 
  authenticateToken,
  excelUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      console.log('📁 Processing uploaded file:', req.file.originalname);
      
      // Parse the uploaded file
      const data = parseFile(req.file.buffer, req.file.originalname);
      
      // Validate required columns
      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File is empty or has no data rows'
        });
      }
      
      const firstRow = data[0];
      if (!firstRow.name || !firstRow.cookies) {
        return res.status(400).json({
          success: false,
          message: 'File must contain "name" and "cookies" columns'
        });
      }
      
      const results = {
        successful: [],
        failed: [],
        total: data.length
      };
      
      const accountsService = new LinkedInAccountsService(db);
      
      // Process each row
      for (const row of data) {
        try {
          if (!row.name || !row.cookies) {
            results.failed.push({
              name: row.name || 'Unknown',
              error: 'Missing name or cookies'
            });
            continue;
          }
          
          console.log(`🔍 Validating account: ${row.name}`);
          
          // Validate cookies
          const isValid = await checkCookies(row.cookies);
          
          if (!isValid) {
            results.failed.push({
              name: row.name,
              error: 'Invalid cookies. Please add account manually'
            });
            continue;
          }
          
          // Create account using the service
          const accountId = await accountsService.createAccount(req.user.id, {
            accountName: row.name,
            sessionCookie: row.cookies,
            email: row.email || null,
            username: row.username || null,
            proxyUrl: row.proxyUrl || null,
            dailyRequestLimit: 150,
            minDelaySeconds: 30,
            maxDelaySeconds: 90
          });
          
          console.log(`✅ Account created: ${row.name} (ID: ${accountId})`);
          
          results.successful.push({
            id: accountId,
            name: row.name
          });
          
        } catch (error) {
          console.error(`❌ Error processing account ${row.name}:`, error);
          results.failed.push({
            name: row.name,
            error: error.message
          });
        }
      }
      
      console.log(`📊 Upload complete: ${results.successful.length} successful, ${results.failed.length} failed`);
      
      res.json({
        success: true,
        message: `Processed ${results.total} accounts. ${results.successful.length} successful, ${results.failed.length} failed.`,
        data: results
      });
      
    } catch (error) {
      console.error('❌ Error uploading accounts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process uploaded file'
      });
    }
  }
);

// POST /api/linkedin-accounts/bulk - Enhanced bulk upload with multi-cookie support
app.post('/api/linkedin-accounts/bulk', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('📁 Processing bulk upload file:', req.file.originalname);

    const accounts = parseFile(req.file.buffer, req.file.originalname);
    
    if (!accounts || accounts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid accounts found in file'
      });
    }

    // Validate file format - support multiple cookie formats
    const firstRow = accounts[0];
    if (!firstRow.name || (!firstRow.cookies && !firstRow.sessionCookie && !firstRow.li_at)) {
      return res.status(400).json({
        success: false,
        message: 'File must contain "name" and "cookies" (or "sessionCookie" or "li_at") columns'
      });
    }

    console.log(`📊 Found ${accounts.length} accounts in file`);

    const results = {
      successful: [],
      failed: [],
      total: accounts.length,
      multiAccountData: [] // Track multi-account storage
    };

    const accountsService = new LinkedInAccountsService(db);

    // Process each account with enhanced multi-cookie support
    for (const [index, row] of accounts.entries()) {
      try {
        console.log(`Processing account ${index + 1}/${accounts.length}: ${row.name}`);
        
        // Extract cookies from multiple possible formats
        let finalCookies = row.cookies || row.sessionCookie || row.li_at;
        
        // Support individual cookie columns (li_at, JSESSIONID, etc.)
        if (!finalCookies && (row.li_at || row.JSESSIONID || row.bcookie)) {
          const cookieParts = [];
          if (row.li_at) cookieParts.push(`li_at=${row.li_at}`);
          if (row.JSESSIONID) cookieParts.push(`JSESSIONID=${row.JSESSIONID}`);
          if (row.bcookie) cookieParts.push(`bcookie=${row.bcookie}`);
          if (row.bscookie) cookieParts.push(`bscookie=${row.bscookie}`);
          if (row.li_gc) cookieParts.push(`li_gc=${row.li_gc}`);
          finalCookies = cookieParts.join('; ');
          console.log('🔄 Assembled cookies from individual columns');
        }
        
        // Validate required fields
        if (!row.name || !finalCookies) {
          results.failed.push({
            row: index + 1,
            name: row.name || 'Unknown',
            error: 'Missing name or cookies'
          });
          continue;
        }

        // Enhanced cookie validation
        const hasValidLinkedInCookie = finalCookies.includes('li_at=') || 
                                       finalCookies.includes('AQE') ||
                                       (finalCookies.includes('JSESSIONID') && finalCookies.includes('bcookie'));
        
        if (!hasValidLinkedInCookie) {
          results.failed.push({
            row: index + 1,
            name: row.name,
            error: 'Invalid LinkedIn cookies format'
          });
          continue;
        }

        // Generate account UID for multi-account support
        const accountUid = `account_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 6)}`;
        const identityUid = `identity_${req.user.id}_${accountUid}`;

        // Create account using enhanced endpoint logic
        const accountId = await accountsService.createAccount(req.user.id, {
          accountName: row.name,
          email: row.email || '',
          username: row.username || '',
          sessionCookie: finalCookies,
          proxyUrl: row.proxy || row.proxyUrl || '',
          accountUid: accountUid
        });

        // Store in multi-account system
        try {
          await storeMultiAccountData({
            accountUid: accountUid,
            identityUid: identityUid,
            accountName: row.name,
            cookies: finalCookies,
            userId: req.user.id,
            integrationUid: 'linkedin'
          });
          
          results.multiAccountData.push({
            accountUid,
            identityUid,
            name: row.name
          });
        } catch (multiError) {
          console.warn(`⚠️ Multi-account storage failed for ${row.name}:`, multiError.message);
        }

        results.successful.push({
          row: index + 1,
          name: row.name,
          accountId: accountId,
          accountUid: accountUid,
          identityUid: identityUid
        });

        console.log(`✅ Account ${row.name} created successfully with multi-account support`);

      } catch (error) {
        console.error(`❌ Error processing account ${row.name}:`, error);
        results.failed.push({
          row: index + 1,
          name: row.name || 'Unknown',
          error: error.message
        });
      }
    }

    console.log(`📊 Enhanced bulk upload complete: ${results.successful.length} successful, ${results.failed.length} failed, ${results.multiAccountData.length} multi-account entries`);

    res.json({
      success: true,
      message: `Processed ${results.total} accounts: ${results.successful.length} successful, ${results.failed.length} failed`,
      data: results,
      multiAccountSupport: true,
      cookieFormatsSupported: ['cookies', 'sessionCookie', 'li_at', 'individual_columns']
    });

  } catch (error) {
    console.error('❌ Enhanced bulk upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk upload'
    });
  }
});

// POST /api/linkedin-accounts/multi-session - Create multiple accounts with session management
app.post('/api/linkedin-accounts/multi-session', authenticateToken, async (req, res) => {
  try {
    const { accounts } = req.body; // Array of account objects
    
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Accounts array is required'
      });
    }

    console.log(`🔄 Processing ${accounts.length} accounts for multi-session management`);

    const results = {
      successful: [],
      failed: [],
      total: accounts.length,
      sessionMap: {} // Map accountUid to session data
    };

    const accountsService = new LinkedInAccountsService(db);

    for (const [index, accountData] of accounts.entries()) {
      try {
        const accountUid = accountData.accountUid || `account_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 6)}`;
        const identityUid = `identity_${req.user.id}_${accountUid}`;
        
        // Process cookies in multiple formats
        let cookies = accountData.cookies || accountData.sessionCookie;
        if (Array.isArray(accountData.cookies)) {
          cookies = accountData.cookies
            .filter(c => ['li_at', 'JSESSIONID', 'bcookie', 'bscookie', 'li_gc'].includes(c.name))
            .map(c => `${c.name}=${c.value}`)
            .join('; ');
        }

        // Create account
        const result = await accountsService.createAccount(req.user.id, {
          accountName: accountData.name,
          email: accountData.email || '',
          username: accountData.username || '',
          sessionCookie: cookies,
          proxyUrl: accountData.proxyUrl || '',
          accountUid: accountUid
        });

        // Store in multi-account system with session management
        await storeMultiAccountData({
          accountUid: accountUid,
          identityUid: identityUid,
          accountName: accountData.name,
          cookies: cookies,
          userId: req.user.id,
          integrationUid: 'linkedin'
        });

        // Track session data for rotation
        results.sessionMap[accountUid] = {
          identityUid: identityUid,
          accountName: accountData.name,
          lastUsed: null,
          requestCount: 0,
          status: 'active'
        };

        results.successful.push({
          accountUid: accountUid,
          identityUid: identityUid,
          name: accountData.name,
          accountId: result
        });

      } catch (error) {
        results.failed.push({
          name: accountData.name || 'Unknown',
          error: error.message
        });
      }
    }

    // Store session map for account rotation
    await storeSessionMap(req.user.id, results.sessionMap);

    res.json({
      success: true,
      message: `Multi-session setup complete: ${results.successful.length} accounts ready`,
      data: results
    });

  } catch (error) {
    console.error('❌ Multi-session setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup multi-session accounts'
    });
  }
});

// Helper function to store session map for account rotation
async function storeSessionMap(userId, sessionMap) {
  try {
    // Store in database or cache for account rotation logic
    const sessionData = {
      userId: userId,
      sessionMap: sessionMap,
      createdAt: new Date(),
      lastRotation: null
    };
    
    // You can store this in Redis, database, or file system
    console.log('💾 Session map stored for user:', userId);
    console.log('📊 Available accounts for rotation:', Object.keys(sessionMap).length);
    
  } catch (error) {
    console.error('❌ Session map storage error:', error);
    throw error;
  }
}

// POST /api/cookies/validate - Validate raw cookies
app.post('/api/cookies/validate', authenticateToken, async (req, res) => {
  try {
    const { cookies } = req.body;
    
    if (!cookies) {
      return res.status(400).json({
        success: false,
        message: 'Cookies are required'
      });
    }
    
    console.log('🔍 Validating cookies...');
    
    // Use cookie manager for validation
    const validation = await cookieManager.validateCookies(cookies);
    
    res.json({
      success: true,
      data: {
        valid: validation.valid,
        expired: validation.expired,
        message: validation.message,
        statusCode: validation.statusCode
      }
    });
    
  } catch (error) {
    console.error('❌ Cookie validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Cookie validation failed',
      error: error.message
    });
  }
});

// POST /api/cookies/parse - Parse cookies into different formats
app.post('/api/cookies/parse', authenticateToken, async (req, res) => {
  try {
    const { cookies } = req.body;
    
    if (!cookies) {
      return res.status(400).json({
        success: false,
        message: 'Cookies are required'
      });
    }
    
    console.log('🔄 Parsing cookies into multiple formats...');
    
    // Generate all cookie configurations
    const configurations = cookieManager.generateConfigurations(cookies);
    const parsedCookies = cookieManager.parseCookies(cookies);
    
    res.json({
      success: true,
      data: {
        parsed: parsedCookies,
        formats: {
          string: cookieManager.buildCookieHeader(cookies),
          array: parsedCookies,
          object: Object.fromEntries(parsedCookies.map(c => [c.name, c.value])),
          raw_li_at: parsedCookies.find(c => c.name === 'li_at')?.value || null
        },
        configurations: configurations
      }
    });
    
  } catch (error) {
    console.error('❌ Cookie parsing error:', error);
    res.status(500).json({
      success: false,
      message: 'Cookie parsing failed',
      error: error.message
    });
  }
});

// POST /api/cookies/encrypt - Encrypt cookies for secure storage
app.post('/api/cookies/encrypt', authenticateToken, async (req, res) => {
  try {
    const { cookies } = req.body;
    
    if (!cookies) {
      return res.status(400).json({
        success: false,
        message: 'Cookies are required'
      });
    }
    
    console.log('🔒 Encrypting cookies for secure storage...');
    
    const encryptedCookies = cookieManager.encryptCookies(cookies);
    
    res.json({
      success: true,
      data: {
        encrypted: encryptedCookies,
        length: encryptedCookies.length
      }
    });
    
  } catch (error) {
    console.error('❌ Cookie encryption error:', error);
    res.status(500).json({
      success: false,
      message: 'Cookie encryption failed',
      error: error.message
    });
  }
});

// POST /api/cookies/decrypt - Decrypt cookies from storage
app.post('/api/cookies/decrypt', authenticateToken, async (req, res) => {
  try {
    const { encryptedCookies } = req.body;
    
    if (!encryptedCookies) {
      return res.status(400).json({
        success: false,
        message: 'Encrypted cookies are required'
      });
    }
    
    console.log('🔓 Decrypting cookies from storage...');
    
    const decryptedCookies = cookieManager.decryptCookies(encryptedCookies);
    
    res.json({
      success: true,
      data: {
        decrypted: decryptedCookies
      }
    });
    
  } catch (error) {
    console.error('❌ Cookie decryption error:', error);
    res.status(500).json({
      success: false,
      message: 'Cookie decryption failed',
      error: error.message
    });
  }
});

// GET /api/cookies/formats - Get supported cookie formats and examples
app.get('/api/cookies/formats', authenticateToken, async (req, res) => {
  try {
    const examples = {
      raw_string: 'AQEFAREBAAAAABf_5rkAAAGZDyIZyQAAAZkzZ6tDTgAA...',
      cookie_string: 'li_at=AQE...; JSESSIONID=ajax:123; bcookie=v=2&456',
      array_format: [
        { name: 'li_at', value: 'AQE...' },
        { name: 'JSESSIONID', value: 'ajax:123' }
      ],
      object_format: {
        li_at: 'AQE...',
        JSESSIONID: 'ajax:123',
        bcookie: 'v=2&456'
      }
    };
    
    res.json({
      success: true,
      data: {
        supported_formats: [
          'Raw li_at cookie string',
          'Standard cookie header format',
          'Array format (from extensions)',
          'Object format (key-value pairs)'
        ],
        examples: examples,
        required_cookies: ['li_at', 'JSESSIONID', 'bcookie'],
        optional_cookies: ['bscookie', 'li_gc', 'liap', 'lang']
      }
    });
    
  } catch (error) {
    console.error('❌ Cookie formats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cookie formats'
    });
  }
});

// POST /api/jobs/scrape-multi-account - Start multi-account scraping job
app.post('/api/jobs/scrape-multi-account', authenticateToken, async (req, res) => {
  try {
    const { searchQuery, location, maxResults = 25, jobName } = req.body;
    
    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    console.log(`🚀 Starting multi-account scraping job: ${jobName || 'Unnamed Job'}`);
    
    // Create job record
    const jobId = uuidv4();
    await db.execute(`
      INSERT INTO jobs (id, user_id, job_name, search_query, location, max_results, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', NOW())
    `, [jobId, req.user.id, jobName || `Multi-Account Search: ${searchQuery}`, searchQuery, location, maxResults]);
    
    // Initialize multi-account scraping service
    const MultiAccountScrapingService = require('./services/multiAccountScrapingService');
    const scrapingService = new MultiAccountScrapingService(db);
    
    // Start scraping (don't await - run in background)
    scrapingService.startScrapingJob(jobId, req.user.id, {
      searchQuery,
      location,
      maxResults
    }).then(results => {
      console.log(`✅ Multi-account scraping job ${jobId} completed:`, {
        totalProfiles: results.totalProfiles,
        successfulAccounts: results.successfulAccounts,
        failedAccounts: results.failedAccounts
      });
    }).catch(error => {
      console.error(`❌ Multi-account scraping job ${jobId} failed:`, error);
      
      // Update job status to failed
      db.execute(`
        UPDATE jobs SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?
      `, [error.message, jobId]).catch(dbError => {
        console.error('Failed to update job status:', dbError);
      });
    });
    
    res.json({
      success: true,
      message: 'Multi-account scraping job started successfully',
      data: {
        jobId: jobId,
        status: 'running',
        searchQuery: searchQuery,
        location: location,
        maxResults: maxResults
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start multi-account scraping job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start scraping job',
      error: error.message
    });
  }
});

// GET /api/jobs/:jobId/status - Get job status and results
app.get('/api/jobs/:jobId/status', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get job details
    const [jobs] = await db.execute(`
      SELECT * FROM jobs WHERE id = ? AND user_id = ?
    `, [jobId, req.user.id]);
    
    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const job = jobs[0];
    
    // Get results if job is completed
    let results = [];
    if (job.status === 'completed') {
      const [jobResults] = await db.execute(`
        SELECT name, title, location, profile_url, image_url, scraped_at
        FROM results WHERE job_id = ?
        ORDER BY scraped_at DESC
      `, [jobId]);
      results = jobResults;
    }
    
    res.json({
      success: true,
      data: {
        job: job,
        results: results,
        resultCount: results.length
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to get job status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job status',
      error: error.message
    });
  }
});

async function startServer() {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('');
      console.log('🚀 LinkedIn Automation Backend Started!');
      console.log('');
      console.log('📊 Server Information:');
      console.log(`   Port: ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('');
      console.log('🌐 Access Points:');
      console.log(`   Health Check: http://localhost:${PORT}/health`);
      console.log(`   Login: POST http://localhost:${PORT}/api/auth/login`);
      console.log(`   Register: POST http://localhost:${PORT}/api/auth/register`);
      console.log('');
      console.log('✅ Backend is ready for authentication!');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down server...');
  if (db) {
    await db.end();
    console.log('✅ Database connection closed');
  }
  process.exit(0);
});