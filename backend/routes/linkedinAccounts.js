const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../utils/database');
const LinkedInAccount = require('../models/LinkedInAccount');
const CookieValidationService = require('../services/cookieValidationService');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize cookie validation service
const cookieValidator = new CookieValidationService();

/**
 * @route   GET /api/linkedin-accounts
 * @desc    Get all LinkedIn accounts for authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const accounts = await LinkedInAccount.findByUserId(userId);
    
    res.json({
      success: true,
      accounts: accounts
    });
  } catch (error) {
    console.error('❌ Error fetching LinkedIn accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch LinkedIn accounts'
    });
  }
});

/**
 * @route   GET /api/linkedin-accounts/available
 * @desc    Get available LinkedIn accounts for job creation (ACTIVE and PENDING only)
 * @access  Private
 */
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('🔍 Fetching available LinkedIn accounts for user:', userId);
    
    // Get accounts that are ACTIVE or PENDING (usable for jobs)
    const accounts = await query(`
      SELECT id, account_name, email, username, validation_status, 
             last_validated_at, created_at, updated_at
      FROM linkedin_accounts 
      WHERE user_id = ? AND validation_status IN ('ACTIVE', 'PENDING')
      ORDER BY validation_status DESC, last_validated_at DESC
    `, [userId]);
    
    console.log(`📊 Found ${accounts.length} available accounts for user ${userId}`);
    
    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('❌ Error fetching available LinkedIn accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available LinkedIn accounts'
    });
  }
});

/**
 * @route   GET /api/linkedin-accounts/stats
 * @desc    Get LinkedIn accounts statistics
 * @access  Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const accounts = await query(
      'SELECT validation_status FROM linkedin_accounts WHERE user_id = ?',
      [userId]
    );
    
    const stats = {
      total: accounts.length,
      valid: accounts.filter(a => a.validation_status === 'ACTIVE').length,
      invalid: accounts.filter(a => a.validation_status === 'FAILED').length,
      pending: accounts.filter(a => a.validation_status === 'PENDING').length
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('❌ Error fetching LinkedIn account stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * @route   POST /api/linkedin-accounts
 * @desc    Add new LinkedIn account
 * @access  Private
 */
router.post('/', authenticateToken, upload.single('cookiesFile'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { account_name, cookies_json, cookies, proxyUrl, email, username, user_agent } = req.body;
    const cookiesFile = req.file;
    
    console.log('➕ Adding new LinkedIn account:', { 
      account_name, 
      cookies_json: cookies_json ? 'present' : 'missing',
      cookies: cookies ? 'present' : 'missing',
      cookiesFile: cookiesFile ? 'present' : 'missing',
      proxyUrl,
      email,
      username,
      user_agent
    });
    
    // Validate required fields
    if (!account_name) {
      return res.status(400).json({
        success: false,
        error: 'Account name is required'
      });
    }
    
    // Handle cookies from multiple sources
    let cookiesData = null;
    
    // Priority: cookies_json > cookies > cookiesFile
    if (cookies_json) {
      try {
        // Validate JSON format
        if (typeof cookies_json === 'string') {
          JSON.parse(cookies_json);
          cookiesData = cookies_json;
        } else {
          cookiesData = JSON.stringify(cookies_json);
        }
        console.log('📋 Cookies loaded from cookies_json parameter');
      } catch (error) {
        console.error('❌ Error parsing cookies_json:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies_json format - must be valid JSON'
        });
      }
    } else if (cookies) {
      cookiesData = cookies;
      console.log('📋 Cookies loaded from cookies parameter');
    } else if (cookiesFile) {
      try {
        cookiesData = cookiesFile.buffer.toString('utf8');
        // Validate it's valid JSON
        JSON.parse(cookiesData);
        console.log('📁 Cookies loaded from file');
      } catch (error) {
        console.error('❌ Error reading cookies file:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid cookies file format - must be valid JSON'
        });
      }
    }
    
    if (!cookiesData) {
      return res.status(400).json({
        success: false,
        error: 'Cookies are required (provide cookies_json, cookies, or upload a cookies file)'
      });
    }
    
    // Create new account using model
    const account = await LinkedInAccount.create({
      user_id: userId,
      account_name,
      email: email || null,
      username: username || email || account_name,
      cookies_json: JSON.parse(cookiesData)
    });
    
    console.log(`✅ LinkedIn account created: ${account.id}`);
    
    res.json({
      success: true,
      message: 'LinkedIn account added successfully',
      account: account
    });
    
  } catch (error) {
    console.error('❌ Error adding LinkedIn account:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Account with this name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add LinkedIn account'
    });
  }
});

/**
 * @route   POST /api/linkedin-accounts/bulk
 * @desc    Add multiple LinkedIn accounts
 * @access  Private
 */
