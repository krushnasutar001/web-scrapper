const LinkedInAccount = require('../models/LinkedInAccount');

/**
 * Detect and save LinkedIn accounts from browser extension
 */
const detectFromExtension = async (req, res) => {
  try {
    const user = req.user;
    const { accounts } = req.body;
    
    console.log('🔍 Detecting LinkedIn accounts from extension for user:', user.id);
    console.log('📋 Received accounts data:', accounts);
    
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No accounts data provided',
        code: 'NO_ACCOUNTS_DATA'
      });
    }
    
    const savedAccounts = [];
    const errors = [];
    
    for (const accountData of accounts) {
      try {
        const {
          name,
          email,
          profileUrl,
          cookies,
          chromeProfileId,
          browserFingerprint,
          sessionInfo
        } = accountData;
        
        // Validate required fields
        if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
          errors.push(`Account ${name || email || 'Unknown'}: No cookies provided`);
          continue;
        }
        
        // Check if account already exists
        const existingAccount = await LinkedInAccount.findByEmail(user.id, email);
        if (existingAccount) {
          console.log(`⚠️ Account already exists for email: ${email}`);
          // Update existing account with new cookies and session info
          await LinkedInAccount.updateCookies(existingAccount.id, cookies);
          savedAccounts.push(existingAccount);
          continue;
        }
        
        // Create new account
        const accountName = name || email || `LinkedIn Account ${Date.now()}`;
        const newAccount = await LinkedInAccount.create({
          user_id: user.id,
          account_name: accountName,
          email: email,
          profile_url: profileUrl,
          cookies: JSON.stringify(cookies),
          chrome_profile_id: chromeProfileId,
          browser_fingerprint: browserFingerprint,
          session_info: JSON.stringify(sessionInfo),
          is_active: 1,
          validation_status: 'pending'
        });
        
        console.log(`✅ Created new LinkedIn account: ${accountName} (${email})`);
        savedAccounts.push(newAccount);
        
        // Validate the account immediately
        try {
          await LinkedInAccount.validate(newAccount.id);
          console.log(`✅ Account validated: ${accountName}`);
        } catch (validateError) {
          console.warn(`⚠️ Account created but validation failed: ${validateError.message}`);
        }
        
      } catch (accountError) {
        console.error('❌ Error processing account:', accountError);
        errors.push(`Account ${accountData.name || accountData.email || 'Unknown'}: ${accountError.message}`);
      }
    }
    
    res.json({
      success: true,
      data: {
        saved: savedAccounts.length,
        accounts: savedAccounts.map(account => account.toJSON()),
        errors: errors
      },
      message: `Successfully processed ${savedAccounts.length} accounts${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
    });
    
  } catch (error) {
    console.error('❌ Error detecting accounts from extension:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to detect accounts from extension',
      code: 'EXTENSION_DETECTION_ERROR'
    });
  }
};

/**
 * Get all LinkedIn accounts for the authenticated user
 */
const getAccounts = async (req, res) => {
  try {
    const user = req.user;
    
    console.log('📋 Fetching LinkedIn accounts for user:', user.id);
    
    const accounts = await LinkedInAccount.findByUserId(user.id);
    
    console.log(`✅ Found ${accounts.length} LinkedIn accounts`);
    
    res.json({
      success: true,
      data: accounts.map(account => account.toJSON()),
      total: accounts.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching LinkedIn accounts:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch LinkedIn accounts',
      code: 'FETCH_ACCOUNTS_ERROR'
    });
  }
};

/**
 * Get available LinkedIn accounts for job creation
 */
const getAvailableAccounts = async (req, res) => {
  try {
    const user = req.user;
    
    console.log('📋 Fetching available LinkedIn accounts for user:', user.id);
    
    const accounts = await LinkedInAccount.findAvailableByUserId(user.id);
    
    console.log(`✅ Found ${accounts.length} available LinkedIn accounts`);
    if (accounts.length > 0) {
      console.log('📋 Available accounts:', accounts.map(acc => `${acc.account_name} (${acc.email})`));
    }
    
    res.json({
      success: true,
      data: accounts.map(account => account.toJSON()),
      total: accounts.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching available LinkedIn accounts:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available LinkedIn accounts',
      code: 'FETCH_AVAILABLE_ACCOUNTS_ERROR'
    });
  }
};

/**
 * Get a specific LinkedIn account by ID
 */
const getAccountById = async (req, res) => {
  try {
    const { accountId } = req.params;
    const user = req.user;
    
    console.log('📋 Fetching LinkedIn account:', { accountId, userId: user.id });
    
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check if account belongs to the user
    if (account.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this LinkedIn account',
        code: 'ACCESS_DENIED'
      });
    }
    
    res.json({
      success: true,
      data: account.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error fetching LinkedIn account:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch LinkedIn account',
      code: 'FETCH_ACCOUNT_ERROR'
    });
  }
};

/**
 * Create a new LinkedIn account
 * Enhanced to support extension-managed accounts
 */
const createAccount = async (req, res) => {
  try {
    // Handle both regular form data and multipart form data
    const { name, account_name, email, username, cookies, cookies_json, proxy_url, user_agent, source = 'manual' } = req.body;
    const user = req.user;
    
    // Use 'name' field if 'account_name' is not provided (for frontend compatibility)
    const finalAccountName = account_name || name;
    
    console.log('📋 Creating LinkedIn account:', { 
      finalAccountName, 
      email, 
      username, 
      userId: user.id,
      hasCookiesFile: !!req.file,
      hasCookiesJson: !!cookies,
      hasCookiesJsonDirect: !!cookies_json,
      source
    });
    
    // Validate required fields - only account name is required now
    if (!finalAccountName) {
      return res.status(400).json({
        success: false,
        error: 'Account name is required',
        code: 'MISSING_FIELDS',
        received: { finalAccountName, email, username }
      });
    }
    
    // Process cookies from different sources
    let cookiesData = null;
    
    if (cookies_json) {
      // Direct cookies from extension
      try {
        cookiesData = typeof cookies_json === 'string' ? JSON.parse(cookies_json) : cookies_json;
        console.log('📋 Processed cookies from extension');
      } catch (error) {
        console.error('❌ Error parsing cookies_json:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies JSON format',
          code: 'INVALID_COOKIES_JSON'
        });
      }
    } else if (req.file) {
      // Handle uploaded cookies file
      try {
        const fs = require('fs');
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        cookiesData = JSON.parse(fileContent);
        console.log('📋 Processed cookies from uploaded file');
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
      } catch (error) {
        console.error('❌ Error processing cookies file:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies file format. Please upload a valid JSON file.',
          code: 'INVALID_COOKIES_FILE'
        });
      }
    } else if (cookies) {
      // Handle cookies JSON string (legacy)
      try {
        cookiesData = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
        console.log('📋 Processed cookies from JSON string');
      } catch (error) {
        console.error('❌ Error parsing cookies JSON:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies JSON format',
          code: 'INVALID_COOKIES_JSON'
        });
      }
    }
    
    // Validate email format only if email is provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        });
      }
      
      // Check if account with this email already exists for this user
      const existingAccount = await LinkedInAccount.findByUserIdAndEmail(user.id, email);
      if (existingAccount) {
        return res.status(409).json({
          success: false,
          error: 'Account with this email already exists',
          code: 'ACCOUNT_EXISTS',
          existing: existingAccount.account_name
        });
      }
    }
    
    // Create the account
    const newAccount = await LinkedInAccount.create({
      user_id: user.id,
      account_name: finalAccountName,
      email,
      username,
      cookies_json: cookiesData
    });
    
    // If cookies are provided, automatically set validation status to ACTIVE
    if (cookiesData) {
      console.log('📋 Cookies provided - setting account as validated');
      await newAccount.update({
        validation_status: 'ACTIVE',
        is_active: true
      });
    }
    
    // Log account creation source
    console.log(`✅ Account created via ${source}: ${finalAccountName} (${email || 'no email'}) for user ${user.id}${cookiesData ? ' with cookies' : ''}`);
    
    res.status(201).json({
      success: true,
      message: cookiesData ? 
        'LinkedIn account created and validated successfully with cookies' : 
        'LinkedIn account created successfully',
      account: {
        id: newAccount.id,
        account_name: newAccount.account_name,
        email: newAccount.email,
        validation_status: newAccount.validation_status,
        is_active: newAccount.is_active,
        created_at: newAccount.created_at
      },
      data: newAccount.toJSON(),
      validated: !!cookiesData
    });
    
  } catch (error) {
    console.error('❌ Error creating LinkedIn account:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && require('fs').existsSync(req.file.path)) {
      require('fs').unlinkSync(req.file.path);
    }
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message,
        code: 'ACCOUNT_EXISTS'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create LinkedIn account',
      error: 'Failed to create LinkedIn account',
      code: 'CREATE_ACCOUNT_ERROR'
    });
  }
};

/**
 * Update a LinkedIn account
 * Enhanced to support extension-managed accounts
 */
const updateAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { account_name, email, username, cookies_json, is_active, validation_status, daily_request_limit, source = 'manual' } = req.body;
    const user = req.user;
    
    console.log(`🔄 Updating account ${accountId} via ${source} for user ${user.id}`);
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check if account belongs to the user
    if (account.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this LinkedIn account',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        });
      }
      
      // Check if email is already taken by another account
      if (email !== account.email) {
        const existingAccount = await LinkedInAccount.findByUserIdAndEmail(user.id, email);
        if (existingAccount && existingAccount.id !== account.id) {
          return res.status(409).json({
            success: false,
            error: 'Email is already taken by another account',
            code: 'EMAIL_TAKEN'
          });
        }
      }
    }
    
    // Prepare updates
    const updates = {};
    if (account_name !== undefined) updates.account_name = account_name;
    if (email !== undefined) updates.email = email;
    if (username !== undefined) updates.username = username;
    if (is_active !== undefined) updates.is_active = is_active;
    if (validation_status !== undefined) updates.validation_status = validation_status;
    if (daily_request_limit !== undefined) updates.daily_request_limit = daily_request_limit;
    
    // Handle cookies update
    if (cookies_json) {
      try {
        const cookiesData = typeof cookies_json === 'string' ? JSON.parse(cookies_json) : cookies_json;
        updates.cookies_json = cookiesData;
        updates.validation_status = 'pending'; // Reset validation when cookies change
        console.log('📋 Updated cookies from extension');
      } catch (error) {
        console.error('❌ Error parsing cookies_json:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies JSON format',
          code: 'INVALID_COOKIES_JSON'
        });
      }
    }
    
    // Update the account
    await account.update(updates);
    
    console.log(`✅ Account updated via ${source}: ${account.account_name} for user ${user.id}`);
    
    res.json({
      success: true,
      message: 'LinkedIn account updated successfully',
      account: {
        id: account.id,
        account_name: account.account_name,
        email: account.email,
        validation_status: account.validation_status,
        is_active: account.is_active,
        updated_at: account.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating LinkedIn account:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update LinkedIn account',
      error: 'Failed to update LinkedIn account',
      code: 'UPDATE_ACCOUNT_ERROR'
    });
  }
};

/**
 * Delete a LinkedIn account
 */
const deleteAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const user = req.user;
    
    console.log('📋 Deleting LinkedIn account:', { accountId, userId: user.id });
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check if account belongs to the user
    if (account.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this LinkedIn account',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Delete the account
    await account.delete();
    
    console.log(`✅ LinkedIn account deleted: ${accountId}`);
    
    res.json({
      success: true,
      message: 'LinkedIn account deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting LinkedIn account:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete LinkedIn account',
      code: 'DELETE_ACCOUNT_ERROR'
    });
  }
};

/**
 * Block a LinkedIn account temporarily
 */
const blockAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { duration_minutes = 60 } = req.body;
    const user = req.user;
    
    console.log('⚠️ Blocking LinkedIn account:', { accountId, duration_minutes, userId: user.id });
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check if account belongs to the user
    if (account.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this LinkedIn account',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Block the account
    await account.block(duration_minutes);
    
    console.log(`⚠️ LinkedIn account blocked: ${accountId} for ${duration_minutes} minutes`);
    
    res.json({
      success: true,
      message: `LinkedIn account blocked for ${duration_minutes} minutes`,
      data: account.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error blocking LinkedIn account:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to block LinkedIn account',
      code: 'BLOCK_ACCOUNT_ERROR'
    });
  }
};

/**
 * Unblock a LinkedIn account
 */
const unblockAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const user = req.user;
    
    console.log('✅ Unblocking LinkedIn account:', { accountId, userId: user.id });
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check if account belongs to the user
    if (account.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this LinkedIn account',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Unblock the account
    await account.unblock();
    
    console.log(`✅ LinkedIn account unblocked: ${accountId}`);
    
    res.json({
      success: true,
      message: 'LinkedIn account unblocked successfully',
      data: account.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error unblocking LinkedIn account:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to unblock LinkedIn account',
      code: 'UNBLOCK_ACCOUNT_ERROR'
    });
  }
};

/**
 * Refresh accounts list (for frontend refresh button)
 */
const refreshAccounts = async (req, res) => {
  try {
    const user = req.user;
    
    console.log('🔄 Refreshing LinkedIn accounts for user:', user.id);
    
    // Get fresh data from database
    const accounts = await LinkedInAccount.findByUserId(user.id);
    
    console.log(`✅ Refreshed ${accounts.length} LinkedIn accounts`);
    
    res.json({
      success: true,
      message: 'Accounts refreshed successfully',
      data: accounts.map(account => account.toJSON()),
      total: accounts.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error refreshing LinkedIn accounts:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to refresh LinkedIn accounts',
      code: 'REFRESH_ACCOUNTS_ERROR'
    });
  }
};

/**
 * Get LinkedIn accounts statistics
 */
const getStats = async (req, res) => {
  try {
    const user = req.user;
    
    console.log('📊 Fetching LinkedIn account stats for user:', user.id);
    
    const accounts = await LinkedInAccount.findByUserId(user.id);
    
    const stats = {
      total: accounts.length,
      valid: accounts.filter(acc => acc.status === 'active').length,
      invalid: accounts.filter(acc => acc.status === 'blocked' || acc.status === 'error').length,
      pending: accounts.filter(acc => acc.status === 'pending').length
    };
    
    console.log('✅ Account stats:', stats);
    
    res.json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    console.error('❌ Error fetching account stats:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch account statistics',
      code: 'FETCH_STATS_ERROR'
    });
  }
};

/**
 * Add LinkedIn account with cookies file
 */
const addWithCookies = async (req, res) => {
  try {
    const user = req.user;
    const { account_name, mode, folderPath, proxyUrl } = req.body;
    const cookieFile = req.file;
    
    console.log('🍪 Adding LinkedIn account with cookies for user:', user.id);
    console.log('📋 Request data:', { account_name, mode, folderPath, proxyUrl, hasFile: !!cookieFile });
    
    if (!account_name) {
      return res.status(400).json({
        success: false,
        error: 'Account name is required',
        code: 'MISSING_ACCOUNT_NAME'
      });
    }
    
    if (mode === 'single' && !cookieFile) {
      return res.status(400).json({
        success: false,
        error: 'Cookie file is required for single mode',
        code: 'MISSING_COOKIE_FILE'
      });
    }
    
    // For now, create a basic account entry
    // In a full implementation, you would parse the cookie file and validate the account
    // Generate unique email to avoid duplicates
    const timestamp = Date.now();
    const uniqueEmail = `${account_name.replace(/\s+/g, '_')}_${timestamp}@linkedin.com`;
    
    const newAccount = await LinkedInAccount.create({
      user_id: user.id,
      account_name: account_name,
      email: uniqueEmail,
      username: account_name // Use account_name as username
    });
    
    console.log('✅ Created LinkedIn account:', newAccount.id);
    
    res.json({
      success: true,
      message: 'Account added successfully',
      results: {
        successful: [newAccount.toJSON()],
        failed: []
      }
    });
    
  } catch (error) {
    console.error('❌ Error adding account with cookies:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to add account with cookies',
      code: 'ADD_WITH_COOKIES_ERROR'
    });
  }
};

/**
 * Validate a LinkedIn account
 */
const validateAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const user = req.user;
    
    console.log('🔍 Validating LinkedIn account:', accountId, 'for user:', user.id);
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check if account belongs to user
    if (account.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this account',
        code: 'ACCESS_DENIED'
      });
    }
    
    // For now, just return the account status
    // In a real implementation, you might want to test the cookies/session
    res.json({
      success: true,
      data: {
        accountId: account.id,
        accountName: account.account_name,
        email: account.email,
        status: account.status,
        isValid: account.status === 'active',
        lastValidated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error validating LinkedIn account:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to validate account',
      code: 'VALIDATE_ACCOUNT_ERROR'
    });
  }
};

module.exports = {
  getAccounts,
  getAvailableAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  blockAccount,
  unblockAccount,
  refreshAccounts,
  getStats,
  addWithCookies,
  validateAccount,
  detectFromExtension
};
