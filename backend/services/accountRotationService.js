const { query } = require('../utils/database');
const LinkedInAccount = require('../models/LinkedInAccount');
const { decryptCookies } = require('./cookieEncryption');

/**
 * Account Rotation Service
 * Manages intelligent rotation of LinkedIn accounts with rate limiting and session management
 */
class AccountRotationService {
  constructor() {
    this.rotationCache = new Map(); // Cache for rotation state per user
    this.accountHealthCache = new Map(); // Cache for account health status
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache timeout
  }

  /**
   * Get the next available account for a user with intelligent rotation
   */
  async getNextAvailableAccount(userId, jobType = 'profile', priority = 'balanced') {
    try {
      console.log(`🔄 Getting next available account for user ${userId}, job type: ${jobType}`);

      // Get all active accounts for the user
      const accounts = await this.getActiveAccounts(userId);
      
      if (accounts.length === 0) {
        throw new Error('No LinkedIn accounts available for this user');
      }

      // Filter accounts based on availability and health
      const availableAccounts = await this.filterAvailableAccounts(accounts, jobType);
      
      if (availableAccounts.length === 0) {
        // Try to find accounts that will be available soon
        const soonAvailable = await this.getAccountsAvailableSoon(accounts);
        if (soonAvailable.length > 0) {
          const waitTime = Math.min(...soonAvailable.map(acc => acc.waitTime));
          throw new Error(`All accounts are currently busy. Next available in ${Math.ceil(waitTime / 60000)} minutes`);
        }
        throw new Error('All LinkedIn accounts are currently blocked or at rate limit');
      }

      // Select account based on rotation strategy
      const selectedAccount = await this.selectAccountByStrategy(availableAccounts, userId, priority);
      
      // Update account usage and rotation state
      await this.updateAccountUsage(selectedAccount, jobType);
      
      console.log(`✅ Selected account ${selectedAccount.email} for user ${userId}`);
      return selectedAccount;

    } catch (error) {
      console.error('❌ Error getting next available account:', error);
      throw error;
    }
  }

  /**
   * Get all active accounts for a user
   */
  async getActiveAccounts(userId) {
    const sql = `
      SELECT * FROM linkedin_accounts 
      WHERE user_id = ? AND is_active = 1 AND validation_status = 'ACTIVE'
      ORDER BY last_request_at ASC
    `;
    return await query(sql, [userId]);
  }

  /**
   * Filter accounts based on availability and rate limits
   */
  async filterAvailableAccounts(accounts, jobType) {
    const now = new Date();
    const availableAccounts = [];

    for (const account of accounts) {
      const accountObj = new LinkedInAccount(account);
      
      // Check if account is blocked
      if (account.blocked_until && new Date(account.blocked_until) > now) {
        console.log(`⚠️ Account ${account.email} is blocked until ${account.blocked_until}`);
        continue;
      }

      // Check if account is in cooldown
      if (account.cooldown_until && new Date(account.cooldown_until) > now) {
        console.log(`⏰ Account ${account.email} is in cooldown until ${account.cooldown_until}`);
        continue;
      }

      // Check daily rate limit
      const dailyLimit = this.getDailyLimitForJobType(jobType, account.daily_request_limit);
      if (account.requests_today >= dailyLimit) {
        console.log(`📊 Account ${account.email} has reached daily limit (${account.requests_today}/${dailyLimit})`);
        continue;
      }

      // Check hourly rate limit
      const hourlyLimit = Math.floor(dailyLimit / 24);
      const recentRequests = await this.getRecentRequestCount(account.id, 60); // Last hour
      if (recentRequests >= hourlyLimit) {
        console.log(`⏱️ Account ${account.email} has reached hourly limit (${recentRequests}/${hourlyLimit})`);
        continue;
      }

      // Check account health
      const healthScore = await this.calculateAccountHealth(account);
      if (healthScore < 0.3) {
        console.log(`🏥 Account ${account.email} has low health score: ${healthScore}`);
        continue;
      }

      availableAccounts.push({
        ...account,
        healthScore,
        accountObj
      });
    }

    return availableAccounts;
  }

