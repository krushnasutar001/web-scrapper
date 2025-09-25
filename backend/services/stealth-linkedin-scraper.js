const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StealthLinkedInScraper {
  constructor(db) {
    this.db = db;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isRunning = false;
    this.savedProfilesDir = path.join(__dirname, '..', '..', 'saved_profiles');
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🕵️ Stealth LinkedIn Scraper Service Started');
    
    // Ensure saved profiles directory exists
    await this.ensureDirectoryExists(this.savedProfilesDir);
    
    // Initialize database tables
    await this.initializeTables();
  }

  async stop() {
    this.isRunning = false;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
    console.log('🛑 Stealth LinkedIn Scraper Service Stopped');
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`📁 Created directory: ${dirPath}`);
    }
  }

  async initializeTables() {
    try {
      // Create profiles table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          profile_url TEXT NOT NULL,
          full_name VARCHAR(255),
          first_name VARCHAR(255),
          last_name VARCHAR(255),
          headline TEXT,
          about TEXT,
          last_activity VARCHAR(255),
          country VARCHAR(255),
          city VARCHAR(255),
          industry VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(255),
          website VARCHAR(255),
          current_job_title VARCHAR(255),
          current_job_start DATE,
          current_job_end DATE,
          current_job_location VARCHAR(255),
          current_job_type VARCHAR(255),
          current_job_description TEXT,
          current_company_url TEXT,
          company_id INT,
          html_file_path TEXT,
          scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_profile_url (profile_url(500))
        )
      `);

      // Create companies table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS companies (
          id INT AUTO_INCREMENT PRIMARY KEY,
          company_name VARCHAR(255) NOT NULL,
          company_industry VARCHAR(255),
          company_hq VARCHAR(255),
          company_size VARCHAR(255),
          company_followers INT,
          company_website VARCHAR(255),
          company_type VARCHAR(255),
          company_specialties TEXT,
          company_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_company_url (company_url(500))
        )
      `);

      // Add foreign key constraint
      await this.db.execute(`
        ALTER TABLE profiles 
        ADD CONSTRAINT fk_profiles_company 
        FOREIGN KEY (company_id) REFERENCES companies(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
      `).catch(() => {}); // Ignore if constraint already exists

      console.log('✅ Database tables initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing tables:', error.message);
    }
  }

  async createStealthBrowser() {
    console.log('🚀 Launching stealth browser...');
    
    // Advanced stealth launch options
    const launchOptions = {
      headless: false, // Headful mode for better stealth
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
        '--disable-extensions-http-throttling',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-back-forward-cache',
        '--disable-ipc-flooding-protection',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--use-mock-keychain'
      ]
    };

    this.browser = await chromium.launch(launchOptions);
    
    // Create context with stealth settings
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'Asia/Calcutta',
      permissions: ['geolocation'],
      geolocation: { latitude: 19.0760, longitude: 72.8777 }, // Mumbai coordinates
      colorScheme: 'light',
      reducedMotion: 'no-preference',
      forcedColors: 'none',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });

    this.page = await this.context.newPage();
    
    // Apply stealth patches
    await this.applyStealthPatches();
    
    console.log('✅ Stealth browser created successfully');
    return this.page;
  }

  async applyStealthPatches() {
    // Remove webdriver property
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Override plugins
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    // Override languages
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    // Override permissions
    await this.page.addInitScript(() => {
      const originalQuery = window.navigator.permissions.query;
      return window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Canvas fingerprint protection
    await this.page.addInitScript(() => {
      const getImageData = HTMLCanvasElement.prototype.getContext('2d').getImageData;
      HTMLCanvasElement.prototype.getContext('2d').getImageData = function(...args) {
        const imageData = getImageData.apply(this, args);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] += Math.floor(Math.random() * 10) - 5;
          imageData.data[i + 1] += Math.floor(Math.random() * 10) - 5;
          imageData.data[i + 2] += Math.floor(Math.random() * 10) - 5;
        }
        return imageData;
      };
    });

    // WebGL fingerprint protection
    await this.page.addInitScript(() => {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel(R) Iris(TM) Graphics 6100';
        }
        return getParameter(parameter);
      };
    });

    console.log('🛡️ Stealth patches applied successfully');
  }

  async loadCookiesFromFile(cookieFilePath) {
    try {
      console.log(`🍪 Loading cookies from: ${cookieFilePath}`);
      const cookieData = await fs.readFile(cookieFilePath, 'utf8');
      const cookies = JSON.parse(cookieData);
      
      console.log(`📊 Found ${cookies.length} cookies to inject`);
      
      // Convert cookie format for Playwright
      const playwrightCookies = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        expires: cookie.expirationDate ? Math.floor(cookie.expirationDate) : undefined,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
                 cookie.sameSite === 'lax' ? 'Lax' : 
                 cookie.sameSite === 'strict' ? 'Strict' : 'None'
      }));

      await this.context.addCookies(playwrightCookies);
      
      console.log('✅ All cookies injected successfully');
      
      // Log key cookies for debugging
      const keyCookies = ['li_at', 'liap', 'lidc', 'bcookie', 'JSESSIONID'];
      keyCookies.forEach(cookieName => {
        const cookie = cookies.find(c => c.name === cookieName);
        if (cookie) {
          console.log(`🔑 ${cookieName}: ${cookie.value.substring(0, 20)}...`);
        } else {
          console.log(`⚠️ Missing key cookie: ${cookieName}`);
        }
      });
      
      return true;
    } catch (error) {
      console.error('❌ Error loading cookies:', error.message);
      return false;
    }
  }

  async validateLogin() {
    try {
      console.log('🔐 Validating LinkedIn login...');
      
      // Navigate to LinkedIn feed
      await this.page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for page to load
      await this.randomDelay(2000, 4000);

      // Check if we're logged in
      const currentUrl = this.page.url();
      console.log(`📍 Current URL: ${currentUrl}`);

      // Check for login indicators
      const isLoggedIn = await this.page.evaluate(() => {
        // Check for feed elements
        const feedExists = document.querySelector('[data-test-id="feed-container"]') || 
                          document.querySelector('.feed-container') ||
                          document.querySelector('[data-module-id="feed"]');
        
        // Check for profile menu
        const profileMenu = document.querySelector('[data-test-id="nav-profile-photo"]') ||
                           document.querySelector('.global-nav__me-photo') ||
                           document.querySelector('[data-control-name="nav.settings_and_privacy"]');
        
        // Check if we're on login page
        const onLoginPage = window.location.href.includes('/login') || 
                           window.location.href.includes('/uas/login') ||
                           document.querySelector('#username') ||
                           document.querySelector('[data-test-id="sign-in-form"]');
        
        return {
          feedExists: !!feedExists,
          profileMenu: !!profileMenu,
          onLoginPage: !!onLoginPage,
          url: window.location.href,
          title: document.title
        };
      });

      console.log('🔍 Login validation results:', isLoggedIn);

      if (isLoggedIn.onLoginPage) {
        console.log('❌ Login failed - redirected to login page');
        return { success: false, reason: 'Redirected to login page', details: isLoggedIn };
      }

      if (isLoggedIn.feedExists || isLoggedIn.profileMenu) {
        console.log('✅ Login successful - LinkedIn feed accessible');
        return { success: true, details: isLoggedIn };
      }

      console.log('⚠️ Login status unclear - investigating further');
      
      // Take screenshot for debugging
      const screenshotPath = path.join(this.savedProfilesDir, 'login_debug.png');
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Debug screenshot saved: ${screenshotPath}`);

      return { success: false, reason: 'Login status unclear', details: isLoggedIn };
      
    } catch (error) {
      console.error('❌ Error validating login:', error.message);
      return { success: false, reason: 'Validation error', error: error.message };
    }
  }

  async randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`⏳ Random delay: ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async humanLikeMouseMovement() {
    // Simulate human-like mouse movements
    const viewport = this.page.viewportSize();
    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);
    
    await this.page.mouse.move(x, y, { steps: 10 });
    await this.randomDelay(100, 500);
  }

  async humanLikeScrolling() {
    // Simulate human-like scrolling
    const scrollDistance = Math.floor(Math.random() * 500) + 200;
    await this.page.mouse.wheel(0, scrollDistance);
    await this.randomDelay(500, 1500);
  }

  async scrapeProfileFromUrl(profileUrl) {
    try {
      console.log(`🔍 Scraping profile: ${profileUrl}`);
      
      // Navigate to profile
      await this.page.goto(profileUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Human-like behavior
      await this.randomDelay(2000, 4000);
      await this.humanLikeMouseMovement();
      await this.humanLikeScrolling();

      // Wait for profile content to load
      await this.page.waitForSelector('h1', { timeout: 10000 }).catch(() => {});
      
      // Save HTML
      const profileId = this.extractProfileIdFromUrl(profileUrl);
      const htmlFilePath = path.join(this.savedProfilesDir, `${profileId}.html`);
      const htmlContent = await this.page.content();
      await fs.writeFile(htmlFilePath, htmlContent, 'utf8');
      console.log(`💾 HTML saved: ${htmlFilePath}`);

      // Extract profile data
      const profileData = await this.extractProfileData(htmlContent, profileUrl);
      profileData.html_file_path = htmlFilePath;

      // Save to database
      await this.saveProfileToDatabase(profileData);
      
      console.log(`✅ Profile scraped successfully: ${profileData.full_name || 'Unknown'}`);
      return profileData;
      
    } catch (error) {
      console.error(`❌ Error scraping profile ${profileUrl}:`, error.message);
      return null;
    }
  }

  extractProfileIdFromUrl(url) {
    const match = url.match(/\/in\/([^\/?]+)/);
    return match ? match[1] : crypto.randomUUID();
  }

  async extractProfileData(htmlContent, profileUrl) {
    // This is a comprehensive profile data extraction
    // In a real implementation, you would use more sophisticated parsing
    const profileData = {
      profile_url: profileUrl,
      full_name: null,
      first_name: null,
      last_name: null,
      headline: null,
      about: null,
      last_activity: null,
      country: null,
      city: null,
      industry: null,
      email: null,
      phone: null,
      website: null,
      current_job_title: null,
      current_job_start: null,
      current_job_end: null,
      current_job_location: null,
      current_job_type: null,
      current_job_description: null,
      current_company_url: null
    };

    // Extract data using regex patterns (simplified for demo)
    // In production, use proper HTML parsing with cheerio or similar
    
    // Extract name
    const nameMatch = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (nameMatch) {
      profileData.full_name = nameMatch[1].trim();
      const nameParts = profileData.full_name.split(' ');
      profileData.first_name = nameParts[0];
      profileData.last_name = nameParts.slice(1).join(' ');
    }

    // Extract headline
    const headlineMatch = htmlContent.match(/<div[^>]*class="[^"]*text-body-medium[^"]*"[^>]*>([^<]+)<\/div>/);
    if (headlineMatch) {
      profileData.headline = headlineMatch[1].trim();
    }

    // Extract location
    const locationMatch = htmlContent.match(/location[^>]*>([^<]+)</i);
    if (locationMatch) {
      const location = locationMatch[1].trim();
      const locationParts = location.split(',');
      if (locationParts.length >= 2) {
        profileData.city = locationParts[0].trim();
        profileData.country = locationParts[locationParts.length - 1].trim();
      }
    }

    console.log('📊 Extracted profile data:', {
      name: profileData.full_name,
      headline: profileData.headline,
      location: `${profileData.city}, ${profileData.country}`
    });

    return profileData;
  }

  async saveProfileToDatabase(profileData) {
    try {
      // Insert or update profile
      const query = `
        INSERT INTO profiles (
          profile_url, full_name, first_name, last_name, headline, about,
          last_activity, country, city, industry, email, phone, website,
          current_job_title, current_job_start, current_job_end, 
          current_job_location, current_job_type, current_job_description,
          current_company_url, html_file_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          headline = VALUES(headline),
          about = VALUES(about),
          last_activity = VALUES(last_activity),
          country = VALUES(country),
          city = VALUES(city),
          industry = VALUES(industry),
          email = VALUES(email),
          phone = VALUES(phone),
          website = VALUES(website),
          current_job_title = VALUES(current_job_title),
          current_job_start = VALUES(current_job_start),
          current_job_end = VALUES(current_job_end),
          current_job_location = VALUES(current_job_location),
          current_job_type = VALUES(current_job_type),
          current_job_description = VALUES(current_job_description),
          current_company_url = VALUES(current_company_url),
          html_file_path = VALUES(html_file_path),
          updated_at = CURRENT_TIMESTAMP
      `;

      const values = [
        profileData.profile_url,
        profileData.full_name,
        profileData.first_name,
        profileData.last_name,
        profileData.headline,
        profileData.about,
        profileData.last_activity,
        profileData.country,
        profileData.city,
        profileData.industry,
        profileData.email,
        profileData.phone,
        profileData.website,
        profileData.current_job_title,
        profileData.current_job_start,
        profileData.current_job_end,
        profileData.current_job_location,
        profileData.current_job_type,
        profileData.current_job_description,
        profileData.current_company_url,
        profileData.html_file_path
      ];

      await this.db.execute(query, values);
      console.log('💾 Profile saved to database successfully');
      
    } catch (error) {
      console.error('❌ Error saving profile to database:', error.message);
    }
  }

  async scrapeProfilesFromFile(csvFilePath) {
    try {
      console.log(`📂 Loading profile URLs from: ${csvFilePath}`);
      
      const csvContent = await fs.readFile(csvFilePath, 'utf8');
      const profileUrls = csvContent.split('\n')
        .map(url => url.trim())
        .filter(url => url && url.startsWith('https://www.linkedin.com/in/'));
      
      console.log(`📊 Found ${profileUrls.length} profile URLs to scrape`);
      
      const results = [];
      
      for (let i = 0; i < profileUrls.length; i++) {
        const url = profileUrls[i];
        console.log(`\n🔄 Processing ${i + 1}/${profileUrls.length}: ${url}`);
        
        const profileData = await this.scrapeProfileFromUrl(url);
        if (profileData) {
          results.push(profileData);
        }
        
        // Human-like delay between profiles
        if (i < profileUrls.length - 1) {
          await this.randomDelay(5000, 15000);
        }
      }
      
      console.log(`\n✅ Scraping completed. Successfully scraped ${results.length}/${profileUrls.length} profiles`);
      return results;
      
    } catch (error) {
      console.error('❌ Error scraping profiles from file:', error.message);
      return [];
    }
  }

  async getScrapedProfiles() {
    try {
      const [profiles] = await this.db.execute(`
        SELECT p.*, c.company_name, c.company_industry, c.company_size
        FROM profiles p
        LEFT JOIN companies c ON p.company_id = c.id
        ORDER BY p.scraped_at DESC
      `);
      return profiles;
    } catch (error) {
      console.error('❌ Error fetching scraped profiles:', error.message);
      return [];
    }
  }

  async getScrapedCompanies() {
    try {
      const [companies] = await this.db.execute(`
        SELECT * FROM companies
        ORDER BY created_at DESC
      `);
      return companies;
    } catch (error) {
      console.error('❌ Error fetching scraped companies:', error.message);
      return [];
    }
  }
}

module.exports = StealthLinkedInScraper;