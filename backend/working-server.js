const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const axios = require('axios');
const excelUpload = require('express-fileupload');
const cookieManager = require('./cookie-manager');

const PORT = process.env.PORT || 5000;

const db = require('./database');

const app = express();

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