  /**
   * Get accounts that will be available soon
   */
  async getAccountsAvailableSoon(accounts) {
    const now = new Date();
    const soonAvailable = [];

    for (const account of accounts) {
      let waitTime = 0;

      if (account.blocked_until) {
        const blockedUntil = new Date(account.blocked_until);
        if (blockedUntil > now) {
          waitTime = Math.max(waitTime, blockedUntil - now);
        }
      }

      if (account.cooldown_until) {
        const cooldownUntil = new Date(account.cooldown_until);
        if (cooldownUntil > now) {
          waitTime = Math.max(waitTime, cooldownUntil - now);
        }
      }

      if (waitTime > 0 && waitTime < 60 * 60 * 1000) { // Within 1 hour
        soonAvailable.push({
          ...account,
          waitTime
        });
      }
    }

    return soonAvailable.sort((a, b) => a.waitTime - b.waitTime);
  }

  /**
   * Select account based on rotation strategy
   */
  async selectAccountByStrategy(availableAccounts, userId, priority) {
    switch (priority) {
      case 'health':
        // Prioritize accounts with highest health scores
        return availableAccounts.sort((a, b) => b.healthScore - a.healthScore)[0];
      
      case 'round_robin':
        // Simple round-robin rotation
        return this.selectRoundRobin(availableAccounts, userId);
      
      case 'least_used':
        // Select account with lowest usage today
        return availableAccounts.sort((a, b) => a.requests_today - b.requests_today)[0];
      
      case 'balanced':
      default:
        // Balanced approach considering health, usage, and rotation
        return this.selectBalanced(availableAccounts, userId);
    }
  }

  /**
   * Round-robin account selection
   */
  selectRoundRobin(availableAccounts, userId) {
    const cacheKey = `rotation_${userId}`;
    let lastIndex = this.rotationCache.get(cacheKey) || 0;
    
    const nextIndex = (lastIndex + 1) % availableAccounts.length;
    this.rotationCache.set(cacheKey, nextIndex);
    
    return availableAccounts[nextIndex];
  }

  /**
   * Balanced account selection
   */
  selectBalanced(availableAccounts, userId) {
    // Calculate composite score for each account
    const scoredAccounts = availableAccounts.map(account => {
      const healthWeight = 0.4;
      const usageWeight = 0.3;
      const rotationWeight = 0.3;

      const healthScore = account.healthScore;
      const usageScore = 1 - (account.requests_today / account.daily_request_limit);
      const rotationScore = this.calculateRotationScore(account, userId);

      const compositeScore = (healthScore * healthWeight) + 
                           (usageScore * usageWeight) + 
                           (rotationScore * rotationWeight);

      return {
        ...account,
        compositeScore
      };
    });

    // Sort by composite score and return the best
    return scoredAccounts.sort((a, b) => b.compositeScore - a.compositeScore)[0];
  }

  /**
   * Calculate rotation score based on last usage
   */
  calculateRotationScore(account, userId) {
    if (!account.last_request_at) return 1.0;
    
    const timeSinceLastUse = Date.now() - new Date(account.last_request_at).getTime();
    const hoursSinceLastUse = timeSinceLastUse / (1000 * 60 * 60);
    
    // Higher score for accounts not used recently
    return Math.min(1.0, hoursSinceLastUse / 24);
  }

  /**
   * Calculate account health score
   */
  async calculateAccountHealth(account) {
    let healthScore = 1.0;

    // Reduce score based on consecutive failures
    if (account.consecutive_failures > 0) {
      healthScore -= (account.consecutive_failures * 0.1);
    }

    // Reduce score if account was recently blocked
    if (account.blocked_until) {
      const timeSinceBlock = Date.now() - new Date(account.blocked_until).getTime();
      if (timeSinceBlock < 24 * 60 * 60 * 1000) { // Within 24 hours
        healthScore -= 0.2;
      }
    }

    // Check cookie validity
    try {
      const cookies = JSON.parse(account.cookies_json || '[]');
      if (cookies.length === 0) {
        healthScore -= 0.3;
      }
    } catch (error) {
      healthScore -= 0.5;
    }

    return Math.max(0, healthScore);
  }

