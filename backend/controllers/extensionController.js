const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const LinkedInAccount = require('../models/LinkedInAccount');
const { query } = require('../utils/database');
const { 
  encryptCookies, 
  decryptCookies, 
  validateCookieStructure,
  extractLinkedInCookies,
  getEssentialCookies,
  checkCookieExpiration,
  generateCookieFingerprint
} = require('../services/cookieEncryption');

/**
 * Sync LinkedIn cookies from extension
 */
const syncCookies = async (req, res) => {
  try {
    const { cookies, userAgent, profileInfo } = req.body;
    const userId = req.user.id; // Fixed: changed from req.user.userId to req.user.id

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid cookies array is required'
      });
    }

    // Validate cookie structure
    if (!validateCookieStructure(cookies)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid cookie structure'
      });
    }

    // Extract only LinkedIn cookies
    const linkedinCookies = extractLinkedInCookies(cookies);

    if (linkedinCookies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No LinkedIn cookies found'
      });
    }

    // Check cookie expiration (adjusted to match service return shape)
    const expirationStatus = checkCookieExpiration(linkedinCookies);
    if (expirationStatus && (expirationStatus.hasExpired || expirationStatus.expiringSoon > 0)) {
      console.warn('⚠️ Some cookies are expired or expiring soon:', expirationStatus);
    }

    // Generate fingerprint (for future use)
    const fingerprint = generateCookieFingerprint(linkedinCookies);

    // Find existing account for this user and update, otherwise create new
    const accounts = await LinkedInAccount.findByUserId(userId);
    let targetAccount = accounts && accounts.length > 0 ? accounts[0] : null;

    if (targetAccount) {
      await targetAccount.update({
        cookies_json: linkedinCookies,
        validation_status: 'ACTIVE'
      });

      return res.json({
        success: true,
        message: 'Cookies updated successfully',
        accountId: targetAccount.id
      });
    } else {
      const newAccount = await LinkedInAccount.create({
        user_id: userId,
        account_name: 'LinkedIn Account',
        email: null,
        cookies_json: linkedinCookies
      });

      return res.json({
        success: true,
        message: 'New account created successfully',
        accountId: newAccount.id
      });
    }

  } catch (error) {
    console.error('❌ Sync cookies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync cookies'
    });
  }
};

/**
 * Get account sync status
 */
const getAccountStatus = async (req, res) => {
  try {
    const userId = req.user.id; // Fixed: changed from req.user.userId to req.user.id

    const accounts = await LinkedInAccount.findAll({
      where: { user_id: userId },
      attributes: ['id', 'validation_status', 'last_sync', 'created_at'],
      order: [['created_at', 'DESC']]
    });

    const stats = {
      total: accounts.length,
      valid: accounts.filter(acc => acc.validation_status === 'VALID').length,
      invalid: accounts.filter(acc => acc.validation_status === 'INVALID').length,
      pending: accounts.filter(acc => acc.validation_status === 'PENDING').length,
      lastSync: accounts.length > 0 ? Math.max(...accounts.map(acc => new Date(acc.last_sync || acc.created_at))) : null
    };

    res.json({
      success: true,
      accounts: accounts.map(acc => ({
        id: acc.id,
        status: acc.validation_status,
        lastSync: acc.last_sync,
        createdAt: acc.created_at
      })),
      stats
    });

  } catch (error) {
    console.error('❌ Get account status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get account status'
    });
  }
};

/**
 * Validate LinkedIn account
 */
