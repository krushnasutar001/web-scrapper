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
 * Extension login - authenticate user and return JWT
 */
const extensionLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user by email
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token for extension
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        source: 'extension' // Mark as extension token
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } // Longer expiry for extension
    );

    // Update last login
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('❌ Extension login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
};

/**
 * Sync LinkedIn cookies from extension
 */
const syncCookies = async (req, res) => {
  try {
    const { cookies, userAgent, profileInfo } = req.body;
    const userId = req.user.userId;

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

    // Check cookie expiration
    const expirationStatus = checkCookieExpiration(linkedinCookies);
    if (expirationStatus.hasExpired) {
      return res.status(400).json({
        success: false,
        error: 'Some cookies have expired. Please refresh your LinkedIn session.',
        details: expirationStatus
      });
    }

    // Extract LinkedIn email from cookies or profile info
    let linkedinEmail = null;
    if (profileInfo && profileInfo.email) {
      linkedinEmail = profileInfo.email;
    } else {
      // Try to extract from cookies (li_at cookie usually contains user info)
      const liAtCookie = linkedinCookies.find(c => c.name === 'li_at');
      if (liAtCookie) {
        // This is a simplified extraction - in production, you'd decode the JWT-like token
        linkedinEmail = `extracted_from_${liAtCookie.value.substring(0, 10)}@linkedin.com`;
      }
    }

    if (!linkedinEmail) {
      return res.status(400).json({
        success: false,
        error: 'Could not determine LinkedIn account email'
      });
    }

    // Generate cookie fingerprint for change detection
    const cookieFingerprint = generateCookieFingerprint(linkedinCookies);

    // Encrypt cookies for secure storage
    const encryptedCookies = encryptCookies(linkedinCookies);

    // Check if LinkedIn account already exists
    const existingAccounts = await query(
      'SELECT * FROM linkedin_accounts WHERE email = ? AND user_id = ?',
      [linkedinEmail, userId]
    );

    let accountId;
    let isNewAccount = false;

    if (existingAccounts.length > 0) {
      // Update existing account
      accountId = existingAccounts[0].id;
      await query(`
        UPDATE linkedin_accounts 
        SET cookies_json = ?, user_agent = ?, status = 'active', 
            last_synced = CURRENT_TIMESTAMP, last_validated = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [JSON.stringify(encryptedCookies), userAgent || null, accountId]);
    } else {
      // Create new LinkedIn account
      accountId = crypto.randomUUID();
      await query(`
        INSERT INTO linkedin_accounts 
        (id, user_id, email, cookies_json, user_agent, status, last_synced, last_validated)
        VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        accountId,
        userId,
        linkedinEmail,
        JSON.stringify(encryptedCookies),
        userAgent || null
      ]);
      isNewAccount = true;
    }

    // Log sync activity
    console.log(`✅ Cookies synced for user ${userId}, account ${linkedinEmail}`, {
      cookieCount: linkedinCookies.length,
      fingerprint: cookieFingerprint.substring(0, 8),
      isNewAccount,
      expirationWarning: expirationStatus.needsRefresh
    });

    res.json({
      success: true,
      message: 'Cookies synced successfully',
      accountId,
      isNewAccount,
      cookieCount: linkedinCookies.length,
      expirationStatus,
      syncTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Cookie sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync cookies'
    });
  }
};

/**
 * Get account status and sync statistics
 */
const getAccountStatus = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get LinkedIn accounts for this user
    const accounts = await query(`
      SELECT id, email, status, last_synced, last_validated, created_at
      FROM linkedin_accounts 
      WHERE user_id = ?
      ORDER BY last_synced DESC
    `, [userId]);

    // Get active jobs count
    const activeJobs = await query(`
      SELECT COUNT(*) as count 
      FROM scraping_jobs 
      WHERE user_id = ? AND status IN ('pending', 'running')
    `, [userId]);

    // Calculate sync statistics
    const now = new Date();
    const stats = {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(acc => acc.status === 'active').length,
      recentSyncs: accounts.filter(acc => {
        if (!acc.last_synced) return false;
        const syncTime = new Date(acc.last_synced);
        return (now - syncTime) < (24 * 60 * 60 * 1000); // Last 24 hours
      }).length,
      activeJobs: activeJobs[0].count
    };

    res.json({
      success: true,
      accounts: accounts.map(acc => ({
        id: acc.id,
        email: acc.email,
        status: acc.status,
        lastSynced: acc.last_synced,
        lastValidated: acc.last_validated,
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
 * Validate LinkedIn account cookies
 */
const validateAccount = async (req, res) => {
  try {
    const { accountId } = req.body;
    const userId = req.user.userId;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }

    // Get account
    const accounts = await query(`
      SELECT * FROM linkedin_accounts 
      WHERE id = ? AND user_id = ?
    `, [accountId, userId]);

    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const account = accounts[0];

    // In a real implementation, you would validate cookies by making a test request to LinkedIn
    // For now, we'll simulate validation
    const isValid = account.cookies_json && account.cookies_json.length > 0;

    // Update validation status
    await query(`
      UPDATE linkedin_accounts 
      SET status = ?, last_validated = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [isValid ? 'active' : 'invalid', accountId]);

    res.json({
      success: true,
      valid: isValid,
      message: isValid ? 'Account is valid' : 'Account cookies are invalid',
      validatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Account validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate account'
    });
  }
};

/**
 * Get active scraping jobs
 */
const getActiveJobs = async (req, res) => {
  try {
    const userId = req.user.userId;

    const jobs = await query(`
      SELECT id, job_type, status, created_at, updated_at, 
             (SELECT COUNT(*) FROM profile_results WHERE job_id = scraping_jobs.id) as results_count
      FROM scraping_jobs 
      WHERE user_id = ? AND status IN ('pending', 'running', 'paused')
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId]);

    res.json({
      success: true,
      jobs: jobs.map(job => ({
        id: job.id,
        type: job.job_type,
        status: job.status,
        resultsCount: job.results_count,
        createdAt: job.created_at,
        updatedAt: job.updated_at
      }))
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
    const userId = req.user.userId;
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
 * Disconnect LinkedIn account
 */
const disconnectAccount = async (req, res) => {
  try {
    const { accountId } = req.body;
    const userId = req.user.userId;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }

    // Update account status to disconnected
    const result = await query(`
      UPDATE linkedin_accounts 
      SET status = 'disconnected', cookies_json = NULL, last_synced = NULL
      WHERE id = ? AND user_id = ?
    `, [accountId, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
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

module.exports = {
  extensionLogin,
  syncCookies,
  getAccountStatus,
  validateAccount,
  getActiveJobs,
  heartbeat,
  disconnectAccount,
  encryptCookies,
  decryptCookies
};