// Comprehensive Logging Service for Scralytics Hub
const { query } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

class LoggingService {
  /**
   * Log user activity for audit trail
   */
  static async logActivity({ userId, jobId = null, action, details = {}, ipAddress = null, userAgent = null }) {
    try {
      const id = uuidv4();
      
      const sql = `
        INSERT INTO activity_logs (
          id, user_id, job_id, action, details, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `;
      
      await query(sql, [
        id, userId, jobId, action, 
        JSON.stringify(details), ipAddress, userAgent
      ]);
      
      console.log(`📝 Activity logged: ${action} for user ${userId}`);
      
    } catch (error) {
      console.error('❌ Error logging activity:', error);
      // Don't throw - logging failures shouldn't break main functionality
    }
  }
  
  /**
   * Log errors with comprehensive details
   */
  static async logError({ jobId = null, linkedinAccountId = null, errorType, errorMessage, errorDetails = {}, retryCount = 0 }) {
    try {
      const id = uuidv4();
      
      const sql = `
        INSERT INTO error_logs (
          id, job_id, linkedin_account_id, error_type, error_message, 
          error_details, retry_count, resolved, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NOW())
      `;
      
      await query(sql, [
        id, jobId, linkedinAccountId, errorType, errorMessage,
        JSON.stringify(errorDetails), retryCount
      ]);
      
      console.log(`🚨 Error logged: ${errorType} - ${errorMessage}`);
      
      return id; // Return error log ID for potential resolution tracking
      
    } catch (error) {
      console.error('❌ Error logging error:', error);
      // Don't throw - logging failures shouldn't break main functionality
      return null;
    }
  }
  
  /**
   * Mark error as resolved
   */
  static async resolveError(errorLogId) {
    try {
      const sql = `
        UPDATE error_logs 
        SET resolved = TRUE, resolved_at = NOW() 
        WHERE id = ?
      `;
      
      await query(sql, [errorLogId]);
      
      console.log(`✅ Error resolved: ${errorLogId}`);
      
    } catch (error) {
      console.error('❌ Error resolving error log:', error);
    }
  }
  
  /**
   * Log scraping events with detailed context
   */
  static async logScrapingEvent({ jobId, linkedinAccountId, url, eventType, eventData = {}, success = true, errorMessage = null }) {
    try {
      const details = {
        url,
        eventType,
        eventData,
        success,
        errorMessage,
        timestamp: new Date().toISOString()
      };
      
      // Log as activity
      await LoggingService.logActivity({
        userId: null, // Will be filled by job context
        jobId,
        action: `SCRAPING_${eventType.toUpperCase()}`,
        details
      });
      
      // If it's an error, also log to error_logs
      if (!success && errorMessage) {
        await LoggingService.logError({
          jobId,
          linkedinAccountId,
          errorType: 'SCRAPING_ERROR',
          errorMessage,
          errorDetails: details
        });
      }
      
    } catch (error) {
      console.error('❌ Error logging scraping event:', error);
    }
  }
  
  /**
   * Log cookie-related events
   */
  static async logCookieEvent({ linkedinAccountId, eventType, success = true, errorMessage = null, cookieCount = 0 }) {
    try {
      const details = {
        eventType,
        success,
        cookieCount,
        errorMessage,
        timestamp: new Date().toISOString()
      };
      
      // Log as activity
      await LoggingService.logActivity({
        userId: null,
        jobId: null,
        action: `COOKIE_${eventType.toUpperCase()}`,
        details
      });
      
      // If it's an error, also log to error_logs
      if (!success && errorMessage) {
        await LoggingService.logError({
          jobId: null,
          linkedinAccountId,
          errorType: 'COOKIE_ERROR',
          errorMessage,
          errorDetails: details
        });
      }
      
    } catch (error) {
      console.error('❌ Error logging cookie event:', error);
    }
  }
  
  /**
   * Log login-related events
   */
  static async logLoginEvent({ linkedinAccountId, eventType, success = true, errorMessage = null, redirectUrl = null }) {
    try {
      const details = {
        eventType,
        success,
        redirectUrl,
        errorMessage,
        timestamp: new Date().toISOString()
      };
      
      // Log as activity
      await LoggingService.logActivity({
        userId: null,
        jobId: null,
        action: `LOGIN_${eventType.toUpperCase()}`,
        details
      });
      
      // If it's an error, also log to error_logs
      if (!success && errorMessage) {
        await LoggingService.logError({
          jobId: null,
          linkedinAccountId,
          errorType: 'LOGIN_ERROR',
          errorMessage,
          errorDetails: details
        });
      }
      
    } catch (error) {
      console.error('❌ Error logging login event:', error);
    }
  }
  