const validateAccount = async (req, res) => {
  try {
    const { cookies } = req.body;
    const userId = req.user.id; // Fixed: changed from req.user.userId to req.user.id

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({
        success: false,
        error: 'Valid cookies array is required'
      });
    }

    // Validate cookie structure
    if (!validateCookieStructure(cookies)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid cookie structure'
      });
    }

    // Extract LinkedIn cookies
    const linkedinCookies = extractLinkedInCookies(cookies);
    
    if (linkedinCookies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No LinkedIn cookies found'
      });
    }

    // Check for essential cookies
    const essentialCookies = getEssentialCookies(linkedinCookies);
    const hasEssentialCookies = essentialCookies.some(cookie => 
      ['li_at', 'JSESSIONID'].includes(cookie.name)
    );

    if (!hasEssentialCookies) {
      return res.status(400).json({
        success: false,
        error: 'Missing essential LinkedIn cookies (li_at or JSESSIONID)'
      });
    }

    // Check expiration
    const expiredCookies = checkCookieExpiration(essentialCookies);
    
    res.json({
      success: true,
      validation: {
        isValid: expiredCookies.length === 0,
        hasEssentialCookies: true,
        expiredCookies: expiredCookies.map(c => c.name),
        totalCookies: linkedinCookies.length,
        essentialCookies: essentialCookies.length
      }
    });

  } catch (error) {
    console.error('❌ Validate account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate account'
    });
  }
};

/**
 * Get active jobs for extension
 */
const getActiveJobs = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get active scraping jobs for this user
    const jobs = await query(`
      SELECT j.id, j.type, j.status, j.parameters, j.created_at, j.updated_at,
             la.account_name, la.email
      FROM scraping_jobs j
      LEFT JOIN linkedin_accounts la ON j.linkedin_account_id = la.id
      WHERE j.user_id = ? AND j.status IN ('PENDING', 'RUNNING')
      ORDER BY j.created_at ASC
    `, [userId]);

    const formattedJobs = jobs.map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      parameters: job.parameters ? JSON.parse(job.parameters) : {},
      account: {
        name: job.account_name,
        email: job.email
      },
      createdAt: job.created_at,
      updatedAt: job.updated_at
    }));

    res.json({
      success: true,
      jobs: formattedJobs
    });

  } catch (error) {
    console.error('❌ Get active jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active jobs'
    });
  }
};

/**
 * Extension heartbeat
 */
const heartbeat = async (req, res) => {
  try {
    const userId = req.user.id; // Fixed: changed from req.user.userId to req.user.id
    const { extensionVersion, browserInfo } = req.body;

    // Log heartbeat (in production, you might want to store this in a separate table)
    console.log(`💓 Extension heartbeat from user ${userId}`, {
      version: extensionVersion,
      browser: browserInfo,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      serverTime: new Date().toISOString(),
      message: 'Heartbeat received'
    });

  } catch (error) {
    console.error('❌ Heartbeat error:', error);
    res.status(500).json({
      success: false,
      error: 'Heartbeat failed'
    });
  }
};

/**
 * Get all identities for the authenticated user
 */
const getIdentities = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all LinkedIn accounts for this user
    const accounts = await query(`
      SELECT id, email, account_name, validation_status as status, created_at, updated_at
      FROM linkedin_accounts 
      WHERE user_id = ? AND is_active = TRUE
      ORDER BY created_at DESC
    `, [userId]);

    // Transform to identity format
    const identities = accounts.map(account => ({
      id: account.id,
      name: account.account_name || account.email,
      email: account.email,
      status: account.status ? account.status.toLowerCase() : 'pending',
      integrations: ['linkedin'],
      createdAt: account.created_at,
      updatedAt: account.updated_at
    }));

    res.json({
      success: true,
      identities
    });

  } catch (error) {
    console.error('❌ Get identities error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get identities'
    });
  }
};

/**
 * Create a new identity
 */
const createIdentity = async (req, res) => {
  try {
    const { name, integrations } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Account name is required'
      });
    }

    // For LinkedIn integration, we need email as well
    const email = req.body.email || name; // Use name as email if not provided

    // Create new LinkedIn account
    const result = await query(`
      INSERT INTO linkedin_accounts (user_id, account_name, email, validation_status, is_active)
      VALUES (?, ?, ?, 'PENDING', TRUE)
    `, [userId, name, email]);

    // Get the created account
    const newAccount = await query(`
      SELECT id, email, account_name, validation_status as status, created_at, updated_at
      FROM linkedin_accounts 
      WHERE id = LAST_INSERT_ID()
    `);

    if (newAccount.length === 0) {
      throw new Error('Failed to create identity');
    }

    const account = newAccount[0];
    const identity = {
      id: account.id,
      name: account.account_name || account.email,
      email: account.email,
      status: account.status ? account.status.toLowerCase() : 'pending',
      integrations: ['linkedin'],
      createdAt: account.created_at,
      updatedAt: account.updated_at
    };

    res.json({
      success: true,
      identity
    });

  } catch (error) {
    console.error('❌ Create identity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create identity'
    });
  }
};

