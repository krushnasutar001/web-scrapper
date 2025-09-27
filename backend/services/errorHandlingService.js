/**
 * Scralytics Hub - Error Handling Service
 * Comprehensive error handling for cookies, login, and DB constraints
 */

const { query, transaction } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

class ErrorHandlingService {
  constructor() {
    this.retryAttempts = {
      cookie: 3,
      login: 3,
      database: 5,
      scraping: 2
    };
    
    this.retryDelays = {
      cookie: 5000,    // 5 seconds
      login: 10000,    // 10 seconds
      database: 2000,  // 2 seconds
      scraping: 15000  // 15 seconds
    };
    
    // Enhanced error tracking for multi-user testing
    this.errorStats = {
      totalErrors: 0,
      resolvedErrors: 0,
      activeErrors: new Map(),
      errorsByType: new Map(),
      errorsByAccount: new Map()
    };
  }

  /**
   * Handle cookie-related errors
   */
  async handleCookieError(workerId, jobId, accountId, errorType, errorMessage) {
    try {
      console.log(`🍪 Handling cookie error for job ${jobId}: ${errorType}`);
      
      const errorId = await this.logError('COOKIE_ERROR', {
        workerId,
        jobId,
        accountId,
        errorType,
        errorMessage,
        severity: 'HIGH'
      });
      
      switch (errorType) {
        case 'NO_COOKIES':
          return await this.handleNoCookies(workerId, jobId, accountId, errorId);
          
        case 'INVALID_COOKIES':
          return await this.handleInvalidCookies(workerId, jobId, accountId, errorId);
          
        case 'EXPIRED_COOKIES':
          return await this.handleExpiredCookies(workerId, jobId, accountId, errorId);
          
        case 'COOKIE_FETCH_FAILED':
          return await this.handleCookieFetchFailed(workerId, jobId, accountId, errorId);
          
        default:
          console.log(`⚠️  Unknown cookie error type: ${errorType}`);
          return await this.pauseJobForManualIntervention(jobId, `Unknown cookie error: ${errorType}`);
      }
      
    } catch (error) {
      console.error(`❌ Error handling cookie error:`, error);
      throw error;
    }
  }

  /**
   * Handle no cookies scenario
   */
  async handleNoCookies(workerId, jobId, accountId, errorId) {
    try {
      console.log(`🔍 No cookies found for account ${accountId}, requesting fresh cookies`);
      
      // Pause job temporarily
      await this.pauseJob(jobId, 'Waiting for fresh cookies');
      
      // Request fresh cookies from extension
      await this.requestFreshCookies(accountId, workerId);
      
      // Set cooldown for account
      await query(`
        UPDATE linkedin_accounts 
        SET cooldown_until = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
            last_error = 'NO_COOKIES',
            updated_at = NOW()
        WHERE id = ?
      `, [accountId]);
      
      return {
        action: 'PAUSE_AND_RETRY',
        retryAfter: 300000, // 5 minutes
        message: 'Job paused, requesting fresh cookies'
      };
      
    } catch (error) {
      console.error(`❌ Error handling no cookies:`, error);
      throw error;
    }
  }

  /**
   * Handle invalid cookies scenario
   */
  async handleInvalidCookies(workerId, jobId, accountId, errorId) {
    try {
      console.log(`🚫 Invalid cookies detected for account ${accountId}`);
      
      // Check retry count
      const retryCount = await this.getRetryCount(jobId, 'COOKIE_ERROR');
      
      if (retryCount >= this.retryAttempts.cookie) {
        return await this.markJobAsFailed(jobId, 'Max cookie retry attempts exceeded');
      }
      
      // Clear existing cookies
      await this.clearAccountCookies(accountId);
      
      // Request fresh login
      await this.requestFreshLogin(accountId, workerId);
      
      // Increment retry count
      await this.incrementRetryCount(jobId, 'COOKIE_ERROR');
      
      return {
        action: 'RETRY_WITH_FRESH_LOGIN',
        retryAfter: this.retryDelays.cookie,
        message: 'Requesting fresh login due to invalid cookies'
      };
      
    } catch (error) {
      console.error(`❌ Error handling invalid cookies:`, error);
      throw error;
    }
  }

