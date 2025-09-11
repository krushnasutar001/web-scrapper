/**
 * Job Manager Service
 * Handles job creation, execution, status tracking, and result management
 */

const LinkedInScraper = require('./linkedin-scraper');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class JobManager {
  constructor(database) {
    this.db = database;
    this.activeJobs = new Map();
    this.jobQueue = [];
    this.isProcessing = false;
  }

  async createJob(jobData) {
    const {
      jobName,
      jobType,
      urls,
      searchQuery,
      accountSelectionMode,
      selectedAccountIds,
      userId
    } = jobData;

    console.log(`📝 Creating new job: ${jobName}`);

    // Generate job ID
    const jobId = uuidv4();
    const createdAt = new Date();

    try {
      // Insert job into database
      const jobQuery = `
        INSERT INTO scraping_jobs (
          id, user_id, job_name, job_type, status, 
          account_selection_mode, selected_account_ids,
          search_query, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `;

      await this.db.execute(jobQuery, [
        jobId,
        userId,
        jobName,
        jobType,
        accountSelectionMode,
        JSON.stringify(selectedAccountIds || []),
        searchQuery || null,
        createdAt,
        createdAt
      ]);

      // Insert URLs into database
      if (urls && urls.length > 0) {
        const urlQuery = `
          INSERT INTO job_urls (id, job_id, url, status, created_at)
          VALUES (?, ?, ?, 'pending', ?)
        `;

        for (const url of urls) {
          const urlId = uuidv4();
          await this.db.execute(urlQuery, [urlId, jobId, url, createdAt]);
        }
      }

      console.log(`✅ Job created successfully: ${jobId}`);

      // Add job to processing queue
      this.jobQueue.push(jobId);
      this.processQueue();

      return {
        success: true,
        jobId,
        message: 'Job created successfully',
        status: 'pending',
        urls_count: urls ? urls.length : 0
      };

    } catch (error) {
      console.error(`❌ Failed to create job:`, error);
      throw new Error(`Failed to create job: ${error.message}`);
    }
  }

  async processQueue() {
    if (this.isProcessing || this.jobQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Processing job queue (${this.jobQueue.length} jobs pending)`);

    while (this.jobQueue.length > 0) {
      const jobId = this.jobQueue.shift();
      await this.executeJob(jobId);
    }

    this.isProcessing = false;
    console.log(`✅ Job queue processing completed`);
  }

  async executeJob(jobId) {
    console.log(`🚀 Executing job: ${jobId}`);

    try {
      // Update job status to running
      await this.updateJobStatus(jobId, 'running', { started_at: new Date() });

      // Get job details
      const job = await this.getJobDetails(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Get account for scraping
      const account = await this.selectAccount(job);
      if (!account) {
        throw new Error('No available LinkedIn account found');
      }

      console.log(`🔧 Using account: ${account.account_name}`);

      // Get URLs to scrape
      const urls = await this.getJobUrls(jobId);
      if (urls.length === 0) {
        throw new Error('No URLs found for scraping');
      }

      console.log(`📋 Processing ${urls.length} URLs`);

      // Initialize scraper
      const scraper = new LinkedInScraper({
        headless: true,
        timeout: 30000
      });

      await scraper.initialize();

      // Inject account cookies
      if (account.session_cookie) {
        await scraper.injectCookies(account.session_cookie);
      }

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      // Process each URL
      for (const urlRecord of urls) {
        try {
          console.log(`🔍 Processing URL: ${urlRecord.url}`);

          // Update URL status to processing
          await this.updateUrlStatus(urlRecord.id, 'processing');

          let result;
          if (urlRecord.url.includes('/in/')) {
            // Profile URL
            result = await scraper.scrapeProfile(urlRecord.url, account);
          } else if (urlRecord.url.includes('/company/')) {
            // Company URL
            result = await scraper.scrapeCompany(urlRecord.url, account);
          } else {
            throw new Error('Unknown URL type');
          }

          // Save result to database
          await this.saveScrapingResult(jobId, urlRecord.id, result);

          if (result.status === 'success') {
            successCount++;
            await this.updateUrlStatus(urlRecord.id, 'completed');
          } else {
            failureCount++;
            await this.updateUrlStatus(urlRecord.id, 'failed', result.error);
          }

          results.push(result);

          // Add delay between requests to be more human-like
          await this.randomDelay(2000, 5000);

        } catch (error) {
          console.error(`❌ Failed to process URL ${urlRecord.url}:`, error.message);
          failureCount++;
          await this.updateUrlStatus(urlRecord.id, 'failed', error.message);
          
          results.push({
            url: urlRecord.url,
            status: 'failed',
            error: error.message,
            scraped_at: new Date().toISOString()
          });
        }
      }

      // Close scraper
      await scraper.close();

      // Update job status to completed
      await this.updateJobStatus(jobId, 'completed', {
        completed_at: new Date(),
        success_count: successCount,
        failure_count: failureCount,
        total_urls: urls.length
      });

      console.log(`✅ Job completed: ${jobId} (${successCount} success, ${failureCount} failed)`);

      return {
        success: true,
        jobId,
        results,
        summary: {
          total: urls.length,
          success: successCount,
          failed: failureCount
        }
      };

    } catch (error) {
      console.error(`❌ Job execution failed: ${jobId}`, error);
      
      await this.updateJobStatus(jobId, 'failed', {
        failed_at: new Date(),
        error_message: error.message
      });

      throw error;
    }
  }

  async getJobDetails(jobId) {
    const query = 'SELECT * FROM scraping_jobs WHERE id = ?';
    const [rows] = await this.db.execute(query, [jobId]);
    return rows[0] || null;
  }

  async getJobUrls(jobId) {
    const query = 'SELECT * FROM job_urls WHERE job_id = ? ORDER BY created_at';
    const [rows] = await this.db.execute(query, [jobId]);
    return rows;
  }

  async selectAccount(job) {
    let query;
    let params;

    if (job.account_selection_mode === 'specific' && job.selected_account_ids) {
      const accountIds = JSON.parse(job.selected_account_ids);
      const placeholders = accountIds.map(() => '?').join(',');
      query = `
        SELECT * FROM linkedin_accounts 
        WHERE id IN (${placeholders}) AND validation_status = 'ACTIVE'
        ORDER BY last_used_at ASC NULLS FIRST
        LIMIT 1
      `;
      params = accountIds;
    } else {
      // Auto rotation - select least recently used active account
      query = `
        SELECT * FROM linkedin_accounts 
        WHERE user_id = ? AND validation_status = 'ACTIVE'
        ORDER BY last_used_at ASC NULLS FIRST
        LIMIT 1
      `;
      params = [job.user_id];
    }

    const [rows] = await this.db.execute(query, params);
    const account = rows[0] || null;

    if (account) {
      // Update last_used_at
      await this.db.execute(
        'UPDATE linkedin_accounts SET last_used_at = ? WHERE id = ?',
        [new Date(), account.id]
      );
    }

    return account;
  }

  async updateJobStatus(jobId, status, additionalData = {}) {
    const updateFields = ['status = ?', 'updated_at = ?'];
    const values = [status, new Date()];

    // Add additional fields
    Object.entries(additionalData).forEach(([key, value]) => {
      updateFields.push(`${key} = ?`);
      values.push(value);
    });

    values.push(jobId);

    const query = `UPDATE scraping_jobs SET ${updateFields.join(', ')} WHERE id = ?`;
    await this.db.execute(query, values);

    console.log(`📊 Job ${jobId} status updated to: ${status}`);
  }

  async updateUrlStatus(urlId, status, errorMessage = null) {
    const query = `
      UPDATE job_urls 
      SET status = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `;
    await this.db.execute(query, [status, errorMessage, new Date(), urlId]);
  }

  async saveScrapingResult(jobId, urlId, result) {
    const resultId = uuidv4();
    
    const query = `
      INSERT INTO scraping_results (
        id, job_id, url_id, url, status, data, 
        html_file, error_message, scraped_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.execute(query, [
      resultId,
      jobId,
      urlId,
      result.url,
      result.status,
      JSON.stringify(result.data || {}),
      result.html_file || null,
      result.error || null,
      result.scraped_at,
      new Date()
    ]);

    console.log(`💾 Scraping result saved: ${result.url}`);
  }

  async getJobResults(jobId, format = 'json') {
    const query = `
      SELECT sr.*, ju.url as original_url
      FROM scraping_results sr
      JOIN job_urls ju ON sr.url_id = ju.id
      WHERE sr.job_id = ?
      ORDER BY sr.created_at
    `;

    const [rows] = await this.db.execute(query, [jobId]);
    
    if (format === 'json') {
      return rows.map(row => ({
        ...row,
        data: JSON.parse(row.data || '{}')
      }));
    }

    return rows;
  }

  async generateResultsFile(jobId, format = 'csv') {
    const results = await this.getJobResults(jobId);
    const job = await this.getJobDetails(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `job_${jobId}_results_${timestamp}.${format}`;
    const resultsDir = path.join(__dirname, '..', 'results');
    
    // Ensure directory exists
    await fs.mkdir(resultsDir, { recursive: true });
    
    const filePath = path.join(resultsDir, filename);

    if (format === 'csv') {
      await this.generateCSV(results, filePath);
    } else if (format === 'json') {
      await this.generateJSON(results, filePath);
    } else if (format === 'excel') {
      await this.generateExcel(results, filePath);
    }

    return {
      filename,
      filePath,
      size: (await fs.stat(filePath)).size,
      recordCount: results.length
    };
  }

  async generateCSV(results, filePath) {
    if (results.length === 0) {
      await fs.writeFile(filePath, 'No results found\n');
      return;
    }

    // Get all unique keys from all data objects
    const allKeys = new Set();
    results.forEach(result => {
      if (result.data) {
        Object.keys(result.data).forEach(key => allKeys.add(key));
      }
    });

    const headers = ['url', 'status', 'scraped_at', ...Array.from(allKeys)];
    const csvContent = [headers.join(',')];

    results.forEach(result => {
      const row = [
        `"${result.url}"`,
        `"${result.status}"`,
        `"${result.scraped_at}"`,
        ...Array.from(allKeys).map(key => {
          const value = result.data?.[key] || '';
          return `"${String(value).replace(/"/g, '""')}"`;
        })
      ];
      csvContent.push(row.join(','));
    });

    await fs.writeFile(filePath, csvContent.join('\n'));
  }

  async generateJSON(results, filePath) {
    const jsonData = {
      generated_at: new Date().toISOString(),
      total_results: results.length,
      results: results.map(result => ({
        url: result.url,
        status: result.status,
        scraped_at: result.scraped_at,
        data: result.data
      }))
    };

    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
  }

  async generateExcel(results, filePath) {
    // For now, generate CSV with .xlsx extension
    // In a full implementation, you'd use a library like 'xlsx'
    await this.generateCSV(results, filePath);
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async getJobStatus(jobId) {
    const job = await this.getJobDetails(jobId);
    if (!job) {
      return null;
    }

    const urlsQuery = `
      SELECT status, COUNT(*) as count 
      FROM job_urls 
      WHERE job_id = ? 
      GROUP BY status
    `;
    const [urlStats] = await this.db.execute(urlsQuery, [jobId]);

    const stats = {};
    urlStats.forEach(stat => {
      stats[stat.status] = stat.count;
    });

    return {
      ...job,
      url_stats: stats,
      selected_account_ids: JSON.parse(job.selected_account_ids || '[]')
    };
  }
}

module.exports = JobManager;