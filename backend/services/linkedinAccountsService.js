const crypto = require('crypto');
const uuid = require('uuid');
const uuidv4 = uuid.v4;
const puppeteer = require('puppeteer');

class LinkedInAccountsService {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  // Encrypt sensitive data
  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // Decrypt sensitive data
  decrypt(encryptedText) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Create new LinkedIn account
  async createAccount(userId, accountData) {
    try {
      const accountId = uuidv4();
      const {
        accountName,
        email,
        username,
        sessionCookie,
        proxyUrl,
        proxyType = 'http',
        proxyUsername,
        proxyPassword,
        dailyRequestLimit = 150,
        minDelaySeconds = 30,
        maxDelaySeconds = 90
      } = accountData;

      // Encrypt sensitive data
      const encryptedCookie = this.encrypt(sessionCookie);
      const encryptedProxyPassword = proxyPassword ? this.encrypt(proxyPassword) : null;

      await this.db.execute(`
        INSERT INTO linkedin_accounts (
          id, user_id, account_name, email, username, session_cookie,
          proxy_url, proxy_type, proxy_username, proxy_password,
          daily_request_limit, min_delay_seconds, max_delay_seconds,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        accountId, userId, accountName, email || null, username || null, encryptedCookie,
        proxyUrl || null, proxyType, proxyUsername || null, encryptedProxyPassword,
        dailyRequestLimit, minDelaySeconds, maxDelaySeconds
      ]);

      // Account created successfully - validation can be done separately
      return accountId;
    } catch (error) {
      console.error('Failed to create LinkedIn account:', error);
      throw error;
    }
  }

  // Get all accounts for a user
  async getUserAccounts(userId) {
    try {
      const [accounts] = await this.db.execute(`
        SELECT 
          id, account_name, email, username, is_active, last_validated_at,
          validation_status, proxy_url, proxy_type, proxy_status,
          daily_request_limit, requests_today, last_request_at,
          cooldown_until, min_delay_seconds, max_delay_seconds,
          consecutive_failures, last_error_message, last_error_at,
          blocked_until, created_at, updated_at
        FROM linkedin_accounts 
        WHERE user_id = ? 
        ORDER BY created_at DESC
      `, [userId]);

      return accounts.map(account => ({
        ...account,
        isOnCooldown: account.cooldown_until && new Date(account.cooldown_until) > new Date(),
        isBlocked: account.blocked_until && new Date(account.blocked_until) > new Date(),
        canMakeRequest: this.canAccountMakeRequest(account)
      }));
    } catch (error) {
      console.error('Failed to get user accounts:', error);
      throw error;
    }
  }

  // Get account by ID with decrypted sensitive data
  async getAccountById(accountId, userId) {
    try {
      const [accounts] = await this.db.execute(`
        SELECT * FROM linkedin_accounts 
        WHERE id = ? AND user_id = ?
      `, [accountId, userId]);

      if (accounts.length === 0) {
        return null;
      }

      const account = accounts[0];
      
      // Decrypt sensitive data
      account.session_cookie = this.decrypt(account.session_cookie);
      if (account.proxy_password) {
        account.proxy_password = this.decrypt(account.proxy_password);
      }

      return account;
    } catch (error) {
      console.error('Failed to get account by ID:', error);
      throw error;
    }
  }

  // Update account
  async updateAccount(accountId, userId, updateData) {
    try {
      const updateFields = [];
      const updateValues = [];

      // Handle regular fields
      const allowedFields = [
        'account_name', 'email', 'username', 'proxy_url', 'proxy_type',
        'proxy_username', 'daily_request_limit', 'min_delay_seconds',
        'max_delay_seconds', 'is_active'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          updateValues.push(updateData[field]);
        }
      });

      // Handle encrypted fields
      if (updateData.sessionCookie) {
        updateFields.push('session_cookie = ?');
        updateValues.push(this.encrypt(updateData.sessionCookie));
      }

      if (updateData.proxyPassword) {
        updateFields.push('proxy_password = ?');
        updateValues.push(this.encrypt(updateData.proxyPassword));
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push('updated_at = NOW()');
      updateValues.push(accountId, userId);

      await this.db.execute(`
        UPDATE linkedin_accounts 
        SET ${updateFields.join(', ')} 
        WHERE id = ? AND user_id = ?
      `, updateValues);

      // Re-validate if session cookie was updated
      if (updateData.sessionCookie) {
        await this.validateAccount(accountId);
      }

      return true;
    } catch (error) {
      console.error('Failed to update account:', error);
      throw error;
    }
  }

  // Delete account
  async deleteAccount(accountId, userId) {
    try {
      const [result] = await this.db.execute(`
        DELETE FROM linkedin_accounts 
        WHERE id = ? AND user_id = ?
      `, [accountId, userId]);

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Failed to delete account:', error);
      throw error;
    }
  }

  // Validate LinkedIn session cookie
  async validateAccount(accountId) {
    const RealLinkedInValidator = require('./realLinkedInValidator');
    const realValidator = new RealLinkedInValidator();
    
    try {
      const account = await this.getAccountByIdInternal(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      console.log(`🔍 [${account.account_name}] Starting real LinkedIn validation...`);
      
      // Decrypt the session cookie
      const liAtCookie = this.decrypt(account.session_cookie);
      console.log(`🍪 [${account.account_name}] Cookie length: ${liAtCookie.length}, starts with: ${liAtCookie.substring(0, 10)}...`);
      
      // Prepare proxy configuration
      const proxyConfig = account.proxy_url ? {
        url: account.proxy_url,
        username: account.proxy_username,
        password: account.proxy_password
      } : null;
      
      // Use real LinkedIn validation
      const validationResult = await realValidator.validateCookie(liAtCookie, proxyConfig, accountId);
      
      console.log(`${validationResult.isValid ? '✅' : '❌'} [${account.account_name}] Validation result: ${validationResult.status}`);
       
       // Update account validation status in database
       await this.db.execute(`
         UPDATE linkedin_accounts 
         SET validation_status = ?, last_validated_at = NOW(), 
             consecutive_failures = CASE WHEN ? = 'ACTIVE' THEN 0 ELSE consecutive_failures + 1 END
         WHERE id = ?
       `, [validationResult.status, validationResult.status, accountId]);

       // Set cooldown if blocked or invalid
       if (validationResult.status === 'INVALID') {
         await this.setCooldown(accountId, 'validation_failed', 'LinkedIn validation failed', 60 * 60 * 1000); // 1 hour
       }

       console.log(`🎯 [${account.account_name}] Validation complete: ${validationResult.status}`);
       return { isValid: validationResult.isValid, status: validationResult.status, message: validationResult.message };

     } catch (error) {
       console.error(`❌ [${accountId}] Validation error:`, error.message);
       
       // Mark as invalid on error
       await this.db.execute(`
         UPDATE linkedin_accounts 
         SET validation_status = 'INVALID', last_validated_at = NOW(),
             consecutive_failures = consecutive_failures + 1,
             last_error_message = ?, last_error_at = NOW()
         WHERE id = ?
       `, [error.message, accountId]);

       return { isValid: false, status: 'INVALID', error: error.message };
     }
   }




  // Test proxy connectivity
  async testProxy(proxyUrl, proxyUsername = null, proxyPassword = null) {
    let browser;
    try {
      const browserArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
      if (proxyUrl) {
        browserArgs.push(`--proxy-server=${proxyUrl}`);
      }

      browser = await puppeteer.launch({
        headless: true,
        args: browserArgs
      });

      const page = await browser.newPage();

      // Set proxy authentication if provided
      if (proxyUsername && proxyPassword) {
        await page.authenticate({
          username: proxyUsername,
          password: proxyPassword
        });
      }

      // Test connectivity by accessing a simple page
      const startTime = Date.now();
      await page.goto('https://httpbin.org/ip', { timeout: 15000 });
      const responseTime = Date.now() - startTime;

      const content = await page.content();
      const ipMatch = content.match(/"origin":\s*"([^"]+)"/);
      const proxyIp = ipMatch ? ipMatch[1] : 'Unknown';

      return {
        success: true,
        responseTime,
        proxyIp
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Check if account can make a request (considering cooldowns and limits)
  canAccountMakeRequest(account) {
    const now = new Date();
    
    // Check if account is blocked
    if (account.blocked_until && new Date(account.blocked_until) > now) {
      return false;
    }

    // Check if account is on cooldown
    if (account.cooldown_until && new Date(account.cooldown_until) > now) {
      return false;
    }

    // Check daily request limit
    const today = now.toDateString();
    const lastRequestDate = account.last_request_at ? new Date(account.last_request_at).toDateString() : null;
    
    if (lastRequestDate === today && account.requests_today >= account.daily_request_limit) {
      return false;
    }

    // Check minimum delay between requests
    if (account.last_request_at) {
      const timeSinceLastRequest = now - new Date(account.last_request_at);
      const minDelay = account.min_delay_seconds * 1000;
      if (timeSinceLastRequest < minDelay) {
        return false;
      }
    }

    return account.is_active && account.validation_status === 'ACTIVE';
  }

  // Get available accounts for job execution
  async getAvailableAccounts(userId, jobType = null) {
    try {
      const accounts = await this.getUserAccounts(userId);

      // Return ACTIVE accounts that can make requests PLUS PENDING accounts that are active (to allow UI selection)
      return accounts.filter(account => {
        const notBlocked = !(account.blocked_until && new Date(account.blocked_until) > new Date());
        const notCooldown = !(account.cooldown_until && new Date(account.cooldown_until) > new Date());

        if (!notBlocked || !notCooldown) return false;

        if (account.validation_status === 'ACTIVE') {
          return this.canAccountMakeRequest(account);
        }
        // Allow showing PENDING accounts if user activated them
        if (account.validation_status === 'PENDING') {
          return account.is_active === 1 || account.is_active === true;
        }
        return false;
      });
    } catch (error) {
      console.error('Failed to get available accounts:', error);
      throw error;
    }
  }

  // Record account usage
  async recordUsage(accountId, actionType, targetUrl = null, success = false, responseTimeMs = null, errorCode = null, errorMessage = null, jobId = null) {
    try {
      const usageId = uuidv4();
      const now = new Date();

      await this.db.execute(`
        INSERT INTO account_usage_logs (
          id, account_id, job_id, action_type, target_url, success,
          response_time_ms, error_code, error_message, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        usageId, accountId, jobId, actionType, targetUrl, success,
        responseTimeMs, errorCode, errorMessage, now, now
      ]);

      // Update account request count and last request time
      await this.db.execute(`
        UPDATE linkedin_accounts 
        SET 
          requests_today = CASE 
            WHEN DATE(last_request_at) = CURDATE() THEN requests_today + 1 
            ELSE 1 
          END,
          last_request_at = NOW(),
          consecutive_failures = CASE WHEN ? THEN 0 ELSE consecutive_failures + 1 END
        WHERE id = ?
      `, [success, accountId]);

      // Set cooldown if too many consecutive failures
      if (!success) {
        const [accounts] = await this.db.execute(
          'SELECT consecutive_failures FROM linkedin_accounts WHERE id = ?',
          [accountId]
        );
        
        if (accounts.length > 0 && accounts[0].consecutive_failures >= 5) {
          await this.setCooldown(accountId, 'error_recovery', 'Too many consecutive failures', 60 * 60 * 1000); // 1 hour
        }
      }

    } catch (error) {
      console.error('Failed to record account usage:', error);
    }
  }