  /**
   * Handle expired cookies scenario
   */
  async handleExpiredCookies(workerId, jobId, accountId, errorId) {
    try {
      console.log(`⏰ Expired cookies detected for account ${accountId}`);
      
      // Refresh cookies automatically
      const refreshResult = await this.refreshAccountCookies(accountId);
      
      if (refreshResult.success) {
        return {
          action: 'RETRY_IMMEDIATELY',
          message: 'Cookies refreshed successfully'
        };
      } else {
        return await this.handleInvalidCookies(workerId, jobId, accountId, errorId);
      }
      
    } catch (error) {
      console.error(`❌ Error handling expired cookies:`, error);
      throw error;
    }
  }

  /**
   * Handle cookie fetch failed scenario
   */
  async handleCookieFetchFailed(workerId, jobId, accountId, errorId) {
    try {
      console.log(`📡 Cookie fetch failed for account ${accountId}`);
      
      // Check if extension is responsive
      const extensionStatus = await this.checkExtensionStatus(accountId);
      
      if (!extensionStatus.responsive) {
        return await this.pauseJobForManualIntervention(jobId, 'Extension not responsive');
      }
      
      // Retry cookie fetch with delay
      return {
        action: 'RETRY_WITH_DELAY',
        retryAfter: this.retryDelays.cookie * 2,
        message: 'Retrying cookie fetch after delay'
      };
      
    } catch (error) {
      console.error(`❌ Error handling cookie fetch failure:`, error);
      throw error;
    }
  }

  /**
   * Handle login-related errors
   */
  async handleLoginError(workerId, jobId, accountId, errorType, errorMessage) {
    try {
      console.log(`🔐 Handling login error for job ${jobId}: ${errorType}`);
      
      const errorId = await this.logError('LOGIN_ERROR', {
        workerId,
        jobId,
        accountId,
        errorType,
        errorMessage,
        severity: 'HIGH'
      });
      
      switch (errorType) {
        case 'LOGIN_REDIRECT':
          return await this.handleLoginRedirect(workerId, jobId, accountId, errorId);
          
        case 'GUEST_PAGE':
          return await this.handleGuestPage(workerId, jobId, accountId, errorId);
          
        case 'ACCOUNT_LOCKED':
          return await this.handleAccountLocked(workerId, jobId, accountId, errorId);
          
        case 'CAPTCHA_REQUIRED':
          return await this.handleCaptchaRequired(workerId, jobId, accountId, errorId);
          
        default:
          console.log(`⚠️  Unknown login error type: ${errorType}`);
          return await this.pauseJobForManualIntervention(jobId, `Unknown login error: ${errorType}`);
      }
      
    } catch (error) {
      console.error(`❌ Error handling login error:`, error);
      throw error;
    }
  }

  /**
   * Handle login redirect scenario
   */
  async handleLoginRedirect(workerId, jobId, accountId, errorId) {
    try {
      console.log(`🔄 Login redirect detected for account ${accountId}`);
      
      const retryCount = await this.getRetryCount(jobId, 'LOGIN_ERROR');
      
      if (retryCount >= this.retryAttempts.login) {
        return await this.markJobAsFailed(jobId, 'Max login retry attempts exceeded');
      }
      
      // Refresh cookies and retry
      await this.refreshAccountCookies(accountId);
      await this.incrementRetryCount(jobId, 'LOGIN_ERROR');
      
      return {
        action: 'RETRY_WITH_FRESH_COOKIES',
        retryAfter: this.retryDelays.login,
        message: 'Retrying with refreshed cookies after login redirect'
      };
      
    } catch (error) {
      console.error(`❌ Error handling login redirect:`, error);
      throw error;
    }
  }

