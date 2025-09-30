/**
 * LinkedIn Scraper Service
 * Handles automated LinkedIn data extraction with stealth features
 */

const puppeteer = require('puppeteer');
const { executablePath } = require('puppeteer');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');

// Add stealth plugin
puppeteerExtra.use(StealthPlugin());

class LinkedInScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isInitialized = false;
    this.rateLimiter = new RateLimiter();
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Initialize browser with stealth settings
   */
  async initialize() {
    try {
      console.log('🚀 Initializing LinkedIn scraper...');

      this.browser = await puppeteerExtra.launch({
        headless: 'new', // Use new headless mode
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
          '--window-size=1920,1080',
          '--user-agent=' + this.getRandomUserAgent()
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      });

      this.page = await this.browser.newPage();

      // Set additional stealth measures
      await this.setupStealthMeasures();

      this.isInitialized = true;
      console.log('✅ LinkedIn scraper initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize scraper:', error);
      throw error;
    }
  }

  /**
   * Setup additional stealth measures
   */
  async setupStealthMeasures() {
    // Override webdriver property
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Override plugins length
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    // Override languages
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    // Set random user agent
    await this.page.setUserAgent(this.getRandomUserAgent());

    // Set viewport
    await this.page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100)
    });
  }

  /**
   * Get random user agent
   */
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Set LinkedIn cookies for authentication
   */
  async setCookies(cookies) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('🍪 Setting LinkedIn cookies...');

      // Navigate to LinkedIn first
      await this.page.goto('https://www.linkedin.com', { waitUntil: 'networkidle0' });

      // Parse and set cookies
      const cookieArray = this.parseCookieString(cookies);
      
      for (const cookie of cookieArray) {
        await this.page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: '.linkedin.com',
          path: '/',
          httpOnly: cookie.name === 'li_at' || cookie.name === 'JSESSIONID',
          secure: true
        });
      }

      console.log('✅ Cookies set successfully');

      // Verify login by checking for logged-in elements
      await this.page.reload({ waitUntil: 'networkidle0' });
      
      const isLoggedIn = await this.page.$('.global-nav__me') !== null;
      if (!isLoggedIn) {
        throw new Error('Failed to authenticate with provided cookies');
      }

      console.log('✅ Authentication verified');

    } catch (error) {
      console.error('❌ Failed to set cookies:', error);
      throw error;
    }
  }

  /**
   * Parse cookie string into array
   */
  parseCookieString(cookieString) {
    return cookieString.split(';').map(cookie => {
      const [name, value] = cookie.trim().split('=');
      return { name, value };
    });
  }

  /**
   * Scrape LinkedIn profile
   */
  async scrapeProfile(profileUrl) {
    try {
      await this.rateLimiter.waitForNext();

      console.log('👤 Scraping profile:', profileUrl);

      await this.page.goto(profileUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      // Wait for profile content to load
      await this.page.waitForSelector('.pv-text-details__left-panel', { timeout: 10000 });

      // Extract profile data
      const profileData = await this.page.evaluate(() => {
        const data = {};

        // Basic info
        data.name = document.querySelector('.text-heading-xlarge')?.textContent?.trim();
        data.headline = document.querySelector('.text-body-medium.break-words')?.textContent?.trim();
        data.location = document.querySelector('.text-body-small.inline.t-black--light.break-words')?.textContent?.trim();
        data.profileUrl = window.location.href;

        // About section
        const aboutSection = document.querySelector('#about');
        if (aboutSection) {
          const aboutText = aboutSection.closest('section')?.querySelector('.pv-shared-text-with-see-more span[aria-hidden="true"]');
          data.about = aboutText?.textContent?.trim();
        }

        // Experience
        data.experience = [];
        const experienceItems = document.querySelectorAll('#experience ~ .pvs-list__outer-container .pvs-entity');
        experienceItems.forEach(item => {
          const title = item.querySelector('.mr1.t-bold span[aria-hidden="true"]')?.textContent?.trim();
          const company = item.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim();
          const duration = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]')?.textContent?.trim();
          
          if (title) {
            data.experience.push({ title, company, duration });
          }
        });

        // Education
        data.education = [];
        const educationItems = document.querySelectorAll('#education ~ .pvs-list__outer-container .pvs-entity');
        educationItems.forEach(item => {
          const school = item.querySelector('.mr1.t-bold span[aria-hidden="true"]')?.textContent?.trim();
          const degree = item.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim();
          const years = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]')?.textContent?.trim();
          
          if (school) {
            data.education.push({ school, degree, years });
          }
        });

        // Skills
        data.skills = [];
        const skillItems = document.querySelectorAll('#skills ~ .pvs-list__outer-container .pvs-entity .mr1.t-bold span[aria-hidden="true"]');
        skillItems.forEach(skill => {
          if (skill.textContent?.trim()) {
            data.skills.push(skill.textContent.trim());
          }
        });

        return data;
      });

      console.log('✅ Profile scraped successfully:', profileData.name);
      return profileData;

    } catch (error) {
      console.error('❌ Failed to scrape profile:', error);
      throw error;
    }
  }

  /**
   * Scrape company page
   */
  async scrapeCompany(companyUrl) {
    try {
      await this.rateLimiter.waitForNext();

      console.log('🏢 Scraping company:', companyUrl);

      await this.page.goto(companyUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      // Wait for company content to load
      await this.page.waitForSelector('.org-top-card-summary__title', { timeout: 10000 });

      // Extract company data
      const companyData = await this.page.evaluate(() => {
        const data = {};

        // Basic info
        data.name = document.querySelector('.org-top-card-summary__title')?.textContent?.trim();
        data.industry = document.querySelector('.org-top-card-summary__industry')?.textContent?.trim();
        data.size = document.querySelector('.org-top-card-summary__company-size')?.textContent?.trim();
        data.location = document.querySelector('.org-top-card-summary__headquarter')?.textContent?.trim();
        data.companyUrl = window.location.href;

        // About section
        const aboutText = document.querySelector('.org-about-us-organization-description__text');
        data.about = aboutText?.textContent?.trim();

        // Website
        const websiteLink = document.querySelector('.org-about-us-organization-description__website a');
        data.website = websiteLink?.href;

        return data;
      });

      console.log('✅ Company scraped successfully:', companyData.name);
      return companyData;

    } catch (error) {
      console.error('❌ Failed to scrape company:', error);
      throw error;
    }
  }

  /**
   * Close browser
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.isInitialized = false;
        console.log('✅ Scraper closed successfully');
      }
    } catch (error) {
      console.error('❌ Error closing scraper:', error);
    }
  }
}

/**
 * Rate limiter to prevent detection
 */
class RateLimiter {
  constructor() {
    this.minDelay = 2000; // 2 seconds
    this.maxDelay = 5000; // 5 seconds
    this.lastRequest = 0;
  }

  async waitForNext() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    const randomDelay = Math.random() * (this.maxDelay - this.minDelay) + this.minDelay;
    
    if (timeSinceLastRequest < randomDelay) {
      const waitTime = randomDelay - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${Math.round(waitTime)}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequest = Date.now();
  }
}

module.exports = LinkedInScraper;