  // Set account cooldown
  async setCooldown(accountId, cooldownType, reason, durationMs, jobId = null) {
    try {
      const cooldownId = uuidv4();
      const now = new Date();
      const cooldownEnd = new Date(now.getTime() + durationMs);

      await this.db.execute(`
        INSERT INTO account_cooldown_schedules (
          id, account_id, cooldown_type, cooldown_start, cooldown_end,
          reason, triggered_by_job_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [cooldownId, accountId, cooldownType, now, cooldownEnd, reason, jobId]);

      // Update account cooldown_until
      await this.db.execute(`
        UPDATE linkedin_accounts 
        SET cooldown_until = ? 
        WHERE id = ?
      `, [cooldownEnd, accountId]);

    } catch (error) {
      console.error('Failed to set account cooldown:', error);
    }
  }

  // Get next available request time for account
  async getNextAvailableTime(accountId) {
    try {
      const account = await this.getAccountByIdInternal(accountId);
      if (!account) return null;

      const now = new Date();
      let nextAvailable = now;

      // Check cooldown
      if (account.cooldown_until && new Date(account.cooldown_until) > now) {
        nextAvailable = new Date(account.cooldown_until);
      }

      // Check minimum delay
      if (account.last_request_at) {
        const minNextRequest = new Date(account.last_request_at.getTime() + (account.min_delay_seconds * 1000));
        if (minNextRequest > nextAvailable) {
          nextAvailable = minNextRequest;
        }
      }

      return nextAvailable;
    } catch (error) {
      console.error('Failed to get next available time:', error);
      return null;
    }
  }

  // Internal method to get account without decryption
  async getAccountByIdInternal(accountId) {
    try {
      const [accounts] = await this.db.execute(
        'SELECT * FROM linkedin_accounts WHERE id = ?',
        [accountId]
      );
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error('Failed to get account internally:', error);
      return null;
    }
  }

  // Get account statistics
  async getAccountStats(accountId, days = 7) {
    try {
      const [stats] = await this.db.execute(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
          AVG(response_time_ms) as avg_response_time,
          COUNT(DISTINCT DATE(started_at)) as active_days
        FROM account_usage_logs 
        WHERE account_id = ? AND started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [accountId, days]);

      return stats[0] || {
        total_requests: 0,
        successful_requests: 0,
        avg_response_time: 0,
        active_days: 0
      };
    } catch (error) {
      console.error('Failed to get account stats:', error);
      return null;
    }
  }
}

module.exports = LinkedInAccountsService;