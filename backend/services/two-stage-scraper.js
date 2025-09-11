const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class TwoStageScraper {
  constructor(db) {
    this.db = db;
    this.browsers = new Map(); // Account ID -> Browser instance
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 Two-Stage Scraper Service Started');
    
    // Start job processor
    this.processJobs();
  }

  async stop() {
    this.isRunning = false;
    
    // Close all browsers
    for (const [accountId, browser] of this.browsers) {
      try {
        await browser.close();
        console.log(`🔒 Closed browser for account: ${accountId}`);
      } catch (error) {
        console.error(`❌ Error closing browser for ${accountId}:`, error.message);
      }
    }
    this.browsers.clear();
    
    console.log('🛑 Two-Stage Scraper Service Stopped');
  }

  async processJobs() {
    while (this.isRunning) {
      try {
        // Get pending jobs
        const [jobs] = await this.db.execute(`
          SELECT j.*, a.session_cookie as cookies, a.proxy_url as account_proxy
          FROM scraping_jobs j
          LEFT JOIN linkedin_accounts a ON j.account_id = a.id
          WHERE j.status = 'pending' AND j.stage = 'fetcher'
          ORDER BY j.priority DESC, j.created_at ASC
          LIMIT 1
        `);

        if (jobs.length > 0) {
          const job = jobs[0];
          await this.processJob(job);
        }

        // Check for parsing jobs
        const [parseJobs] = await this.db.execute(`
          SELECT * FROM scraping_jobs
          WHERE status = 'pending' AND stage = 'parser'
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
        `);

        if (parseJobs.length > 0) {
          const job = parseJobs[0];
          await this.parseJob(job);
        }

        // Wait before next iteration
        await this.sleep(5000);
      } catch (error) {
        console.error('❌ Error in job processor:', error);
        await this.sleep(10000);
      }
    }
  }

  async processJob(job) {
    console.log(`🔄 Processing job: ${job.job_name} (${job.job_type})`);
    
    try {
      // Update job status
      await this.updateJobStatus(job.id, 'fetching', 'fetcher');
      
      // Get or create browser for account
      const browser = await this.getBrowserForAccount(job.account_id, job.cookies, job.account_proxy || job.proxy_url);
      
      // Process based on job type
      switch (job.job_type) {
        case 'profiles':
          await this.fetchProfiles(job, browser);
          break;
        case 'companies':
          await this.fetchCompanies(job, browser);
          break;
        case 'sales_navigator':
          await this.fetchSalesNavigator(job, browser);
          break;
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }
      
      // Move to parser stage
      await this.updateJobStatus(job.id, 'pending', 'parser');
      
    } catch (error) {
      console.error(`❌ Error processing job ${job.id}:`, error);
      await this.updateJobStatus(job.id, 'failed', 'fetcher', error.message);
    }
  }

  async fetchProfiles(job, browser) {
    const inputData = JSON.parse(job.input_data);
    const urls = inputData.urls || [];
    
    console.log(`📋 Fetching ${urls.length} LinkedIn profiles`);
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      try {
        console.log(`🔍 Fetching profile ${i + 1}/${urls.length}: ${url}`);
        
        const page = await browser.newPage();
        
        // Navigate to profile
        await page.goto(url, { waitUntil: 'networkidle' });
        
        // Wait for content to load
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        // Check for captcha or ban
        const isCaptchaOrBan = await this.detectCaptchaOrBan(page);
        if (isCaptchaOrBan) {
          console.log(`🚫 Captcha or ban detected for account ${job.account_id}`);
          await this.updateJobStatus(job.id, 'failed', 'fetcher', 'Captcha or ban detected');
          throw new Error('Captcha or ban detected - stopping job');
        }
        
        // Get HTML content
        const htmlContent = await page.content();
        
        // Store HTML snapshot
        const snapshotId = uuidv4();
        await this.db.execute(`
          INSERT INTO html_snapshots (id, job_id, url, html_content, page_type, metadata)
          VALUES (?, ?, ?, ?, 'profile', ?)
        `, [snapshotId, job.id, url, htmlContent, JSON.stringify({ index: i })]);
        
        await page.close();
        
        // Update progress
        await this.updateJobProgress(job.id, i + 1, urls.length, i + 1, 0);
        
        // Randomized delay between actions (5-15s as specified)
        const delay = 5000 + Math.random() * 10000; // 5-15 seconds
        console.log(`⏱️ Waiting ${Math.round(delay/1000)}s before next action...`);
        await this.sleep(delay);
        
      } catch (error) {
        console.error(`❌ Error fetching profile ${url}:`, error.message);
        
        // Store failed snapshot
        const snapshotId = uuidv4();
        await this.db.execute(`
          INSERT INTO html_snapshots (id, job_id, url, html_content, page_type, status, metadata)
          VALUES (?, ?, ?, ?, 'profile', 'failed', ?)
        `, [snapshotId, job.id, url, `Error: ${error.message}`, JSON.stringify({ index: i, error: error.message })]);
      }
    }
  }

  async fetchCompanies(job, browser) {
    const inputData = JSON.parse(job.input_data);
    const urls = inputData.urls || [];
    
    console.log(`🏢 Fetching ${urls.length} LinkedIn companies`);
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      try {
        console.log(`🔍 Fetching company ${i + 1}/${urls.length}: ${url}`);
        
        const page = await browser.newPage();
        
        // Navigate to company page
        await page.goto(url, { waitUntil: 'networkidle' });
        
        // Wait for content to load
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        // Get HTML content
        const htmlContent = await page.content();
        
        // Store HTML snapshot
        const snapshotId = uuidv4();
        await this.db.execute(`
          INSERT INTO html_snapshots (id, job_id, url, html_content, page_type, metadata)
          VALUES (?, ?, ?, ?, 'company', ?)
        `, [snapshotId, job.id, url, htmlContent, JSON.stringify({ index: i })]);
        
        await page.close();
        
        // Update progress
        await this.updateJobProgress(job.id, i + 1, urls.length, i + 1, 0);
        
        // Randomized delay between actions (5-15s as specified)
        const delay = 5000 + Math.random() * 10000; // 5-15 seconds
        console.log(`⏱️ Waiting ${Math.round(delay/1000)}s before next action...`);
        await this.sleep(delay);
        
      } catch (error) {
        console.error(`❌ Error fetching company ${url}:`, error.message);
        
        // Store failed snapshot
        const snapshotId = uuidv4();
        await this.db.execute(`
          INSERT INTO html_snapshots (id, job_id, url, html_content, page_type, status, metadata)
          VALUES (?, ?, ?, ?, 'company', 'failed', ?)
        `, [snapshotId, job.id, url, `Error: ${error.message}`, JSON.stringify({ index: i, error: error.message })]);
      }
    }
  }

  async fetchSalesNavigator(job, browser) {
    const inputData = JSON.parse(job.input_data);
    const searchUrls = inputData.urls || [inputData.searchQuery];
    
    console.log(`🔍 Fetching ${searchUrls.length} Sales Navigator searches`);
    
    for (let i = 0; i < searchUrls.length; i++) {
      const searchUrl = searchUrls[i];
      
      try {
        console.log(`🔍 Fetching search ${i + 1}/${searchUrls.length}: ${searchUrl}`);
        
        const page = await browser.newPage();
        
        // Navigate to search results
        await page.goto(searchUrl, { waitUntil: 'networkidle' });
        
        let pageNumber = 1;
        let hasNextPage = true;
        
        while (hasNextPage && pageNumber <= (inputData.maxPages || 5)) {
          console.log(`📄 Processing page ${pageNumber}`);
          
          // Wait for results to load
          await page.waitForTimeout(3000 + Math.random() * 2000);
          
          // Get HTML content
          const htmlContent = await page.content();
          
          // Store HTML snapshot
          const snapshotId = uuidv4();
          await this.db.execute(`
            INSERT INTO html_snapshots (id, job_id, url, html_content, page_type, metadata)
            VALUES (?, ?, ?, ?, 'search_results', ?)
          `, [snapshotId, job.id, searchUrl, htmlContent, JSON.stringify({ 
            searchIndex: i, 
            pageNumber: pageNumber 
          })]);
          
          // Try to click next page
          try {
            const nextButton = await page.$('button[aria-label="Next"]');
            if (nextButton && await nextButton.isEnabled()) {
              await nextButton.click();
              await page.waitForTimeout(2000 + Math.random() * 3000);
              pageNumber++;
            } else {
              hasNextPage = false;
            }
          } catch (error) {
            console.log('📄 No more pages available');
            hasNextPage = false;
          }
        }
        
        await page.close();
        
        // Update progress
        await this.updateJobProgress(job.id, i + 1, searchUrls.length, i + 1, 0);
        
        // Randomized delay between actions (5-15s as specified)
        const delay = 5000 + Math.random() * 10000; // 5-15 seconds
        console.log(`⏱️ Waiting ${Math.round(delay/1000)}s before next action...`);
        await this.sleep(delay);
        
      } catch (error) {
        console.error(`❌ Error fetching search ${searchUrl}:`, error.message);
        
        // Store failed snapshot
        const snapshotId = uuidv4();
        await this.db.execute(`
          INSERT INTO html_snapshots (id, job_id, url, html_content, page_type, status, metadata)
          VALUES (?, ?, ?, ?, 'search_results', 'failed', ?)
        `, [snapshotId, job.id, searchUrl, `Error: ${error.message}`, JSON.stringify({ 
          searchIndex: i, 
          error: error.message 
        })]);
      }
    }
  }

  async parseJob(job) {
    console.log(`🔍 Parsing job: ${job.job_name} (${job.job_type})`);
    
    try {
      // Update job status
      await this.updateJobStatus(job.id, 'parsing', 'parser');
      
      // Get HTML snapshots for this job
      const [snapshots] = await this.db.execute(`
        SELECT * FROM html_snapshots 
        WHERE job_id = ? AND status = 'fetched'
        ORDER BY created_at ASC
      `, [job.id]);
      
      console.log(`📋 Found ${snapshots.length} HTML snapshots to parse`);
      
      // Process based on job type
      switch (job.job_type) {
        case 'profiles':
          await this.parseProfiles(job, snapshots);
          break;
        case 'companies':
          await this.parseCompanies(job, snapshots);
          break;
        case 'sales_navigator':
          await this.parseSalesNavigator(job, snapshots);
          break;
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }
      
      // Complete job
      await this.updateJobStatus(job.id, 'completed', 'completed');
      
    } catch (error) {
      console.error(`❌ Error parsing job ${job.id}:`, error);
      await this.updateJobStatus(job.id, 'failed', 'parser', error.message);
    }
  }

  async parseProfiles(job, snapshots) {
    const ProfileParser = require('./parsers/profile-parser');
    const parser = new ProfileParser();
    
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      
      try {
        console.log(`🔍 Parsing profile ${i + 1}/${snapshots.length}: ${snapshot.url}`);
        
        const profileData = await parser.parse(snapshot.html_content, snapshot.url);
        
        // Store parsed result
        await this.db.execute(`
          INSERT INTO profile_results (
            id, job_id, snapshot_id, profile_url, full_name, first_name, last_name,
            headline, about, last_activity, country, city, industry, email, phone, website,
            current_job_title, current_job_start, current_job_end, current_job_location,
            current_job_type, current_job_description, current_company_url,
            skills, education, experience, licenses_certificates, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
        `, [
          uuidv4(), job.id, snapshot.id, snapshot.url,
          profileData.fullName, profileData.firstName, profileData.lastName,
          profileData.headline, profileData.about, profileData.lastActivity,
          profileData.country, profileData.city, profileData.industry,
          profileData.email, profileData.phone, profileData.website,
          profileData.currentJob?.title, profileData.currentJob?.startDate,
          profileData.currentJob?.endDate, profileData.currentJob?.location,
          profileData.currentJob?.type, profileData.currentJob?.description,
          profileData.currentJob?.companyUrl,
          JSON.stringify(profileData.skills),
          JSON.stringify(profileData.education),
          JSON.stringify(profileData.experience),
          JSON.stringify(profileData.licensesCertificates)
        ]);
        
        // Mark snapshot as parsed
        await this.db.execute(`
          UPDATE html_snapshots SET status = 'parsed' WHERE id = ?
        `, [snapshot.id]);
        
        // Update progress
        await this.updateJobProgress(job.id, null, null, null, i + 1);
        
        // If profile has company URL, trigger company enrichment
        if (profileData.currentJob?.companyUrl) {
          await this.triggerCompanyEnrichment(job.id, profileData.currentJob.companyUrl, snapshot.id);
        }
        
      } catch (error) {
        console.error(`❌ Error parsing profile ${snapshot.url}:`, error.message);
        
        // Store failed result
        await this.db.execute(`
          INSERT INTO profile_results (id, job_id, snapshot_id, profile_url, status, error_message)
          VALUES (?, ?, ?, ?, 'failed', ?)
        `, [uuidv4(), job.id, snapshot.id, snapshot.url, error.message]);
        
        // Mark snapshot as failed
        await this.db.execute(`
          UPDATE html_snapshots SET status = 'failed' WHERE id = ?
        `, [snapshot.id]);
      }
    }
  }

  async parseCompanies(job, snapshots) {
    const CompanyParser = require('./parsers/company-parser');
    const parser = new CompanyParser();
    
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      
      try {
        console.log(`🏢 Parsing company ${i + 1}/${snapshots.length}: ${snapshot.url}`);
        
        const companyData = await parser.parse(snapshot.html_content, snapshot.url);
        
        // Store parsed result
        await this.db.execute(`
          INSERT INTO company_results (
            id, job_id, snapshot_id, company_url, company_id, company_name,
            company_industry, company_hq, company_followers, company_employee_size,
            company_website, company_type, company_specialties, company_associated_members,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
        `, [
          uuidv4(), job.id, snapshot.id, snapshot.url,
          companyData.companyId, companyData.companyName,
          companyData.industry, companyData.headquarters,
          companyData.followers, companyData.employeeSize,
          companyData.website, companyData.companyType,
          companyData.specialties, JSON.stringify(companyData.associatedMembers)
        ]);
        
        // Mark snapshot as parsed
        await this.db.execute(`
          UPDATE html_snapshots SET status = 'parsed' WHERE id = ?
        `, [snapshot.id]);
        
        // Update progress
        await this.updateJobProgress(job.id, null, null, null, i + 1);
        
      } catch (error) {
        console.error(`❌ Error parsing company ${snapshot.url}:`, error.message);
        
        // Store failed result
        await this.db.execute(`
          INSERT INTO company_results (id, job_id, snapshot_id, company_url, status, error_message)
          VALUES (?, ?, ?, ?, 'failed', ?)
        `, [uuidv4(), job.id, snapshot.id, snapshot.url, error.message]);
        
        // Mark snapshot as failed
        await this.db.execute(`
          UPDATE html_snapshots SET status = 'failed' WHERE id = ?
        `, [snapshot.id]);
      }
    }
  }

  async parseSalesNavigator(job, snapshots) {
    const SalesNavigatorParser = require('./parsers/sales-navigator-parser');
    const parser = new SalesNavigatorParser();
    
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      
      try {
        console.log(`🔍 Parsing search results ${i + 1}/${snapshots.length}: ${snapshot.url}`);
        
        const results = await parser.parse(snapshot.html_content, snapshot.url);
        const metadata = JSON.parse(snapshot.metadata || '{}');
        
        // Store each result
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          
          await this.db.execute(`
            INSERT INTO sales_navigator_results (
              id, job_id, snapshot_id, search_url, profile_url, full_name,
              headline, current_title, current_company, location, industry,
              page_number, result_position, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
          `, [
            uuidv4(), job.id, snapshot.id, snapshot.url,
            result.profileUrl, result.fullName, result.headline,
            result.currentTitle, result.currentCompany, result.location,
            result.industry, metadata.pageNumber || 1, j + 1
          ]);
        }
        
        // Mark snapshot as parsed
        await this.db.execute(`
          UPDATE html_snapshots SET status = 'parsed' WHERE id = ?
        `, [snapshot.id]);
        
        // Update progress
        await this.updateJobProgress(job.id, null, null, null, i + 1);
        
      } catch (error) {
        console.error(`❌ Error parsing search results ${snapshot.url}:`, error.message);
        
        // Store failed result
        await this.db.execute(`
          INSERT INTO sales_navigator_results (id, job_id, snapshot_id, search_url, status, error_message)
          VALUES (?, ?, ?, ?, 'failed', ?)
        `, [uuidv4(), job.id, snapshot.id, snapshot.url, error.message]);
        
        // Mark snapshot as failed
        await this.db.execute(`
          UPDATE html_snapshots SET status = 'failed' WHERE id = ?
        `, [snapshot.id]);
      }
    }
  }

  async triggerCompanyEnrichment(profileJobId, companyUrl, profileSnapshotId) {
    try {
      console.log(`🏢 Triggering company enrichment for: ${companyUrl}`);
      
      // Check if company already exists
      const [existing] = await this.db.execute(`
        SELECT id FROM company_results WHERE company_url = ? LIMIT 1
      `, [companyUrl]);
      
      if (existing.length > 0) {
        console.log('🏢 Company data already exists, skipping enrichment');
        return;
      }
      
      // Create a mini company scraping job
      const enrichmentJobId = uuidv4();
      await this.db.execute(`
        INSERT INTO scraping_jobs (
          id, job_name, job_type, status, stage, total_items,
          account_id, input_data, job_config, priority
        ) VALUES (?, ?, 'companies', 'pending', 'fetcher', 1, 
          (SELECT account_id FROM scraping_jobs WHERE id = ?),
          ?, ?, 10)
      `, [
        enrichmentJobId,
        `Company Enrichment for Profile Job`,
        profileJobId,
        JSON.stringify({ urls: [companyUrl] }),
        JSON.stringify({ 
          isEnrichment: true, 
          parentJobId: profileJobId,
          parentSnapshotId: profileSnapshotId 
        })
      ]);
      
      console.log(`✅ Created company enrichment job: ${enrichmentJobId}`);
      
    } catch (error) {
      console.error('❌ Error triggering company enrichment:', error.message);
    }
  }

  async getBrowserForAccount(accountId, cookies, proxyUrl) {
    if (this.browsers.has(accountId)) {
      return this.browsers.get(accountId);
    }
    
    console.log(`🌐 Creating browser for account: ${accountId}`);
    
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions-http-throttling'
      ]
    };
    
    // Add proxy if provided
    if (proxyUrl) {
      launchOptions.proxy = {
        server: proxyUrl
      };
    }
    
    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    // Add cookies if provided
    if (cookies) {
      try {
        const cookieData = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
        await context.addCookies(cookieData);
        console.log(`🍪 Added ${cookieData.length} cookies to browser`);
      } catch (error) {
        console.error('❌ Error adding cookies:', error.message);
      }
    }
    
    this.browsers.set(accountId, browser);
    return browser;
  }

  async updateJobStatus(jobId, status, stage, errorMessage = null) {
    const updateData = [status, stage];
    let query = 'UPDATE scraping_jobs SET status = ?, stage = ?';
    
    if (status === 'fetching' || status === 'parsing') {
      query += ', started_at = CURRENT_TIMESTAMP';
    } else if (status === 'completed' || status === 'failed') {
      query += ', completed_at = CURRENT_TIMESTAMP';
    }
    
    if (errorMessage) {
      query += ', error_message = ?';
      updateData.push(errorMessage);
    }
    
    query += ' WHERE id = ?';
    updateData.push(jobId);
    
    await this.db.execute(query, updateData);
  }

  async updateJobProgress(jobId, progress = null, totalItems = null, fetchedItems = null, parsedItems = null) {
    const updates = [];
    const values = [];
    
    if (progress !== null) {
      updates.push('progress = ?');
      values.push(progress);
    }
    if (totalItems !== null) {
      updates.push('total_items = ?');
      values.push(totalItems);
    }
    if (fetchedItems !== null) {
      updates.push('fetched_items = ?');
      values.push(fetchedItems);
    }
    if (parsedItems !== null) {
      updates.push('parsed_items = ?');
      values.push(parsedItems);
    }
    
    if (updates.length > 0) {
      values.push(jobId);
      await this.db.execute(`
        UPDATE scraping_jobs SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, values);
    }
  }

  async detectCaptchaOrBan(page) {
    try {
      const url = page.url();
      const title = await page.title();
      const content = await page.content();
      
      // Check URL patterns
      if (url.includes('/challenge/') || 
          url.includes('/captcha') || 
          url.includes('/security/challenge') ||
          url.includes('/checkpoint/challenge')) {
        return true;
      }
      
      // Check page title
      if (title.toLowerCase().includes('security challenge') ||
          title.toLowerCase().includes('please complete this security check') ||
          title.toLowerCase().includes('verify your identity')) {
        return true;
      }
      
      // Check for captcha elements
      const captchaSelectors = [
        '[data-test-id="captcha"]',
        '.captcha-container',
        '#captcha',
        '.challenge-form',
        '.security-challenge',
        '.verification-challenge'
      ];
      
      for (const selector of captchaSelectors) {
        const element = await page.$(selector);
        if (element) {
          return true;
        }
      }
      
      // Check for ban/restriction messages in content
      const banKeywords = [
        'your account has been restricted',
        'temporarily restricted',
        'unusual activity',
        'verify your identity',
        'security challenge',
        'please complete this security check'
      ];
      
      const lowerContent = content.toLowerCase();
      for (const keyword of banKeywords) {
        if (lowerContent.includes(keyword)) {
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ Error detecting captcha/ban:', error.message);
      return false; // Don't block on detection errors
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TwoStageScraper;