  /**
   * Get recent request count for rate limiting
   */
  async getRecentRequestCount(accountId, minutes) {
    const sql = `
      SELECT COUNT(*) as count 
      FROM account_usage_log 
      WHERE account_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `;
    
    try {
      const result = await query(sql, [accountId, minutes]);
      return result[0]?.count || 0;
    } catch (error) {
      // If table doesn't exist, return 0
      console.warn('Account usage log table not found, returning 0');
      return 0;
    }
  }

  /**
   * Get daily limit based on job type
   */
  getDailyLimitForJobType(jobType, baseLimit) {
    const limits = {
      'profile': baseLimit,
      'company': Math.floor(baseLimit * 0.8),
      'search': Math.floor(baseLimit * 0.6),
      'message': Math.floor(baseLimit * 0.3)
    };
    
    return limits[jobType] || baseLimit;
  }

  /**
   * Update account usage after selection
   */
  async updateAccountUsage(account, jobType) {
    try {
      // Increment request count
      await query(
        'UPDATE linkedin_accounts SET requests_today = requests_today + 1, last_request_at = NOW() WHERE id = ?',
        [account.id]
      );

      // Log usage for detailed tracking
      try {
        await query(
          'INSERT INTO account_usage_log (account_id, job_type, created_at) VALUES (?, ?, NOW())',
          [account.id, jobType]
        );
      } catch (error) {
        // Ignore if usage log table doesn't exist
        console.warn('Could not log account usage:', error.message);
      }

      console.log(`📊 Updated usage for account ${account.email}: ${account.requests_today + 1} requests today`);
    } catch (error) {
      console.error('❌ Error updating account usage:', error);
      throw error;
    }
  }

  /**
   * Mark account as failed and potentially block it
   */
  async markAccountFailed(accountId, errorType = 'unknown') {
    try {
      const account = await LinkedInAccount.findById(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      const newFailureCount = (account.consecutive_failures || 0) + 1;
      
      // Determine block duration based on failure count and type
      let blockDuration = 0;
      if (errorType === 'rate_limit') {
        blockDuration = Math.min(60 * newFailureCount, 480); // Max 8 hours
      } else if (errorType === 'authentication') {
        blockDuration = 120; // 2 hours for auth issues
      } else if (newFailureCount >= 3) {
        blockDuration = 30 * newFailureCount; // Escalating blocks
      }

      if (blockDuration > 0) {
        await account.block(blockDuration);
        console.log(`🚫 Blocked account ${account.email} for ${blockDuration} minutes due to ${errorType}`);
      } else {
        // Just increment failure count
        await query(
          'UPDATE linkedin_accounts SET consecutive_failures = consecutive_failures + 1 WHERE id = ?',
          [accountId]
        );
        console.log(`⚠️ Incremented failure count for account ${account.email}`);
      }

    } catch (error) {
      console.error('❌ Error marking account as failed:', error);
      throw error;
    }
  }

  /**
   * Mark account as successful and reset failure count
   */
  async markAccountSuccess(accountId) {
    try {
      await query(
        'UPDATE linkedin_accounts SET consecutive_failures = 0 WHERE id = ?',
        [accountId]
      );
      console.log(`✅ Reset failure count for account ${accountId}`);
    } catch (error) {
      console.error('❌ Error marking account as successful:', error);
      throw error;
    }
  }

  /**
   * Get rotation statistics for a user
   */
  async getRotationStats(userId) {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_accounts,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_accounts,
          SUM(CASE WHEN blocked_until > NOW() THEN 1 ELSE 0 END) as blocked_accounts,
          SUM(CASE WHEN cooldown_until > NOW() THEN 1 ELSE 0 END) as cooldown_accounts,
          AVG(requests_today) as avg_requests_today,
          SUM(requests_today) as total_requests_today
        FROM linkedin_accounts 
        WHERE user_id = ?
      `;
      
      const result = await query(sql, [userId]);
      return result[0] || {};
    } catch (error) {
      console.error('❌ Error getting rotation stats:', error);
      throw error;
    }
  }

  /**
   * Clear rotation cache (useful for testing or manual resets)
   */
  clearCache() {
    this.rotationCache.clear();
    this.accountHealthCache.clear();
    console.log('🧹 Cleared account rotation cache');
  }
}

module.exports = new AccountRotationService();