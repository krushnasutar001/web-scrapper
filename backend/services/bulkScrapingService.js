const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class BulkScrapingService {
  constructor(db) {
    this.db = db;
    this.activeBrowsers = new Map();
    this.jobQueue = new Map();
  }

  // Human-like delay function
  async humanDelay(min = 2000, max = 6000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Simulate human scrolling
  async humanScroll(page) {
    try {
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      const scrollSteps = Math.ceil(scrollHeight / viewportHeight);
      
      for (let i = 0; i < scrollSteps; i++) {
        await page.evaluate((step, vh) => {
          window.scrollTo(0, step * vh * 0.8);
        }, i, viewportHeight);
        await this.humanDelay(500, 1500);
      }
      
      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.humanDelay(1000, 2000);
    } catch (error) {
      console.log('⚠️ Scroll simulation failed:', error.message);
    }
  }

  // Get active LinkedIn account
  async getActiveAccount() {
    try {
      const [accounts] = await this.db.execute(`
        SELECT * FROM linkedin_accounts 
        WHERE validation_status = 'ACTIVE' 
        ORDER BY last_used_at ASC 
        LIMIT 1
      `);
      
      if (accounts.length === 0) {
        throw new Error('No active LinkedIn accounts available');
      }
      
      // Update last_used_at
      await this.db.execute(
        'UPDATE linkedin_accounts SET last_used_at = NOW() WHERE id = ?',
        [accounts[0].id]
      );
      
      return accounts[0];
    } catch (error) {
      throw new Error(`Failed to get active account: ${error.message}`);
    }
  }

  // Create browser context with stealth features
  async createStealthContext(account) {
    const browserOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    };

    const browser = await chromium.launch(browserOptions);
    
    const contextOptions = {
      userAgent: account.browser_user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation', 'notifications'],
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    if (account.proxy_url) {
      contextOptions.proxy = { server: account.proxy_url };
    }

    const context = await browser.newContext(contextOptions);

    // Add stealth patches
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    });

    // Load cookies
    let cookies = [];
    try {
      if (typeof account.session_cookie === 'string') {
        try {
          cookies = JSON.parse(account.session_cookie);
        } catch {
          // Create basic cookie from li_at
          cookies = [{
            name: 'li_at',
            value: account.session_cookie,
            domain: '.linkedin.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None'
          }];
        }
      }
      
      if (Array.isArray(cookies) && cookies.length > 0) {
        // Normalize cookies
        const normalizedCookies = cookies.map(cookie => ({
          ...cookie,
          domain: (cookie.domain || '.linkedin.com').replace(/^www\./g, '.'),
          path: cookie.path || '/',
          secure: cookie.secure !== false,
          sameSite: ['Strict', 'Lax', 'None'].includes(cookie.sameSite) ? cookie.sameSite : 'None',
          value: (cookie.value || '').toString().replace(/^"|"$/g, '')
        }));
        
        await context.addCookies(normalizedCookies);
        console.log(`🍪 Loaded ${normalizedCookies.length} cookies for account: ${account.account_name}`);
      }
    } catch (error) {
      console.error('❌ Cookie loading failed:', error.message);
    }

    return { browser, context };
  }

  // Bulk Profile Scraper
  async scrapeProfiles(jobId, profileUrls, accountId = null) {
    let browser, context;
    const results = [];
    
    try {
      console.log(`🔍 Starting bulk profile scraping for ${profileUrls.length} profiles`);
      
      // Update job status
      await this.updateJobStatus(jobId, 'running', `Processing ${profileUrls.length} profiles`);
      
      const account = accountId ? 
        await this.getAccountById(accountId) : 
        await this.getActiveAccount();
      
      ({ browser, context } = await this.createStealthContext(account));
      const page = await context.newPage();
      
      // Test LinkedIn access
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle' });
      await this.humanDelay();
      
      for (let i = 0; i < profileUrls.length; i++) {
        const profileUrl = profileUrls[i].trim();
        
        try {
          console.log(`📋 Scraping profile ${i + 1}/${profileUrls.length}: ${profileUrl}`);
          
          await page.goto(profileUrl, { waitUntil: 'networkidle' });
          await this.humanScroll(page);
          
          // Extract profile data
          const profileData = await page.evaluate(() => {
            const data = {};
            
            // Name
            const nameElement = document.querySelector('h1.text-heading-xlarge, h1[data-anonymize="person-name"]');
            data.name = nameElement ? nameElement.textContent.trim() : '';
            
            // Headline
            const headlineElement = document.querySelector('.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium');
            data.headline = headlineElement ? headlineElement.textContent.trim() : '';
            
            // Location
            const locationElement = document.querySelector('.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small');
            data.location = locationElement ? locationElement.textContent.trim() : '';
            
            // About section
            const aboutElement = document.querySelector('#about ~ .pv-shared-text-with-see-more .inline-show-more-text, .pv-about-section .pv-about__summary-text');
            data.about = aboutElement ? aboutElement.textContent.trim() : '';
            
            // Current job title and company
            const experienceElement = document.querySelector('.pv-entity__summary-info h3, .experience-item__title');
            data.currentJobTitle = experienceElement ? experienceElement.textContent.trim() : '';
            
            const companyElement = document.querySelector('.pv-entity__secondary-title, .experience-item__subtitle');
            data.currentCompany = companyElement ? companyElement.textContent.trim() : '';
            
            // Skills (if visible)
            const skillElements = document.querySelectorAll('.pv-skill-category-entity__name span, .skill-category-entity__name');
            data.skills = Array.from(skillElements).map(el => el.textContent.trim()).slice(0, 10);
            
            return data;
          });
          
          const result = {
            url: profileUrl,
            status: 'success',
            data: profileData,
            scrapedAt: new Date().toISOString(),
            accountUsed: account.account_name
          };
          
          results.push(result);
          
          // Update progress
          await this.updateJobProgress(jobId, Math.round((i + 1) / profileUrls.length * 100));
          
          console.log(`✅ Profile scraped: ${profileData.name || 'Unknown'}`);
          
        } catch (error) {
          console.error(`❌ Failed to scrape profile ${profileUrl}:`, error.message);
          
          results.push({
            url: profileUrl,
            status: 'error',
            error: error.message,
            scrapedAt: new Date().toISOString(),
            accountUsed: account.account_name
          });
        }
        
        // Human-like delay between profiles
        if (i < profileUrls.length - 1) {
          await this.humanDelay(3000, 8000);
        }
      }
      
      await this.updateJobStatus(jobId, 'completed', `Successfully scraped ${results.filter(r => r.status === 'success').length}/${profileUrls.length} profiles`);
      
    } catch (error) {
      console.error('❌ Bulk profile scraping failed:', error.message);
      await this.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    
    return results;
  }

  // Bulk Company Scraper
  async scrapeCompanies(jobId, companyUrls, accountId = null) {
    let browser, context;
    const results = [];
    
    try {
      console.log(`🏢 Starting bulk company scraping for ${companyUrls.length} companies`);
      
      await this.updateJobStatus(jobId, 'running', `Processing ${companyUrls.length} companies`);
      
      const account = accountId ? 
        await this.getAccountById(accountId) : 
        await this.getActiveAccount();
      
      ({ browser, context } = await this.createStealthContext(account));
      const page = await context.newPage();
      
      for (let i = 0; i < companyUrls.length; i++) {
        const companyUrl = companyUrls[i].trim();
        
        try {
          console.log(`🏢 Scraping company ${i + 1}/${companyUrls.length}: ${companyUrl}`);
          
          await page.goto(companyUrl, { waitUntil: 'networkidle' });
          await this.humanScroll(page);
          
          // Extract company data
          const companyData = await page.evaluate(() => {
            const data = {};
            
            // Company Name
            const nameElement = document.querySelector('h1.org-top-card-summary__title, h1[data-anonymize="company-name"]');
            data.companyName = nameElement ? nameElement.textContent.trim() : '';
            
            // Industry
            const industryElement = document.querySelector('.org-top-card-summary__industry, .org-page-details__definition-text');
            data.industry = industryElement ? industryElement.textContent.trim() : '';
            
            // Employee Count
            const employeeElement = document.querySelector('.org-top-card-summary__follower-count, .org-about-company-module__company-size-definition-text');
            data.employeeCount = employeeElement ? employeeElement.textContent.trim() : '';
            
            // Location
            const locationElement = document.querySelector('.org-top-card-summary__headquarter, .org-about-company-module__headquarters');
            data.location = locationElement ? locationElement.textContent.trim() : '';
            
            // About/Overview
            const aboutElement = document.querySelector('.org-about-company-module__description, .org-top-card-summary__description');
            data.about = aboutElement ? aboutElement.textContent.trim() : '';
            
            // Website URL
            const websiteElement = document.querySelector('a[data-tracking-control-name="about_website"], .org-about-company-module__website a');
            data.website = websiteElement ? websiteElement.href : '';
            
            return data;
          });
          
          const result = {
            url: companyUrl,
            status: 'success',
            data: companyData,
            scrapedAt: new Date().toISOString(),
            accountUsed: account.account_name
          };
          
          results.push(result);
          
          await this.updateJobProgress(jobId, Math.round((i + 1) / companyUrls.length * 100));
          
          console.log(`✅ Company scraped: ${companyData.companyName || 'Unknown'}`);
          
        } catch (error) {
          console.error(`❌ Failed to scrape company ${companyUrl}:`, error.message);
          
          results.push({
            url: companyUrl,
            status: 'error',
            error: error.message,
            scrapedAt: new Date().toISOString(),
            accountUsed: account.account_name
          });
        }
        
        if (i < companyUrls.length - 1) {
          await this.humanDelay(3000, 8000);
        }
      }
      
      await this.updateJobStatus(jobId, 'completed', `Successfully scraped ${results.filter(r => r.status === 'success').length}/${companyUrls.length} companies`);
      
    } catch (error) {
      console.error('❌ Bulk company scraping failed:', error.message);
      await this.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    
    return results;
  }

  // Sales Navigator Search Scraper
  async scrapeSalesNavigator(jobId, searchUrl, maxPages = 5, accountId = null) {
    let browser, context;
    const results = [];
    
    try {
      console.log(`🎯 Starting Sales Navigator scraping: ${searchUrl}`);
      
      await this.updateJobStatus(jobId, 'running', `Processing Sales Navigator search`);
      
      const account = accountId ? 
        await this.getAccountById(accountId) : 
        await this.getActiveAccount();
      
      ({ browser, context } = await this.createStealthContext(account));
      const page = await context.newPage();
      
      await page.goto(searchUrl, { waitUntil: 'networkidle' });
      await this.humanDelay(3000, 5000);
      
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        console.log(`📄 Scraping page ${pageNum}/${maxPages}`);
        
        await this.humanScroll(page);
        
        // Extract results from current page
        const pageResults = await page.evaluate(() => {
          const results = [];
          const resultElements = document.querySelectorAll('.result-lockup__name, .search-results__result-item');
          
          resultElements.forEach(element => {
            try {
              const nameElement = element.querySelector('.result-lockup__name a, .entity-result__title-text a');
              const titleElement = element.querySelector('.result-lockup__highlight-keyword, .entity-result__primary-subtitle');
              const companyElement = element.querySelector('.result-lockup__position-company, .entity-result__secondary-subtitle');
              const locationElement = element.querySelector('.result-lockup__misc-item, .entity-result__summary');
              
              if (nameElement) {
                results.push({
                  name: nameElement.textContent.trim(),
                  jobTitle: titleElement ? titleElement.textContent.trim() : '',
                  company: companyElement ? companyElement.textContent.trim() : '',
                  location: locationElement ? locationElement.textContent.trim() : '',
                  profileUrl: nameElement.href || ''
                });
              }
            } catch (error) {
              console.log('Error extracting result:', error.message);
            }
          });
          
          return results;
        });
        
        results.push(...pageResults.map(result => ({
          ...result,
          status: 'success',
          page: pageNum,
          scrapedAt: new Date().toISOString(),
          accountUsed: account.account_name
        })));
        
        console.log(`✅ Extracted ${pageResults.length} results from page ${pageNum}`);
        
        // Try to go to next page
        if (pageNum < maxPages) {
          try {
            const nextButton = await page.$('.artdeco-pagination__button--next:not([disabled]), .paging-controls__next:not([disabled])');
            if (nextButton) {
              await nextButton.click();
              await page.waitForLoadState('networkidle');
              await this.humanDelay(2000, 4000);
            } else {
              console.log('📄 No more pages available');
              break;
            }
          } catch (error) {
            console.log('📄 Pagination failed:', error.message);
            break;
          }
        }
        
        await this.updateJobProgress(jobId, Math.round(pageNum / maxPages * 100));
      }
      
      await this.updateJobStatus(jobId, 'completed', `Successfully scraped ${results.length} results from Sales Navigator`);
      
    } catch (error) {
      console.error('❌ Sales Navigator scraping failed:', error.message);
      await this.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    
    return results;
  }

  // Helper methods
  async getAccountById(accountId) {
    const [accounts] = await this.db.execute(
      'SELECT * FROM linkedin_accounts WHERE id = ? AND validation_status = "ACTIVE"',
      [accountId]
    );
    
    if (accounts.length === 0) {
      throw new Error('Account not found or not active');
    }
    
    return accounts[0];
  }

  async updateJobStatus(jobId, status, message = '') {
    try {
      await this.db.execute(
        'UPDATE scraping_jobs SET status = ?, message = ?, updated_at = NOW() WHERE id = ?',
        [status, message, jobId]
      );
    } catch (error) {
      console.error('Failed to update job status:', error.message);
    }
  }

  async updateJobProgress(jobId, progress) {
    try {
      await this.db.execute(
        'UPDATE scraping_jobs SET progress = ?, updated_at = NOW() WHERE id = ?',
        [progress, jobId]
      );
    } catch (error) {
      console.error('Failed to update job progress:', error.message);
    }
  }

  // Save results to database
  async saveResults(jobId, results, jobType) {
    try {
      for (const result of results) {
        await this.db.execute(`
          INSERT INTO scraping_results 
          (job_id, job_type, url, status, data, error_message, scraped_at, account_used) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          jobId,
          jobType,
          result.url || '',
          result.status,
          JSON.stringify(result.data || {}),
          result.error || null,
          result.scrapedAt,
          result.accountUsed
        ]);
      }
      
      console.log(`💾 Saved ${results.length} results to database`);
    } catch (error) {
      console.error('❌ Failed to save results:', error.message);
    }
  }

  // Export results to CSV
  async exportToCSV(jobId, jobType) {
    try {
      const [results] = await this.db.execute(
        'SELECT * FROM scraping_results WHERE job_id = ? ORDER BY scraped_at',
        [jobId]
      );
      
      if (results.length === 0) {
        throw new Error('No results found for this job');
      }
      
      let csvContent = '';
      let headers = [];
      
      if (jobType === 'profiles') {
        headers = ['Name', 'Headline', 'Location', 'About', 'Current Job Title', 'Current Company', 'Skills', 'Profile URL', 'Status', 'Scraped At'];
        csvContent = headers.join(',') + '\n';
        
        results.forEach(result => {
          const data = JSON.parse(result.data || '{}');
          const row = [
            data.name || '',
            data.headline || '',
            data.location || '',
            (data.about || '').replace(/,/g, ';'),
            data.currentJobTitle || '',
            data.currentCompany || '',
            (data.skills || []).join('; '),
            result.url || '',
            result.status || '',
            result.scraped_at || ''
          ];
          csvContent += row.map(field => `"${field}"`).join(',') + '\n';
        });
      } else if (jobType === 'companies') {
        headers = ['Company Name', 'Industry', 'Employee Count', 'Location', 'About', 'Website', 'Company URL', 'Status', 'Scraped At'];
        csvContent = headers.join(',') + '\n';
        
        results.forEach(result => {
          const data = JSON.parse(result.data || '{}');
          const row = [
            data.companyName || '',
            data.industry || '',
            data.employeeCount || '',
            data.location || '',
            (data.about || '').replace(/,/g, ';'),
            data.website || '',
            result.url || '',
            result.status || '',
            result.scraped_at || ''
          ];
          csvContent += row.map(field => `"${field}"`).join(',') + '\n';
        });
      } else if (jobType === 'sales_navigator') {
        headers = ['Name', 'Job Title', 'Company', 'Location', 'Profile URL', 'Page', 'Status', 'Scraped At'];
        csvContent = headers.join(',') + '\n';
        
        results.forEach(result => {
          const data = JSON.parse(result.data || '{}');
          const row = [
            data.name || '',
            data.jobTitle || '',
            data.company || '',
            data.location || '',
            data.profileUrl || '',
            data.page || '',
            result.status || '',
            result.scraped_at || ''
          ];
          csvContent += row.map(field => `"${field}"`).join(',') + '\n';
        });
      }
      
      return csvContent;
    } catch (error) {
      console.error('❌ CSV export failed:', error.message);
      throw error;
    }
  }
}

module.exports = BulkScrapingService;