/**
 * Disconnect LinkedIn account
 */
const disconnectAccount = async (req, res) => {
  try {
    const { accountId } = req.body;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }

    // Update account to inactive
    const result = await query(`
      UPDATE linkedin_accounts 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = ? AND user_id = ?
    `, [accountId, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found or not owned by user'
      });
    }

    res.json({
      success: true,
      message: 'Account disconnected successfully'
    });

  } catch (error) {
    console.error('❌ Disconnect account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect account'
    });
  }
};

/**
 * Get jobs assigned to the current user for extension execution
 */
const getAssignedJobs = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get pending jobs assigned to this user
    const jobs = await query(`
      SELECT j.id, j.type, j.parameters, j.priority, j.created_at,
             la.id as account_id, la.account_name, la.email
      FROM scraping_jobs j
      LEFT JOIN linkedin_accounts la ON j.linkedin_account_id = la.id
      WHERE j.user_id = ? AND j.status = 'PENDING'
      ORDER BY j.priority DESC, j.created_at ASC
      LIMIT 5
    `, [userId]);

    const formattedJobs = jobs.map(job => ({
      id: job.id,
      type: job.type,
      parameters: job.parameters ? JSON.parse(job.parameters) : {},
      priority: job.priority || 1,
      account: {
        id: job.account_id,
        name: job.account_name,
        email: job.email
      },
      createdAt: job.created_at
    }));

    res.json({
      success: true,
      jobs: formattedJobs
    });

  } catch (error) {
    console.error('❌ Get assigned jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get assigned jobs'
    });
  }
};

/**
 * Mark a job as completed with results
 */
const completeJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { results } = req.body;
    const userId = req.user.id;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    // Verify job ownership and status
    const job = await query(`
      SELECT id, status, user_id FROM scraping_jobs 
      WHERE id = ? AND user_id = ?
    `, [jobId, userId]);

    if (job.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or not owned by user'
      });
    }

    if (job[0].status !== 'PENDING' && job[0].status !== 'RUNNING') {
      return res.status(400).json({
        success: false,
        error: 'Job is not in a completable state'
      });
    }

    // Update job status and results
    await query(`
      UPDATE scraping_jobs 
      SET status = 'COMPLETED', 
          results = ?, 
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = ?
    `, [JSON.stringify(results), jobId]);

    res.json({
      success: true,
      message: 'Job completed successfully'
    });

  } catch (error) {
    console.error('❌ Complete job error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete job'
    });
  }
};

/**
 * Mark a job as failed with error details
 */
const failJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { error: errorMessage } = req.body;
    const userId = req.user.id;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    // Verify job ownership and status
    const job = await query(`
      SELECT id, status, user_id FROM scraping_jobs 
      WHERE id = ? AND user_id = ?
    `, [jobId, userId]);

    if (job.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or not owned by user'
      });
    }

    if (job[0].status !== 'PENDING' && job[0].status !== 'RUNNING') {
      return res.status(400).json({
        success: false,
        error: 'Job is not in a failable state'
      });
    }

    // Update job status and error
    await query(`
      UPDATE scraping_jobs 
      SET status = 'FAILED', 
          error_message = ?, 
          failed_at = NOW(),
          updated_at = NOW()
      WHERE id = ?
    `, [errorMessage, jobId]);

    res.json({
      success: true,
      message: 'Job marked as failed'
    });

  } catch (error) {
    console.error('❌ Fail job error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark job as failed'
    });
  }
};

/**
 * Store LinkedIn cookies for automation
 */