  /**
   * Handle guest page scenario
   */
  async handleGuestPage(workerId, jobId, accountId, errorId) {
    try {
      console.log(`👤 Guest page detected for account ${accountId}`);
      
      // This usually means we're not logged in
      await this.requestFreshLogin(accountId, workerId);
      
      return {
        action: 'PAUSE_AND_RETRY',
        retryAfter: this.retryDelays.login * 2,
        message: 'Guest page detected, requesting fresh login'
      };
      
    } catch (error) {
      console.error(`❌ Error handling guest page:`, error);
      throw error;
    }
  }

  /**
   * Handle account locked scenario
   */
  async handleAccountLocked(workerId, jobId, accountId, errorId) {
    try {
      console.log(`🔒 Account locked detected for account ${accountId}`);
      
      // Block account temporarily
      await query(`
        UPDATE linkedin_accounts 
        SET blocked_until = DATE_ADD(NOW(), INTERVAL 24 HOUR),
            validation_status = 'BLOCKED',
            last_error = 'ACCOUNT_LOCKED',
            updated_at = NOW()
        WHERE id = ?
      `, [accountId]);
      
      return await this.pauseJobForManualIntervention(jobId, 'Account locked by LinkedIn');
      
    } catch (error) {
      console.error(`❌ Error handling account locked:`, error);
      throw error;
    }
  }

  /**
   * Handle captcha required scenario
   */
  async handleCaptchaRequired(workerId, jobId, accountId, errorId) {
    try {
      console.log(`🤖 Captcha required for account ${accountId}`);
      
      // Pause job for manual intervention
      return await this.pauseJobForManualIntervention(jobId, 'Captcha verification required');
      
    } catch (error) {
      console.error(`❌ Error handling captcha:`, error);
      throw error;
    }
  }