  /**
   * Log database constraint errors with auto-recovery attempts
   */
  static async logDatabaseError({ operation, tableName, errorCode, errorMessage, recoveryAttempted = false, recoverySuccess = false }) {
    try {
      const details = {
        operation,
        tableName,
        errorCode,
        errorMessage,
        recoveryAttempted,
        recoverySuccess,
        timestamp: new Date().toISOString()
      };
      
      await LoggingService.logError({
        jobId: null,
        linkedinAccountId: null,
        errorType: 'DB_ERROR',
        errorMessage: `${operation} failed on ${tableName}: ${errorMessage}`,
        errorDetails: details
      });
      
    } catch (error) {
      console.error('❌ Error logging database error:', error);
    }
  }
  
  /**
   * Get error statistics for monitoring
   */
  static async getErrorStats({ timeframe = '24h', errorType = null } = {}) {
    try {
      let timeCondition = '';
      switch (timeframe) {
        case '1h':
          timeCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)';
          break;
        case '24h':
          timeCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
          break;
        case '7d':
          timeCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
          break;
        default:
          timeCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
      }
      
      let sql = `
        SELECT 
          error_type,
          COUNT(*) as total_errors,
          COUNT(CASE WHEN resolved = TRUE THEN 1 END) as resolved_errors,
          COUNT(CASE WHEN resolved = FALSE THEN 1 END) as unresolved_errors,
          AVG(retry_count) as avg_retry_count,
          MAX(created_at) as last_error_at
        FROM error_logs 
        WHERE ${timeCondition}
      `;
      
      const params = [];
      
      if (errorType) {
        sql += ' AND error_type = ?';
        params.push(errorType);
      }
      
      sql += ' GROUP BY error_type ORDER BY total_errors DESC';
      
      const results = await query(sql, params);
      
      return results;
      
    } catch (error) {
      console.error('❌ Error getting error stats:', error);
      throw error;
    }
  }
  
  /**
   * Get recent activity logs for monitoring
   */
  static async getRecentActivity({ userId = null, jobId = null, limit = 50 } = {}) {
    try {
      let sql = `
        SELECT al.*, u.email as user_email, j.job_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN jobs j ON al.job_id = j.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (userId) {
        sql += ' AND al.user_id = ?';
        params.push(userId);
      }
      
      if (jobId) {
        sql += ' AND al.job_id = ?';
        params.push(jobId);
      }
      
      sql += ' ORDER BY al.created_at DESC LIMIT ?';
      params.push(limit);
      
      const results = await query(sql, params);
      
      return results;
      
    } catch (error) {
      console.error('❌ Error getting recent activity:', error);
      throw error;
    }
  }
  
  /**
   * Clean up old logs (for maintenance)
   */
  static async cleanupOldLogs({ retentionDays = 30 } = {}) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      // Clean up resolved error logs older than retention period
      const errorLogsSql = `
        DELETE FROM error_logs 
        WHERE resolved = TRUE AND created_at < ?
      `;
      
      const [errorResult] = await query(errorLogsSql, [cutoffDate]);
      
      // Clean up activity logs older than retention period
      const activityLogsSql = `
        DELETE FROM activity_logs 
        WHERE created_at < ?
      `;
      
      const [activityResult] = await query(activityLogsSql, [cutoffDate]);
      
      console.log(`🧹 Cleaned up ${errorResult.affectedRows} error logs and ${activityResult.affectedRows} activity logs`);
      
      return {
        errorLogsDeleted: errorResult.affectedRows,
        activityLogsDeleted: activityResult.affectedRows
      };
      
    } catch (error) {
      console.error('❌ Error cleaning up old logs:', error);
      throw error;
    }
  }
}

// Export both the class and individual functions for convenience
module.exports = {
  LoggingService,
  logActivity: LoggingService.logActivity,
  logError: LoggingService.logError,
  logScrapingEvent: LoggingService.logScrapingEvent,
  logCookieEvent: LoggingService.logCookieEvent,
  logLoginEvent: LoggingService.logLoginEvent,
  logDatabaseError: LoggingService.logDatabaseError,
  resolveError: LoggingService.resolveError
};