router.post('/bulk', authenticateToken, upload.single('accountsFile'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { accounts } = req.body;
    const accountsFile = req.file;
    
    console.log('➕ Adding bulk LinkedIn accounts');
    
    let accountsData = accounts;
    
    // Handle accounts from file
    if (accountsFile) {
      try {
        const fileContent = accountsFile.buffer.toString('utf8');
        accountsData = JSON.parse(fileContent);
        console.log('📁 Accounts loaded from file');
      } catch (error) {
        console.error('❌ Error reading accounts file:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid accounts file format'
        });
      }
    }
    
    if (!accountsData || !Array.isArray(accountsData)) {
      return res.status(400).json({
        success: false,
        error: 'Accounts data must be an array'
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process each account
    for (let i = 0; i < accountsData.length; i++) {
      const accountData = accountsData[i];
      
      try {
        // Validate required fields
        if (!accountData.account_name) {
          errors.push({ index: i, error: 'Account name is required' });
          continue;
        }
        
        if (!accountData.cookies) {
          errors.push({ index: i, error: 'Cookies are required' });
          continue;
        }
        
        // Create account
        const account = await LinkedInAccount.create({
          user_id: userId,
          account_name: accountData.account_name,
          email: accountData.email || null,
          username: accountData.username || null,
          cookies: accountData.cookies,
          proxy_url: accountData.proxyUrl || null,
          user_agent: accountData.user_agent || null
        });
        
        results.push({
          index: i,
          success: true,
          account: account
        });
        
      } catch (error) {
        console.error(`❌ Error creating account ${i}:`, error);
        errors.push({
          index: i,
          error: error.code === 'ER_DUP_ENTRY' ? 'Account with this name already exists' : 'Failed to create account'
        });
      }
    }
    
    console.log(`✅ Bulk account creation completed: ${results.length} success, ${errors.length} errors`);
    
    res.json({
      success: true,
      message: `Processed ${accountsData.length} accounts`,
      results: {
        successful: results.length,
        failed: errors.length,
        accounts: results,
        errors: errors
      }
    });
    
  } catch (error) {
    console.error('❌ Error adding bulk LinkedIn accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add bulk LinkedIn accounts'
    });
  }
});

/**
 * @route   POST /api/linkedin-accounts/:accountId/validate
 * @desc    Validate LinkedIn account
 * @access  Private
 */
router.post('/:accountId/validate', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.id;
    
    console.log('🔍 Validating LinkedIn account:', accountId);
    
    // Find account
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account || account.user_id !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    // Update validation status to pending
    await account.updateValidationStatus('PENDING');
    
    // Simulate validation process
    setTimeout(async () => {
      try {
        const validationResult = Math.random() > 0.3 ? 'ACTIVE' : 'FAILED';
        await account.updateValidationStatus(validationResult);
        console.log(`✅ Account validation completed: ${accountId} -> ${validationResult}`);
      } catch (error) {
        console.error('❌ Error updating validation result:', error);
      }
    }, 2000);
    
    res.json({
      success: true,
      message: 'Account validation started'
    });
    
  } catch (error) {
    console.error('❌ Error validating LinkedIn account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate LinkedIn account'
    });
  }
});

/**
 * @route   DELETE /api/linkedin-accounts/:accountId
 * @desc    Delete LinkedIn account
 * @access  Private
 */
router.delete('/:accountId', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.id;
    
    console.log('🗑️ Deleting LinkedIn account:', accountId);
    
    // Find account
    const account = await LinkedInAccount.findById(accountId);
    
    if (!account || account.user_id !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    // Delete account
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
      error: 'Failed to delete LinkedIn account'
    });
  }
});

/**
 * @route   POST /api/linkedin-accounts/add
 * @desc    Add LinkedIn account(s) using cookie files
 * @access  Private
 */
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { mode, filePath, folderPath } = req.body;
    
    console.log('🍪 Adding LinkedIn account(s) via cookies:', { mode, filePath, folderPath });
    
    // Validate request
    if (!mode || !['single', 'multiple'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Mode must be either "single" or "multiple"'
      });
    }
    
    if (mode === 'single' && !filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required for single mode'
      });
    }
    
    if (mode === 'multiple' && !folderPath) {
      return res.status(400).json({
        success: false,
        error: 'Folder path is required for multiple mode'
      });
    }
    
    let validationResults = [];
    
    try {
      if (mode === 'single') {
        // Validate single cookie file
        const result = await cookieValidator.validateSingleCookieFile(filePath);
        validationResults = [result];
      } else {
        // Validate multiple cookie files
        validationResults = await cookieValidator.validateMultipleCookieFiles(folderPath, 3);
      }
    } catch (error) {
      console.error('❌ Cookie validation error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    // Process validation results and store successful accounts
    const addedAccounts = [];
    const failedAccounts = [];
    
    for (const result of validationResults) {
      if (result.success) {
        try {
          // Generate account ID
          const accountId = uuidv4();
          
          // Extract account name from file path or use default
          const fileName = path.basename(result.filePath, '.json');
          const accountName = result.accountData?.name || fileName || `Account_${Date.now()}`;
          
          // Store account in database
          await query(`
            INSERT INTO linkedin_accounts (
              id, user_id, account_name, cookie_path, status, last_validated,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'active', NOW(), NOW(), NOW())
          `, [
            accountId,
            userId,
            accountName,
            result.filePath,
          ]);
          
          addedAccounts.push({
            id: accountId,
            name: accountName,
            filePath: result.filePath,
            accountData: result.accountData
          });
          
          console.log('✅ Account added successfully:', accountName);
        } catch (dbError) {
          console.error('❌ Database error for account:', result.filePath, dbError);
          failedAccounts.push({
            filePath: result.filePath,
            error: `Database error: ${dbError.message}`
          });
        }
      } else {
        failedAccounts.push({
          filePath: result.filePath,
          error: result.error
        });
        console.log('❌ Account validation failed:', result.filePath, result.error);
      }
    }
    
    // Cleanup browser resources
    await cookieValidator.cleanup();
    
    // Return results
    const response = {
      success: addedAccounts.length > 0,
      summary: {
        total: validationResults.length,
        added: addedAccounts.length,
        failed: failedAccounts.length
      },
      addedAccounts,
      failedAccounts
    };
    
    if (addedAccounts.length === 0) {
      return res.status(400).json({
        ...response,
        error: 'No accounts could be added successfully'
      });
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error adding LinkedIn accounts:', error);
    
    // Cleanup on error
    try {
      await cookieValidator.cleanup();
    } catch (cleanupError) {
      console.error('❌ Cleanup error:', cleanupError);
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add LinkedIn accounts: ' + error.message
    });
  }
});

module.exports = router;