  /**
   * Handle database constraint errors
   */
  async handleDatabaseError(operation, error, data = {}) {
    try {
      console.log(`🗄️  Handling database error for operation ${operation}:`, error.message);
      
      const errorId = await this.logError('DATABASE_ERROR', {
        operation,
        errorMessage: error.message,
        errorCode: error.code,
        data,
        severity: 'MEDIUM'
      });
      
      // Handle specific database errors
      if (error.code === 'ER_DATA_TOO_LONG') {
        return await this.handleDataTruncation(operation, error, data);
      }
      
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return await this.handleForeignKeyError(operation, error, data);
      }
      
      if (error.code === 'ER_DUP_ENTRY') {
        return await this.handleDuplicateEntry(operation, error, data);
      }
      
      if (error.code === 'ER_BAD_NULL_ERROR') {
        return await this.handleNullConstraint(operation, error, data);
      }
      
      // Generic retry for other database errors
      return await this.retryDatabaseOperation(operation, data, errorId);
      
    } catch (handlingError) {
      console.error(`❌ Error handling database error:`, handlingError);
      throw handlingError;
    }
  }

  /**
   * Handle data truncation errors
   */
  async handleDataTruncation(operation, error, data) {
    try {
      console.log(`✂️  Handling data truncation for operation ${operation}`);
      
      // Try to fix common truncation issues
      if (operation === 'UPDATE_JOB_STATUS' && data.status) {
        // Fix invalid ENUM values
        const validStatuses = ['pending', 'running', 'completed', 'failed', 'paused'];
        if (!validStatuses.includes(data.status)) {
          data.status = 'failed';
          console.log(`🔧 Fixed invalid status to 'failed'`);
        }
      }
      
      // Truncate long text fields
      if (data.errorMessage && data.errorMessage.length > 1000) {
        data.errorMessage = data.errorMessage.substring(0, 997) + '...';
        console.log(`🔧 Truncated error message to fit database constraint`);
      }
      
      return {
        action: 'RETRY_WITH_FIXED_DATA',
        fixedData: data,
        message: 'Data truncation fixed, retrying operation'
      };
      
    } catch (error) {
      console.error(`❌ Error handling data truncation:`, error);
      throw error;
    }
  }

  /**
   * Handle foreign key constraint errors
   */
  async handleForeignKeyError(operation, error, data) {
    try {
      console.log(`🔗 Handling foreign key error for operation ${operation}`);
      
      if (operation === 'CREATE_JOB' && data.userId) {
        // Check if user exists
        const userExists = await query('SELECT id FROM users WHERE id = ?', [data.userId]);
        
        if (userExists.length === 0) {
          console.log(`👤 User ${data.userId} not found, creating user record`);
          // Create missing user record
          await this.createMissingUser(data.userId);
        }
      }
      
      if (operation === 'ASSIGN_ACCOUNT' && data.accountId) {
        // Check if LinkedIn account exists
        const accountExists = await query('SELECT id FROM linkedin_accounts WHERE id = ?', [data.accountId]);
        
        if (accountExists.length === 0) {
          console.log(`📧 LinkedIn account ${data.accountId} not found`);
          return {
            action: 'FAIL_OPERATION',
            message: 'Referenced LinkedIn account does not exist'
          };
        }
      }
      
      return {
        action: 'RETRY_OPERATION',
        message: 'Foreign key constraint resolved, retrying'
      };
      
    } catch (error) {
      console.error(`❌ Error handling foreign key error:`, error);
      throw error;
    }
  }

  /**
   * Log error to database
   */
  async logError(errorType, errorData) {
    try {
      const errorId = uuidv4();
      
      await query(`
        INSERT INTO error_logs (
          id, error_type, error_message, error_data, 
          severity, created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())
      `, [
        errorId,
        errorType,
        errorData.errorMessage || 'Unknown error',
        JSON.stringify(errorData),
        errorData.severity || 'MEDIUM'
      ]);
      
      console.log(`📝 Error logged with ID: ${errorId}`);
      return errorId;
      
    } catch (error) {
      console.error(`❌ Failed to log error:`, error);
      // Don't throw here to avoid infinite loops
      return null;
    }
  }

  /**
   * Pause job for manual intervention
   */
  async pauseJobForManualIntervention(jobId, reason) {
    try {
      await query(`
        UPDATE scraping_jobs 
        SET status = 'paused', error_message = ?, updated_at = NOW()
        WHERE id = ?
      `, [reason, jobId]);
      
      console.log(`⏸️  Job ${jobId} paused for manual intervention: ${reason}`);
      
      return {
        action: 'PAUSE_FOR_MANUAL_INTERVENTION',
        message: reason
      };
      
    } catch (error) {
      console.error(`❌ Error pausing job:`, error);
      throw error;
    }
  }

  /**
   * Get retry count for a specific error type
   */
  async getRetryCount(jobId, errorType) {
    try {
      const result = await query(`
        SELECT COUNT(*) as count
        FROM error_logs 
        WHERE JSON_EXTRACT(error_data, '$.jobId') = ? 
          AND error_type = ?
          AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      `, [jobId, errorType]);
      
      return result[0]?.count || 0;
      
    } catch (error) {
      console.error(`❌ Error getting retry count:`, error);
      return 0;
    }
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(jobId, errorType) {
    // This is handled automatically by logging errors
    // Each error log entry represents a retry attempt
    return true;
  }

  /**
   * Request fresh cookies from extension
   */
  async requestFreshCookies(accountId, workerId) {
    try {
      console.log(`🍪 Requesting fresh cookies for account ${accountId}`);
      
      // Update account status
      await query(`
        UPDATE linkedin_accounts 
        SET last_cookie_refresh = NOW(), updated_at = NOW()
        WHERE id = ?
      `, [accountId]);
      
      // In a real implementation, this would communicate with the extension
      // For now, we'll just log the request
      console.log(`📡 Cookie refresh request sent for account ${accountId}`);
      
      return true;
      
    } catch (error) {
      console.error(`❌ Error requesting fresh cookies:`, error);
      throw error;
    }
  }

  /**
   * Check extension status
   */
  async checkExtensionStatus(accountId) {
    try {
      // In a real implementation, this would ping the extension
      // For now, we'll simulate a response
      return {
        responsive: true,
        lastSeen: new Date(),
        version: '1.0.0'
      };
      
    } catch (error) {
      console.error(`❌ Error checking extension status:`, error);
      return {
        responsive: false,
        error: error.message
      };
    }
  }
}

module.exports = ErrorHandlingService;