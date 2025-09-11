/**
 * LinkedIn Scraper Service
 * Implements human-like browsing behavior and structured data extraction
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

class LinkedInScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false, // Default to headless
      timeout: options.timeout || 30000,
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: options.viewport || { width: 1920, height: 1080 },
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    console.log('🚀 Initializing LinkedIn Scraper...');
    
    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Set user agent and viewport
    await this.page.setUserAgent(this.options.userAgent);
    await this.page.setViewport(this.options.viewport);
    
    // Set extra headers to appear more human-like
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    console.log('✅ LinkedIn Scraper initialized');
  }

  async injectCookies(cookies) {
    if (!cookies || !this.page) {
      throw new Error('Cookies or page not available');
    }

    console.log('🍪 Injecting LinkedIn cookies...');
    
    // Parse cookies if they're in string format
    let cookieArray = [];
    if (typeof cookies === 'string') {
      try {
        cookieArray = JSON.parse(cookies);
      } catch (e) {
        // Handle Netscape cookie format
        cookieArray = this.parseNetscapeCookies(cookies);
      }
    } else if (Array.isArray(cookies)) {
      cookieArray = cookies;
    }

    // Set cookies
    for (const cookie of cookieArray) {
      try {
        await this.page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || '.linkedin.com',
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || true
        });
      } catch (error) {
        console.warn(`⚠️ Failed to set cookie ${cookie.name}:`, error.message);
      }
    }

    console.log(`✅ Injected ${cookieArray.length} cookies`);
  }

  parseNetscapeCookies(cookieString) {
    const cookies = [];
    const lines = cookieString.split('\n');
    
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        const parts = line.split('\t');
        if (parts.length >= 7) {
          cookies.push({
            name: parts[5],
            value: parts[6],
            domain: parts[0],
            path: parts[2],
            secure: parts[3] === 'TRUE',
            httpOnly: parts[1] === 'TRUE'
          });
        }
      }
    }
    
    return cookies;
  }

  async humanLikeScroll() {
    console.log('🎭 Performing human-like scroll simulation...');
    
    // Get page height
    const pageHeight = await this.page.evaluate(() => document.body.scrollHeight);
    
    // Scroll 30-40% down
    const firstScrollPosition = Math.floor(pageHeight * (0.3 + Math.random() * 0.1));
    await this.page.evaluate((position) => {
      window.scrollTo({ top: position, behavior: 'smooth' });
    }, firstScrollPosition);
    
    // Pause 1-3 seconds
    await this.randomDelay(1000, 3000);
    
    // Scroll to bottom
    await this.page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    
    // Pause 2-4 seconds
    await this.randomDelay(2000, 4000);
    
    // Scroll back up halfway
    const halfwayPosition = Math.floor(pageHeight * 0.5);
    await this.page.evaluate((position) => {
      window.scrollTo({ top: position, behavior: 'smooth' });
    }, halfwayPosition);
    
    // Pause 1-2 seconds
    await this.randomDelay(1000, 2000);
    
    console.log('✅ Human-like scrolling completed');
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async scrapeProfile(url, account) {
    console.log(`🔍 Scraping profile: ${url}`);
    
    try {
      // Navigate to profile page
      await this.page.goto(url, { 
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: this.options.timeout 
      });

      // Wait for page to fully load
      await this.page.waitForTimeout(2000);

      // Perform human-like scrolling
      await this.humanLikeScroll();

      // Get page HTML
      const html = await this.page.content();
      
      // Save HTML page locally
      const filename = this.generateFilename(url, 'profile');
      await this.saveHtmlPage(html, filename);

      // Extract structured data
      const profileData = await this.extractProfileData(html, url);
      
      console.log(`✅ Profile scraped successfully: ${profileData.full_name || 'Unknown'}`);
      
      return {
        url,
        status: 'success',
        data: profileData,
        html_file: filename,
        scraped_at: new Date().toISOString(),
        account_used: account.account_name
      };
      
    } catch (error) {
      console.error(`❌ Failed to scrape profile ${url}:`, error.message);
      
      return {
        url,
        status: 'failed',
        error: error.message,
        scraped_at: new Date().toISOString(),
        account_used: account.account_name
      };
    }
  }

  async scrapeCompany(url, account) {
    console.log(`🏢 Scraping company: ${url}`);
    
    try {
      // Navigate to company page
      await this.page.goto(url, { 
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: this.options.timeout 
      });

      // Wait for page to fully load
      await this.page.waitForTimeout(2000);

      // Perform human-like scrolling
      await this.humanLikeScroll();

      // Get page HTML
      const html = await this.page.content();
      
      // Save HTML page locally
      const filename = this.generateFilename(url, 'company');
      await this.saveHtmlPage(html, filename);

      // Extract structured data
      const companyData = await this.extractCompanyData(html, url);
      
      console.log(`✅ Company scraped successfully: ${companyData.company_name || 'Unknown'}`);
      
      return {
        url,
        status: 'success',
        data: companyData,
        html_file: filename,
        scraped_at: new Date().toISOString(),
        account_used: account.account_name
      };
      
    } catch (error) {
      console.error(`❌ Failed to scrape company ${url}:`, error.message);
      
      return {
        url,
        status: 'failed',
        error: error.message,
        scraped_at: new Date().toISOString(),
        account_used: account.account_name
      };
    }
  }

  generateFilename(url, type) {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part);
    const identifier = pathParts[pathParts.length - 1] || 'unknown';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${type}_${identifier}_${timestamp}.html`;
  }

  async saveHtmlPage(html, filename) {
    const saveDir = path.join(__dirname, '..', 'saved_pages');
    
    // Ensure directory exists
    try {
      await fs.mkdir(saveDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    const filePath = path.join(saveDir, filename);
    await fs.writeFile(filePath, html, 'utf8');
    
    console.log(`💾 HTML saved: ${filename}`);
    return filePath;
  }

  async extractProfileData(html, url) {
    const $ = cheerio.load(html);
    
    // Extract profile data using various selectors
    const profileData = {
      profile_url: url,
      full_name: this.extractText($, 'h1.text-heading-xlarge, .pv-text-details__left-panel h1, .top-card-layout__title'),
      headline: this.extractText($, '.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium, .top-card-layout__headline'),
      about: this.extractText($, '#about ~ * .pv-shared-text-with-see-more, .pv-about-section .pv-about__summary-text, section[data-section="summary"] .pv-about__summary-text'),
      location: this.extractText($, '.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small, .top-card-layout__first-subline'),
      industry: this.extractText($, '.pv-text-details__left-panel .text-body-small:nth-child(3), .top-card-layout__second-subline'),
      current_job_title: this.extractText($, '.experience-section .pv-entity__summary-info h3, .pvs-entity__caption-wrapper h3, .experience-item__title'),
      current_company: this.extractText($, '.experience-section .pv-entity__secondary-title, .pvs-entity__caption-wrapper .t-14, .experience-item__subtitle'),
      connections: this.extractText($, '.pv-top-card--list-bullet .t-black--light, .top-card-layout__connections'),
      follower_count: this.extractText($, '.pv-top-card--list-bullet .t-black--light:contains("followers"), .top-card-layout__followers'),
      
      // Additional fields
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      website: '',
      last_activity: '',
      country: '',
      city: '',
      current_job_start: '',
      current_job_end: '',
      current_job_location: '',
      current_job_type: '',
      current_job_description: '',
      current_company_url: '',
      
      // Metadata
      scraped_at: new Date().toISOString(),
      scraper_version: '1.0.0'
    };
    
    // Parse full name into first and last name
    if (profileData.full_name) {
      const nameParts = profileData.full_name.trim().split(' ');
      profileData.first_name = nameParts[0] || '';
      profileData.last_name = nameParts.slice(1).join(' ') || '';
    }
    
    // Parse location into city and country
    if (profileData.location) {
      const locationParts = profileData.location.split(',').map(part => part.trim());
      if (locationParts.length >= 2) {
        profileData.city = locationParts[0];
        profileData.country = locationParts[locationParts.length - 1];
      } else {
        profileData.city = profileData.location;
      }
    }
    
    return profileData;
  }

  async extractCompanyData(html, url) {
    const $ = cheerio.load(html);
    
    const companyData = {
      company_url: url,
      company_name: this.extractText($, 'h1.org-top-card-summary__title, .org-top-card-summary-info-list__info-item h1, .top-card-layout__title'),
      company_industry: this.extractText($, '.org-top-card-summary-info-list__info-item:contains("Industry") + .org-top-card-summary-info-list__info-item, .company-industries'),
      company_size: this.extractText($, '.org-top-card-summary-info-list__info-item:contains("Company size") + .org-top-card-summary-info-list__info-item, .company-size'),
      company_hq: this.extractText($, '.org-top-card-summary-info-list__info-item:contains("Headquarters") + .org-top-card-summary-info-list__info-item, .company-headquarters'),
      company_followers: this.extractText($, '.org-top-card-summary-info-list__info-item:contains("followers"), .follower-count'),
      company_website: this.extractAttribute($, 'a[href*="http"]:contains("Website"), .company-website a', 'href'),
      company_type: this.extractText($, '.org-top-card-summary-info-list__info-item:contains("Type") + .org-top-card-summary-info-list__info-item, .company-type'),
      company_specialties: this.extractText($, '.org-about-company-module__specialties, .company-specialties'),
      company_description: this.extractText($, '.org-about-company-module__description, .company-description'),
      
      // Metadata
      scraped_at: new Date().toISOString(),
      scraper_version: '1.0.0'
    };
    
    return companyData;
  }

  extractText($, selector) {
    const element = $(selector).first();
    return element.length ? element.text().trim() : '';
  }

  extractAttribute($, selector, attribute) {
    const element = $(selector).first();
    return element.length ? element.attr(attribute) || '' : '';
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 LinkedIn Scraper closed');
    }
  }
}

module.exports = LinkedInScraper;