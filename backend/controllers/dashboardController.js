const Job = require('../models/Job');
const LinkedInAccount = require('../models/LinkedInAccount');
const { query } = require('../utils/database');

/**
 * Get dashboard statistics for the authenticated user
 */
const getDashboardStats = async (req, res) => {
  try {
    const user = req.user;
    
    console.log('📊 Starting dashboard stats calculation for user:', user.id);
    
    // Get job statistics
    console.log('📊 Fetching job stats...');
    const jobStats = await Job.getStatsByUserId(user.id);
    console.log('📊 Job stats result:', jobStats);
    
    // Get account statistics
    console.log('📊 Fetching account stats...');
    const accountStats = await getAccountStats(user.id);
    console.log('📊 Account stats result:', accountStats);
    
    // Get recent jobs
    console.log('📊 Fetching recent jobs...');
    const recentJobs = await Job.getRecentByUserId(user.id, 5);
    console.log('📊 Recent jobs count:', recentJobs ? recentJobs.length : 0);
    
    // Calculate additional metrics
    const stats = {
      // Job metrics
      totalJobs: jobStats.completed_jobs || 0, // Show completed jobs as requested
      activeJobs: jobStats.active_jobs || 0,
      pendingJobs: jobStats.pending_jobs || 0,
      failedJobs: jobStats.failed_jobs || 0,
      totalResults: jobStats.total_results || 0,
      successRate: jobStats.success_rate || 0,
      
      // Account metrics
      totalAccounts: accountStats.total_accounts || 0,
      activeAccounts: accountStats.active_accounts || 0,
      
      // URL processing metrics
      totalUrlsProcessed: jobStats.total_urls_processed || 0,
      
      // Recent activity
      recentJobs: recentJobs.map(job => ({
        id: job.id,
        job_name: job.job_name,
        job_type: job.job_type,
        status: job.status,
        result_count: job.result_count || 0,
        total_urls: job.total_urls || 0,
        created_at: job.created_at,
        completed_at: job.completed_at
      }))
    };
    
    console.log('📊 Dashboard stats calculated:', {
      totalJobs: stats.totalJobs,
      activeJobs: stats.activeJobs,
      totalResults: stats.totalResults,
      successRate: stats.successRate,
      totalAccounts: stats.totalAccounts
    });
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Error calculating dashboard stats:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to calculate dashboard statistics',
      code: 'DASHBOARD_STATS_ERROR'
    });
  }
};

/**
 * Get account statistics for a user
 */
const getAccountStats = async (userId) => {
  try {
    const sql = `
      SELECT 
        COUNT(*) as total_accounts,
        COUNT(CASE WHEN is_active = TRUE AND validation_status = 'ACTIVE' THEN 1 END) as active_accounts,
        COUNT(CASE WHEN validation_status = 'PENDING' THEN 1 END) as pending_accounts,
        COUNT(CASE WHEN validation_status = 'BLOCKED' THEN 1 END) as blocked_accounts,
        SUM(requests_today) as total_requests_today,
        AVG(requests_today) as avg_requests_per_account
      FROM linkedin_accounts 
      WHERE user_id = ?
    `;
    
    const results = await query(sql, [userId]);
    return results[0] || {
      total_accounts: 0,
      active_accounts: 0,
      pending_accounts: 0,
      blocked_accounts: 0,
      total_requests_today: 0,
      avg_requests_per_account: 0
    };
  } catch (error) {
    console.error('❌ Error getting account stats:', error);
    throw error;
  }
};

/**
 * Get job performance analytics
 */
const getJobAnalytics = async (req, res) => {
  try {
    const user = req.user;
    const { period = '7d' } = req.query; // 7d, 30d, 90d
    
    console.log('📈 Getting job analytics for user:', user.id, 'period:', period);
    
    // Calculate date range
    let dateFilter = '';
    switch (period) {
      case '7d':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case '30d':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case '90d':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
        break;
      default:
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
    }
    
    // Get job trends by day
    const trendsSql = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as jobs_created,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as jobs_completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as jobs_failed,
        SUM(result_count) as total_results
      FROM jobs 
      WHERE user_id = ? ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    const trends = await query(trendsSql, [user.id]);
    
    // Get job type distribution
    const distributionSql = `
      SELECT 
        job_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        SUM(result_count) as total_results,
        AVG(result_count) as avg_results
      FROM jobs 
      WHERE user_id = ? ${dateFilter}
      GROUP BY job_type
    `;
    
    const distribution = await query(distributionSql, [user.id]);
    
    // Get performance metrics
    const performanceSql = `
      SELECT 
        AVG(TIMESTAMPDIFF(MINUTE, started_at, completed_at)) as avg_completion_time_minutes,
        AVG(result_count / total_urls) as avg_success_rate_per_url,
        MAX(result_count) as max_results_per_job,
        MIN(result_count) as min_results_per_job
      FROM jobs 
      WHERE user_id = ? 
        AND status = 'completed' 
        AND started_at IS NOT NULL 
        AND completed_at IS NOT NULL
        AND total_urls > 0
        ${dateFilter}
    `;
    
    const performance = await query(performanceSql, [user.id]);
    
    const analytics = {
      period,
      trends,
      distribution,
      performance: performance[0] || {
        avg_completion_time_minutes: 0,
        avg_success_rate_per_url: 0,
        max_results_per_job: 0,
        min_results_per_job: 0
      }
    };
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error('❌ Error getting job analytics:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get job analytics',
      code: 'JOB_ANALYTICS_ERROR'
    });
  }
};

