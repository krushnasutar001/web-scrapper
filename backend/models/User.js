const { query, transaction } = require('../utils/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.name = data.name;
    this.is_active = data.is_active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_login_at = data.last_login_at;
  }

  /**
   * Create a new user
   */
  static async create({ email, password, name }) {
    try {
      const id = uuidv4();
      const password_hash = await bcrypt.hash(password, 10);
      
      const sql = `
        INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
      `;
      
      await query(sql, [id, email, password_hash, name]);
      
      console.log(`✅ Created user: ${email}`);
      return await User.findById(id);
    } catch (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    try {
      const sql = 'SELECT id, email, name, is_active, created_at, updated_at, last_login_at FROM users WHERE id = ?';
      const results = await query(sql, [id]);
      
      if (results.length === 0) {
        return null;
      }
      
      return new User(results[0]);
    } catch (error) {
      console.error('❌ Error finding user by ID:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    try {
      const sql = 'SELECT id, email, name, is_active, created_at, updated_at, last_login_at FROM users WHERE email = ?';
      const results = await query(sql, [email]);
      
      if (results.length === 0) {
        return null;
      }
      
      return new User(results[0]);
    } catch (error) {
      console.error('❌ Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Authenticate user with email and password
   */
  static async authenticate(email, password) {
    try {
      const sql = 'SELECT id, email, password_hash, name, is_active FROM users WHERE email = ? AND is_active = TRUE';
      const results = await query(sql, [email]);
      
      if (results.length === 0) {
        return null;
      }
      
      const user = results[0];
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        return null;
      }
      
      // Update last login
      await User.updateLastLogin(user.id);
      
      return new User(user);
    } catch (error) {
      console.error('❌ Error authenticating user:', error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   */
  static async updateLastLogin(userId) {
    try {
      const sql = 'UPDATE users SET last_login_at = NOW() WHERE id = ?';
      await query(sql, [userId]);
    } catch (error) {
      console.error('❌ Error updating last login:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async update({ name, email }) {
    try {
      const sql = 'UPDATE users SET name = ?, email = ?, updated_at = NOW() WHERE id = ?';
      await query(sql, [name || this.name, email || this.email, this.id]);
      
      // Refresh user data
      const updatedUser = await User.findById(this.id);
      Object.assign(this, updatedUser);
      
      console.log(`✅ Updated user: ${this.id}`);
      return this;
    } catch (error) {
      console.error('❌ Error updating user:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(newPassword) {
    try {
      const password_hash = await bcrypt.hash(newPassword, 10);
      const sql = 'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?';
      await query(sql, [password_hash, this.id]);
      
      console.log(`✅ Changed password for user: ${this.id}`);
      return true;
    } catch (error) {
      console.error('❌ Error changing password:', error);
      throw error;
    }
  }

  /**
   * Deactivate user
   */
  async deactivate() {
    try {
      const sql = 'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = ?';
      await query(sql, [this.id]);
      
      this.is_active = false;
      console.log(`✅ Deactivated user: ${this.id}`);
      return this;
    } catch (error) {
      console.error('❌ Error deactivating user:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getStats() {
    try {
      const sql = `
        SELECT 
          COUNT(DISTINCT la.id) as total_accounts,
          COUNT(DISTINCT j.id) as total_jobs,
          COUNT(DISTINCT CASE WHEN j.status = 'completed' THEN j.id END) as completed_jobs,
          COUNT(DISTINCT CASE WHEN j.status = 'running' THEN j.id END) as running_jobs,
          COUNT(DISTINCT jr.id) as total_results
        FROM users u
        LEFT JOIN linkedin_accounts la ON u.id = la.user_id
        LEFT JOIN jobs j ON u.id = j.user_id
        LEFT JOIN job_results jr ON j.id = jr.job_id
        WHERE u.id = ?
        GROUP BY u.id
      `;
      
      const results = await query(sql, [this.id]);
      
      if (results.length === 0) {
        return {
          total_accounts: 0,
          total_jobs: 0,
          completed_jobs: 0,
          running_jobs: 0,
          total_results: 0
        };
      }
      
      return results[0];
    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      throw error;
    }
  }

  /**
   * Convert to JSON (exclude sensitive data)
   */
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      is_active: this.is_active,
      created_at: this.created_at,
      updated_at: this.updated_at,
      last_login_at: this.last_login_at
    };
  }
}

module.exports = User;