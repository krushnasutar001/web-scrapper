const LinkedInAccount = require('../models/LinkedInAccount');

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
 */
const createAccount = async (req, res) => {
  try {
    const { account_name, email, username } = req.body;
    const user = req.user;
    
    console.log('📋 Creating LinkedIn account:', { account_name, email, username, userId: user.id });
    
    // Validate required fields
    if (!account_name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Account name and email are required',
        code: 'MISSING_FIELDS',
        received: { account_name, email, username }
      });
    }
    
    // Validate email format
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
    
    // Create the account
    const newAccount = await LinkedInAccount.create({
      user_id: user.id,
      account_name,
      email,
      username
    });
    
    console.log(`✅ LinkedIn account created: ${account_name} (${email})`);
    
    res.status(201).json({
      success: true,
      message: 'LinkedIn account created successfully',
      data: newAccount.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error creating LinkedIn account:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message,
        code: 'ACCOUNT_EXISTS'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create LinkedIn account',
      code: 'CREATE_ACCOUNT_ERROR'
    });
  }
};

/**
 * Update a LinkedIn account
 */
const updateAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { account_name, email, username, is_active, validation_status, daily_request_limit } = req.body;
    const user = req.user;
    
    console.log('📋 Updating LinkedIn account:', { accountId, userId: user.id });
    
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
    
    // Update the account
    await account.update(updates);
    
    console.log(`✅ LinkedIn account updated: ${accountId}`);
    
    res.json({
      success: true,
      message: 'LinkedIn account updated successfully',
      data: account.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error updating LinkedIn account:', error);
    
    res.status(500).json({
      success: false,
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

module.exports = {
  getAccounts,
  getAvailableAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  blockAccount,
  unblockAccount,
  refreshAccounts
};