/**
 * Get account performance analytics
 */
const getAccountAnalytics = async (req, res) => {
  try {
    const user = req.user;
    
    console.log('📈 Getting account analytics for user:', user.id);
    
    // Get account usage statistics
    const usageSql = `
      SELECT 
        la.id,
        la.account_name,
        la.email,
        la.requests_today,
        la.daily_request_limit,
        la.validation_status,
        COUNT(jaa.job_id) as jobs_assigned,
        COUNT(CASE WHEN j.status = 'completed' THEN 1 END) as jobs_completed
      FROM linkedin_accounts la
      LEFT JOIN job_account_assignments jaa ON la.id = jaa.linkedin_account_id
      LEFT JOIN jobs j ON jaa.job_id = j.id
      WHERE la.user_id = ?
      GROUP BY la.id
      ORDER BY jobs_completed DESC, requests_today DESC
    `;
    
    const accountUsage = await query(usageSql, [user.id]);
    
    // Calculate account efficiency
    const efficiency = accountUsage.map(account => ({
      ...account,
      usage_percentage: Math.round((account.requests_today / account.daily_request_limit) * 100),
      completion_rate: account.jobs_assigned > 0 
        ? Math.round((account.jobs_completed / account.jobs_assigned) * 100) 
        : 0
    }));
    
    res.json({
      success: true,
      data: {
        accounts: efficiency,
        summary: {
          total_accounts: efficiency.length,
          active_accounts: efficiency.filter(acc => acc.validation_status === 'ACTIVE').length,
          total_requests_today: efficiency.reduce((sum, acc) => sum + acc.requests_today, 0),
          avg_usage_percentage: efficiency.length > 0 
            ? Math.round(efficiency.reduce((sum, acc) => sum + acc.usage_percentage, 0) / efficiency.length)
            : 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting account analytics:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get account analytics',
      code: 'ACCOUNT_ANALYTICS_ERROR'
    });
  }
};

/**
 * Get real-time system status
 */
const getSystemStatus = async (req, res) => {
  try {
    const user = req.user;
    
    console.log('🔍 Getting system status for user:', user.id);
    
    // Get current running jobs
    const runningJobs = await Job.findByUserId(user.id, { status: 'running' });
    
    // Get available accounts
    const availableAccounts = await LinkedInAccount.findAvailableByUserId(user.id);
    
    // Get recent activity (last 24 hours)
    const recentActivitySql = `
      SELECT 
        'job_created' as activity_type,
        job_name as description,
        created_at as timestamp
      FROM jobs 
      WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      
      UNION ALL
      
      SELECT 
        'job_completed' as activity_type,
        CONCAT(job_name, ' - ', result_count, ' results') as description,
        completed_at as timestamp
      FROM jobs 
      WHERE user_id = ? AND status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      
      ORDER BY timestamp DESC
      LIMIT 10
    `;
    
    const recentActivity = await query(recentActivitySql, [user.id, user.id]);
    
    const systemStatus = {
      running_jobs: runningJobs.length,
      available_accounts: availableAccounts.length,
      queue_status: 'healthy', // This would come from your job queue system
      recent_activity: recentActivity,
      last_updated: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: systemStatus
    });
    
  } catch (error) {
    console.error('❌ Error getting system status:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      code: 'SYSTEM_STATUS_ERROR'
    });
  }
};

/**
 * Export dashboard data
 */
const exportDashboardData = async (req, res) => {
  try {
    const user = req.user;
    const { format = 'json', period = '30d' } = req.query;
    
    console.log('📥 Exporting dashboard data for user:', user.id, 'format:', format);
    
    // Get comprehensive data
    const [jobStats, accountStats, recentJobs] = await Promise.all([
      Job.getStatsByUserId(user.id),
      getAccountStats(user.id),
      Job.getRecentByUserId(user.id, 50)
    ]);
    
    const exportData = {
      user_id: user.id,
      export_date: new Date().toISOString(),
      period,
      statistics: {
        jobs: jobStats,
        accounts: accountStats
      },
      recent_jobs: recentJobs.map(job => job.toJSON())
    };
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = require('csv-stringify');
      const csvData = [];
      
      // Add headers
      csvData.push(['Metric', 'Value']);
      csvData.push(['Total Jobs', jobStats.total_jobs]);
      csvData.push(['Completed Jobs', jobStats.completed_jobs]);
      csvData.push(['Active Jobs', jobStats.active_jobs]);
      csvData.push(['Total Results', jobStats.total_results]);
      csvData.push(['Success Rate', jobStats.success_rate + '%']);
      csvData.push(['Total Accounts', accountStats.total_accounts]);
      csvData.push(['Active Accounts', accountStats.active_accounts]);
      
      csv.stringify(csvData, (err, output) => {
        if (err) throw err;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="dashboard_stats_${user.id}.csv"`);
        res.send(output);
      });
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="dashboard_stats_${user.id}.json"`);
      res.json(exportData);
    }
    
  } catch (error) {
    console.error('❌ Error exporting dashboard data:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to export dashboard data',
      code: 'EXPORT_ERROR'
    });
  }
};

module.exports = {
  getDashboardStats,
  getJobAnalytics,
  getAccountAnalytics,
  getSystemStatus,
  exportDashboardData
};
