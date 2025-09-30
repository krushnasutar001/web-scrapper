const { query, transaction } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

class LinkedInAccount {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.account_name = data.account_name;
    this.email = data.email;
    this.is_active = data.is_active;
    this.validation_status = data.validation_status;
    this.daily_request_limit = data.daily_request_limit;
    this.requests_today = data.requests_today;
    this.last_request_at = data.last_request_at;
    this.cooldown_until = data.cooldown_until;
    this.blocked_until = data.blocked_until;
    this.consecutive_failures = data.consecutive_failures;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.cookies_json = data.cookies_json;
  }

  /**
   * Find account by email for a specific user
   */
  static async findByEmail(user_id, email) {
    try {
      if (!email) return null;
      
      const sql = 'SELECT * FROM linkedin_accounts WHERE user_id = ? AND email = ?';
      const results = await query(sql, [user_id, email]);
      
      if (results.length === 0) {
        return null;
      }
      
      return new LinkedInAccount(results[0]);
    } catch (error) {
      console.error('❌ Error finding LinkedIn account by email:', error);
      throw error;
    }
  }

  /**
   * Update cookies for an account
   */
  static async updateCookies(accountId, cookies) {
    try {
      const cookiesJson = JSON.stringify(cookies);
      const sql = `
        UPDATE linkedin_accounts 
        SET cookies_json = ?, updated_at = NOW()
        WHERE id = ?
      `;
      await query(sql, [cookiesJson, accountId]);
      
      console.log(`✅ Updated cookies for LinkedIn account: ${accountId}`);
      return true;
    } catch (error) {
      console.error('❌ Error updating cookies:', error);
      throw error;
    }
  }

  /**
   * Validate account (placeholder for actual validation logic)
   */
  static async validate(accountId) {
    try {
      const sql = `
        UPDATE linkedin_accounts 
        SET validation_status = 'ACTIVE', updated_at = NOW()
        WHERE id = ?
      `;
      await query(sql, [accountId]);
      
      console.log(`✅ Validated LinkedIn account: ${accountId}`);
      return true;
    } catch (error) {
      console.error('❌ Error validating account:', error);
      throw error;
    }
  }

  /**
   * Create a new LinkedIn account
   */
  static async create({ user_id, account_name, email, cookies_json }) {
    try {
      const id = uuidv4();
      
      // Handle optional email and provide fallbacks
      const safeEmail = email || null;
      const safeCookiesJson = cookies_json ? JSON.stringify(cookies_json) : null;
      
      const sql = `
        INSERT INTO linkedin_accounts (
          id, user_id, account_name, email, cookies_json,
          is_active, validation_status, daily_request_limit, 
          requests_today, consecutive_failures, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, TRUE, 'ACTIVE', 150, 0, 0, NOW(), NOW())
      `;
      
      await query(sql, [id, user_id, account_name, safeEmail, safeCookiesJson]);
      
      console.log(`✅ Created LinkedIn account: ${account_name} (${safeEmail || 'no email'}) for user ${user_id}`);
      return await LinkedInAccount.findById(id);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Account with this email already exists for this user');
      }
      console.error('❌ Error creating LinkedIn account:', error);
      throw error;
    }
  }

  /**
   * Find account by ID
   */
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM linkedin_accounts WHERE id = ?';
      const results = await query(sql, [id]);
      
      if (results.length === 0) {
        return null;
      }
      
      return new LinkedInAccount(results[0]);
    } catch (error) {
      console.error('❌ Error finding LinkedIn account by ID:', error);
      throw error;
    }
  }

  /**
   * Find all accounts for a user
   */
  static async findByUserId(user_id) {
    try {
      const sql = `
        SELECT * FROM linkedin_accounts 
        WHERE user_id = ? 
        ORDER BY created_at DESC
      `;
      const results = await query(sql, [user_id]);
      
      return results.map(account => new LinkedInAccount(account));
    } catch (error) {
      console.error('❌ Error finding LinkedIn accounts by user ID:', error);
      throw error;
    }
  }

  /**
   * Find available accounts for a user (active and not blocked)
   */
  static async findAvailableByUserId(user_id) {
    try {
      const sql = `
        SELECT * FROM linkedin_accounts 
        WHERE user_id = ? 
          AND is_active = TRUE 
          AND validation_status IN ('ACTIVE', 'PENDING')
          AND (blocked_until IS NULL OR blocked_until <= NOW())
          AND (cooldown_until IS NULL OR cooldown_until <= NOW())
          AND requests_today < daily_request_limit
        ORDER BY requests_today ASC, last_request_at ASC
      `;
      const results = await query(sql, [user_id]);
      
      return results.map(account => new LinkedInAccount(account));
    } catch (error) {
      console.error('❌ Error finding available LinkedIn accounts:', error);
      throw error;
    }
  }

  /**
   * Find account by email for a user
   */
  static async findByUserIdAndEmail(user_id, email) {
    try {
      const sql = 'SELECT * FROM linkedin_accounts WHERE user_id = ? AND email = ?';
      const results = await query(sql, [user_id, email]);
      
      if (results.length === 0) {
        return null;
      }
      
      return new LinkedInAccount(results[0]);
    } catch (error) {
      console.error('❌ Error finding LinkedIn account by email:', error);
      throw error;
    }
  }

  /**
   * Update account details
   */
  async update(updates) {
    try {
      const allowedFields = [
        'account_name', 'email', 'username', 'is_active', 
        'validation_status', 'daily_request_limit', 'cookies_json'
      ];
      
      const updateFields = [];
      const updateValues = [];
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          if (key === 'cookies_json' && value) {
            updateFields.push(`${key} = ?`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = ?`);
            updateValues.push(value);
          }
        }
      }
      
      if (updateFields.length === 0) {
        return this;
      }
      
      updateFields.push('updated_at = NOW()');
      updateValues.push(this.id);
      
      const sql = `UPDATE linkedin_accounts SET ${updateFields.join(', ')} WHERE id = ?`;
      await query(sql, updateValues);
      
      // Refresh account data
      const updatedAccount = await LinkedInAccount.findById(this.id);
      Object.assign(this, updatedAccount);
      
      console.log(`✅ Updated LinkedIn account: ${this.id}`);
      return this;
    } catch (error) {
      console.error('❌ Error updating LinkedIn account:', error);
      throw error;
    }
  }

  /**
   * Increment request count
   */
  async incrementRequestCount() {
    try {
      const sql = `
        UPDATE linkedin_accounts 
        SET requests_today = requests_today + 1, 
            last_request_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
      `;
      await query(sql, [this.id]);
      
      this.requests_today += 1;
      this.last_request_at = new Date();
      
      return this;
    } catch (error) {
      console.error('❌ Error incrementing request count:', error);
      throw error;
    }
  }

  /**
   * Reset daily request count (should be called daily)
   */
  static async resetDailyRequestCounts() {
    try {
      const sql = 'UPDATE linkedin_accounts SET requests_today = 0, updated_at = NOW()';
      const result = await query(sql);
      
      console.log(`✅ Reset daily request counts for ${result.affectedRows} accounts`);
      return result.affectedRows;
    } catch (error) {
      console.error('❌ Error resetting daily request counts:', error);
      throw error;
    }
  }

  /**
   * Block account temporarily
   */
  async block(duration_minutes = 60) {
    try {
      const blocked_until = new Date(Date.now() + duration_minutes * 60 * 1000);
      
      const sql = `
        UPDATE linkedin_accounts 
        SET blocked_until = ?, 
            consecutive_failures = consecutive_failures + 1,
            updated_at = NOW()
        WHERE id = ?
      `;
      await query(sql, [blocked_until, this.id]);
      
      this.blocked_until = blocked_until;
      this.consecutive_failures += 1;
      
      console.log(`⚠️ Blocked LinkedIn account ${this.id} until ${blocked_until}`);
      return this;
    } catch (error) {
      console.error('❌ Error blocking LinkedIn account:', error);
      throw error;
    }
  }

  /**
   * Unblock account
   */
  async unblock() {
    try {
      const sql = `
        UPDATE linkedin_accounts 
        SET blocked_until = NULL, 
            consecutive_failures = 0,
            updated_at = NOW()
        WHERE id = ?
      `;
      await query(sql, [this.id]);
      
      this.blocked_until = null;
      this.consecutive_failures = 0;
      
      console.log(`✅ Unblocked LinkedIn account ${this.id}`);
      return this;
    } catch (error) {
      console.error('❌ Error unblocking LinkedIn account:', error);
      throw error;
    }
  }

  /**
   * Set cooldown period
   */
  async setCooldown(duration_minutes = 30) {
    try {
      const cooldown_until = new Date(Date.now() + duration_minutes * 60 * 1000);
      
      const sql = `
        UPDATE linkedin_accounts 
        SET cooldown_until = ?, updated_at = NOW()
        WHERE id = ?
      `;
      await query(sql, [cooldown_until, this.id]);
      
      this.cooldown_until = cooldown_until;
      
      console.log(`⏰ Set cooldown for LinkedIn account ${this.id} until ${cooldown_until}`);
      return this;
    } catch (error) {
      console.error('❌ Error setting cooldown:', error);
      throw error;
    }
  }

  /**
   * Static method to update account by ID
   */
  static async update(id, updates) {
    try {
      const account = await LinkedInAccount.findById(id);
      if (!account) {
        throw new Error('Account not found');
      }
      
      return await account.update(updates);
    } catch (error) {
      console.error('❌ Error updating LinkedIn account (static):', error);
      throw error;
    }
  }

  /**
   * Static method to delete account by ID
   */
  static async delete(id) {
    try {
      const account = await LinkedInAccount.findById(id);
      if (!account) {
        throw new Error('Account not found');
      }
      
      return await account.delete();
    } catch (error) {
      console.error('❌ Error deleting LinkedIn account (static):', error);
      throw error;
    }
  }

  /**
   * Delete account
   */
  async delete() {
    try {
      const sql = 'DELETE FROM linkedin_accounts WHERE id = ?';
      await query(sql, [this.id]);
      
      console.log(`✅ Deleted LinkedIn account: ${this.id}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting LinkedIn account:', error);
      throw error;
    }
  }

  /**
   * Get display name for frontend
   */
  getDisplayName() {
    return `${this.account_name} (${this.email})`;
  }

  /**
   * Check if account is available for use
   */
  isAvailable() {
    const now = new Date();
    
    return (
      this.is_active &&
      ['ACTIVE', 'PENDING'].includes(this.validation_status) &&
      (!this.blocked_until || this.blocked_until <= now) &&
      (!this.cooldown_until || this.cooldown_until <= now) &&
      this.requests_today < this.daily_request_limit
    );
  }

  /**
   * Convert to JSON with display name
   */
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      account_name: this.account_name,
      email: this.email,
      username: this.username,
      is_active: this.is_active,
      validation_status: this.validation_status,
      daily_request_limit: this.daily_request_limit,
      requests_today: this.requests_today,
      last_request_at: this.last_request_at,
      cooldown_until: this.cooldown_until,
      blocked_until: this.blocked_until,
      consecutive_failures: this.consecutive_failures,
      created_at: this.created_at,
      updated_at: this.updated_at,
      displayName: this.getDisplayName(),
      isAvailable: this.isAvailable()
    };
  }

  /**
   * Get parsed cookies from stored JSON
   */
  getCookies() {
    if (!this.cookies_json) return [];

    let raw;
    // Convert to string if it's not already 
    if (typeof this.cookies_json === 'string') {
      raw = this.cookies_json;
    } else if (Buffer.isBuffer(this.cookies_json)) {
      raw = this.cookies_json.toString('utf8');
    } else {
      // Fallback for objects (Sequelize JSON type)
      raw = JSON.stringify(this.cookies_json);
    }

    console.log('🍪 Debug - Raw type:', typeof this.cookies_json);
    console.log('🍪 Debug - Raw value:', raw.substring(0, 100) + '...');

    try {
      let parsed = JSON.parse(raw);
      console.log('🍪 Debug - After first parse type:', typeof parsed, 'Is array:', Array.isArray(parsed));
      
      // Handle double-stringification: if we get a string after first parse, parse again
      if (typeof parsed === 'string') {
        console.log('🍪 Debug - Double-stringified detected, parsing again...');
        parsed = JSON.parse(parsed);
        console.log('🍪 Debug - After second parse type:', typeof parsed, 'Is array:', Array.isArray(parsed));
      }
      
      const result = Array.isArray(parsed) ? parsed : [];
      console.log('🍪 Final cookies count:', result.length);
      if (result.length > 0) {
        console.log('🍪 Cookie names:', result.map(c => c.name));
      }
      return result;
    } catch (err) {
      console.warn('Failed to parse cookies_json:', err.message, 'Raw:', raw);
      return [];
    }
  }

  /**
   * Set cookies as JSON string
   */
  async setCookies(cookies) {
    try {
      await this.update({ cookies_json: cookies });
      return this;
    } catch (error) {
      console.error('❌ Error setting cookies:', error);
      throw error;
    }
  }
}

module.exports = LinkedInAccount;