const storeLinkedInCookies = async (req, res) => {
  try {
    const { identityUid, integrationUid, cookies } = req.body;
    const userId = req.user.id;

    if (!identityUid || !integrationUid || !cookies) {
      return res.status(400).json({
        success: false,
        error: 'Identity UID, integration UID, and cookies are required'
      });
    }

    // Encrypt cookies before storing
    const encryptedCookies = encryptCookies(cookies);

    // Update or insert LinkedIn account cookies
    const result = await query(`
      UPDATE linkedin_accounts 
      SET encrypted_cookies = ?, 
          last_sync = NOW(),
          validation_status = 'VALID',
          updated_at = NOW()
      WHERE id = ? AND user_id = ?
    `, [encryptedCookies, identityUid, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found or not owned by user'
      });
    }

    res.json({
      success: true,
      message: 'LinkedIn cookies stored successfully'
    });

  } catch (error) {
    console.error('❌ Store LinkedIn cookies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store LinkedIn cookies'
    });
  }
};

/**
 * Get current user information for extension
 */
const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user information
    const users = await query(`
      SELECT id, email, name, created_at, updated_at
      FROM users 
      WHERE id = ?
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
};





// Function definitions will be added after this comment

/**
 * Get all LinkedIn accounts managed by extension
 */
const getAccounts = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`📋 Getting accounts for user ${userId} via extension`);
    // Proactively clean up duplicates before returning
    try { await LinkedInAccount.cleanupDuplicates(userId); } catch (_) {}
    
    const accounts = await LinkedInAccount.findByUserId(userId);
    
    // Format accounts for extension response
    const formattedAccounts = accounts.map(account => ({
      id: account.id,
      account_name: account.account_name,
      email: account.email,
      validation_status: account.validation_status,
      is_active: account.is_active,
      created_at: account.created_at,
      updated_at: account.updated_at,
      last_sync: account.last_sync
    }));
    
    res.json({
      success: true,
      accounts: formattedAccounts,
      total: formattedAccounts.length
    });
    
  } catch (error) {
    console.error('❌ Error getting accounts via extension:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get accounts',
      code: 'GET_ACCOUNTS_ERROR'
    });
  }
};

/**
 * Add a new LinkedIn account via extension
 */
const addAccount = async (req, res) => {
  try {
    const { account_name, email, cookies_json } = req.body;
    const userId = req.user.id;
    
    console.log(`➕ Adding account via extension: ${account_name} for user ${userId}`);
    
    // Validate required fields
    if (!account_name) {
      return res.status(400).json({
        success: false,
        error: 'Account name is required',
        code: 'MISSING_ACCOUNT_NAME'
      });
    }
    
    // Handle cookies
    let cookiesData = null;
    if (cookies_json) {
      try {
        cookiesData = typeof cookies_json === 'string' ? JSON.parse(cookies_json) : cookies_json;
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies JSON format',
          code: 'INVALID_COOKIES_JSON'
        });
      }
    }
    
    // Create the account
    const newAccount = await LinkedInAccount.create({
      user_id: userId,
      account_name,
      email,
      cookies_json: cookiesData,
      // Ensure new accounts appear in frontend filters
      validation_status: cookiesData ? 'PENDING' : 'NO_COOKIES',
      is_active: true
    });
    
    console.log(`✅ Account added via extension: ${account_name} (ID: ${newAccount.id})`);
    
    res.status(201).json({
      success: true,
      message: 'LinkedIn account added successfully',
      account: {
        id: newAccount.id,
        account_name: newAccount.account_name,
        email: newAccount.email,
        validation_status: newAccount.validation_status,
        is_active: newAccount.is_active,
        created_at: newAccount.created_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error adding account via extension:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add account',
      code: 'ADD_ACCOUNT_ERROR'
    });
  }
};

/**
 * Update LinkedIn account via extension
 */
const updateAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { account_name, email, cookies_json, is_active } = req.body;
    const userId = req.user.id;
    
    console.log(`🔄 Updating account ${accountId} via extension for user ${userId}`);
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check ownership
    if (account.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Prepare update data
    const updateData = {};
    if (account_name !== undefined) updateData.account_name = account_name;
    if (email !== undefined) updateData.email = email;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    // Handle cookies update
    if (cookies_json) {
      try {
        const cookiesData = typeof cookies_json === 'string' ? JSON.parse(cookies_json) : cookies_json;
        updateData.cookies_json = cookiesData;
        // Reset validation when cookies change; use uppercase to match filters
        updateData.validation_status = 'PENDING';
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies JSON format',
          code: 'INVALID_COOKIES_JSON'
        });
      }
    }
    
    // Update the account
    const updatedAccount = await LinkedInAccount.update(accountId, updateData);
    
    console.log(`✅ Account updated via extension: ${updatedAccount.account_name} (ID: ${accountId})`);
    
    res.json({
      success: true,
      message: 'LinkedIn account updated successfully',
      account: {
        id: updatedAccount.id,
        account_name: updatedAccount.account_name,
        email: updatedAccount.email,
        validation_status: updatedAccount.validation_status,
        is_active: updatedAccount.is_active,
        updated_at: updatedAccount.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating account via extension:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update account',
      code: 'UPDATE_ACCOUNT_ERROR'
    });
  }
};

/**
 * Delete LinkedIn account via extension
 */
const deleteAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.id;
    
    console.log(`🗑️ Deleting account ${accountId} via extension for user ${userId}`);
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check ownership
    if (account.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Delete the account
    await LinkedInAccount.delete(accountId);
    
    console.log(`✅ Account deleted via extension: ${account.account_name} (ID: ${accountId})`);
    
    res.json({
      success: true,
      message: 'LinkedIn account deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting account via extension:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete account',
      code: 'DELETE_ACCOUNT_ERROR'
    });
  }
};

/**
 * Validate specific LinkedIn account via extension
 */
const validateSpecificAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.id;
    
    console.log(`🔍 Validating account ${accountId} via extension for user ${userId}`);
    
    // Find the account
    const account = await LinkedInAccount.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'LinkedIn account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }
    
    // Check ownership
    if (account.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }
    
    // Update validation status to PENDING (standardized uppercase)
    await LinkedInAccount.update(accountId, { validation_status: 'PENDING' });
    
    // Here you would typically trigger the validation process
    // For now, we'll simulate it
    setTimeout(async () => {
      try {
        // Simulate validation result
        const validationResult = Math.random() > 0.3 ? 'VALID' : 'INVALID';
        await LinkedInAccount.update(accountId, { 
          validation_status: validationResult,
          last_validated: new Date()
        });
        console.log(`✅ Account validation completed: ${account.account_name} - ${validationResult}`);
      } catch (error) {
        console.error('❌ Error updating validation status:', error);
      }
    }, 2000);
    
    res.json({
      success: true,
      message: 'Account validation started',
      account: {
        id: account.id,
        account_name: account.account_name,
        validation_status: 'PENDING'
      }
    });
    
  } catch (error) {
    console.error('❌ Error validating account via extension:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate account',
      code: 'VALIDATE_ACCOUNT_ERROR'
    });
  }
};

/**
 * Sync all managed accounts with backend
 */
const syncAccounts = async (req, res) => {
  try {
    const { accounts } = req.body;
    const userId = req.user.id;
    
    console.log(`🔄 Syncing ${accounts?.length || 0} accounts via extension for user ${userId}`);
    
    if (!accounts || !Array.isArray(accounts)) {
      return res.status(400).json({
        success: false,
        error: 'Accounts array is required',
        code: 'MISSING_ACCOUNTS'
      });
    }
    
    const syncResults = {
      created: 0,
      updated: 0,
      errors: 0,
      details: []
    };
    
    for (const accountData of accounts) {
      try {
        const { id, account_name, email, cookies_json, is_active } = accountData;
        
        if (id) {
          // Update existing account
          const existingAccount = await LinkedInAccount.findById(id);
          if (existingAccount && existingAccount.user_id === userId) {
            await LinkedInAccount.update(id, {
              account_name,
              email,
              cookies_json: cookies_json ? (typeof cookies_json === 'string' ? JSON.parse(cookies_json) : cookies_json) : undefined,
              is_active
            });
            syncResults.updated++;
            syncResults.details.push({ id, action: 'updated', account_name });
          } else {
            syncResults.errors++;
            syncResults.details.push({ id, action: 'error', error: 'Account not found or access denied' });
          }
        } else {
          // Create new account
          const newAccount = await LinkedInAccount.create({
            user_id: userId,
            account_name,
            email,
            cookies_json: cookies_json ? (typeof cookies_json === 'string' ? JSON.parse(cookies_json) : cookies_json) : null,
            is_active: is_active !== undefined ? is_active : true
          });
          syncResults.created++;
          syncResults.details.push({ id: newAccount.id, action: 'created', account_name });
        }
      } catch (error) {
        console.error('❌ Error syncing individual account:', error);
        syncResults.errors++;
        syncResults.details.push({ 
          id: accountData.id || 'new', 
          action: 'error', 
          error: error.message 
        });
      }
    }
    
    console.log(`✅ Account sync completed: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.errors} errors`);
    
    res.json({
      success: true,
      message: 'Account sync completed',
      results: syncResults
    });
    
  } catch (error) {
    console.error('❌ Error syncing accounts via extension:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync accounts',
      code: 'SYNC_ACCOUNTS_ERROR'
    });
  }
};

/**
 * Validate LinkedIn account cookies from extension
 */
const validateAccountCookies = async (req, res) => {
  try {
    const { cookies } = req.body;
    const userId = req.user.id;

    console.log(`🔍 Validating account cookies for user ${userId}`);

    if (!cookies) {
      return res.status(400).json({
        success: false,
        error: 'Cookies are required'
      });
    }

    // Parse cookies if they're a string
    let cookiesData;
    try {
      cookiesData = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid cookies format'
      });
    }

    // Check for essential LinkedIn cookies
    const cookieString = typeof cookiesData === 'string' ? cookiesData : 
      Array.isArray(cookiesData) ? cookiesData.map(c => `${c.name}=${c.value}`).join('; ') : 
      Object.entries(cookiesData).map(([name, value]) => `${name}=${value}`).join('; ');

    const hasLiAt = cookieString.includes('li_at=');
    const hasJsessionId = cookieString.includes('JSESSIONID=');

    const isValid = hasLiAt || hasJsessionId;

    console.log(`✅ Cookie validation result: ${isValid ? 'VALID' : 'INVALID'}`);

    res.json({
      success: true,
      isValid: isValid,
      message: isValid ? 'Cookies are valid' : 'Missing essential LinkedIn cookies'
    });

  } catch (error) {
    console.error('❌ Validate account cookies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate cookies'
    });
  }
};

/**
 * Start scraping task for LinkedIn account
 */
const startScrapingTask = async (req, res) => {
  try {
    const { accountId, taskType = 'profile_scraping' } = req.body;
    const userId = req.user.id;

    console.log(`🚀 Starting scraping task for account ${accountId}, user ${userId}`);

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }

    // Verify account ownership
    const account = await LinkedInAccount.findById(accountId);
    if (!account || account.user_id !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Account not found or access denied'
      });
    }

    // Create a scraping job (simplified for now)
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Here you would typically create a job in your job queue/database
    // For now, we'll simulate it
    console.log(`✅ Scraping task created: ${jobId} for account ${accountId}`);

    res.json({
      success: true,
      jobId: jobId,
      message: 'Scraping task started successfully'
    });

  } catch (error) {
    console.error('❌ Start scraping task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start scraping task'
    });
  }
};

module.exports = {
  syncCookies,
  getAccountStatus,
  validateAccount,
  getActiveJobs,
  heartbeat,
  getIdentities,
  createIdentity,
  disconnectAccount,
  getAssignedJobs,
  completeJob,
  failJob,
  storeLinkedInCookies,
  getCurrentUser,
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  validateSpecificAccount,
  syncAccounts,
  validateAccountCookies,
  startScrapingTask
};
