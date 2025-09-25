/**
 * LinkedIn Scraper Service
 * Implements human-like browsing behavior and structured data extraction
 * 
 * Features:
 * - Stealth mode to avoid detection
 * - Cookie-based authentication
 * - Human-like scrolling and reading simulation
 * - Retry logic with exponential backoff
 * - HTML saving and Cheerio parsing
 * - Concurrency management
 * - Voyager API capture for structured JSON data
 * 
 * Voyager Mode Usage:
 * const scraper = new LinkedInScraper({ headless: false, useVoyager: true });
 * await scraper.initialize();
 * const result = await scraper.scrapeProfile('https://www.linkedin.com/in/someprofile', account);
 * // result.data contains Cheerio-parsed HTML fields
 * // result.voyagerData contains raw JSON from LinkedIn's internal APIs
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserPreferencesPlugin = require('puppeteer-extra-plugin-user-preferences');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Add user preferences plugin for more realistic behavior
puppeteer.use(UserPreferencesPlugin({
  userPrefs: {
    webkit: {
      webprefs: {
        default_encoding: 'UTF-8'
      }
    }
  }
}));

// Singleton browser instance to prevent multiple browser launches
let browserInstance = null;
let browserRefCount = 0;

// Pool of realistic User-Agent strings for Windows/Mac
const USER_AGENTS = [
  // Windows Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Windows Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  
  // Mac Chrome
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Mac Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15'
];

// Viewport size variations for realistic browsing
const VIEWPORT_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 1280, height: 720 },
  { width: 1680, height: 1050 }
];

// Utility functions for randomization
const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

const getRandomViewport = () => {
  const baseViewport = VIEWPORT_SIZES[Math.floor(Math.random() * VIEWPORT_SIZES.length)];
  // Add small random variations
  return {
    width: baseViewport.width + Math.floor(Math.random() * 100) - 50,
    height: baseViewport.height + Math.floor(Math.random() * 100) - 50
  };
};

const randomBetween = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

class LinkedInScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false, // Default to headless
      timeout: options.timeout || 120000, // 2 minutes for general operations
      navigationTimeout: options.navigationTimeout || 120000, // 2 minutes for navigation (increased)
      waitTimeout: options.waitTimeout || 60000, // 1 minute for element waits
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: options.viewport || { width: 1280, height: 720 }, // LinkedIn-optimized viewport
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 5000, // 5 seconds base delay
      maxConcurrency: options.maxConcurrency || 1, // Reduced to 1 for better reliability
      useVoyager: options.useVoyager || false, // Enable Voyager API capture
      ...options
    };
    this.browser = null;
    this.page = null;
    
    // Concurrency management
    this.activeScrapes = new Set();
    this.maxConcurrentScrapes = this.options.maxConcurrency;
    this.scrapeQueue = [];
    
    // Voyager API capture
    this.voyagerResponses = [];
    
    console.log(`🔧 Scraper configured with max concurrency: ${this.maxConcurrentScrapes}`);
    if (this.options.useVoyager) {
      console.log('🔍 Voyager API capture enabled');
    }
  }

  async initialize() {
    console.log('🚀 Initializing LinkedIn Scraper with Stealth Mode...');
    
    // Use singleton browser instance
    if (!browserInstance) {
      console.log('🌐 Launching new browser instance...');
      browserInstance = await puppeteer.launch({
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
          '--disable-features=VizDisplayCompositor',
          '--disable-blink-features=AutomationControlled',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--no-default-browser-check',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-hang-monitor',
          '--disable-sync',
          '--disable-web-resources',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-features=VizDisplayCompositor',
          '--run-all-compositor-stages-before-draw',
          '--disable-features=TranslateUI',
          '--disable-features=BlinkGenPropertyTrees',
          '--disable-extensions-http-throttling'
        ]
      });
    } else {
      console.log('♻️ Reusing existing browser instance...');
    }
    
    this.browser = browserInstance;
    browserRefCount++;
    console.log(`📊 Browser reference count: ${browserRefCount}`);

    // Create a new page if we don't have one or if it's closed
    if (!this.page || this.page.isClosed()) {
      console.log('📄 Creating new page...');
      this.page = await this.browser.newPage();
    } else {
      console.log('♻️ Reusing existing page...');
    }
    
    // Set different timeout configurations
    this.page.setDefaultNavigationTimeout(this.options.navigationTimeout);
    this.page.setDefaultTimeout(this.options.waitTimeout);
    
    // Set randomized user agent and viewport for anti-detection
    const randomUserAgent = getRandomUserAgent();
    // Use fixed LinkedIn-optimized viewport instead of random
    const linkedInViewport = this.options.viewport;
    
    console.log(`🎭 Using User-Agent: ${randomUserAgent.substring(0, 50)}...`);
    console.log(`📱 Using LinkedIn-optimized Viewport: ${linkedInViewport.width}x${linkedInViewport.height}`);
    
    await this.page.setUserAgent(randomUserAgent);
    await this.page.setViewport(linkedInViewport);
    
    // Set extra headers to appear more human-like
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    });

    // Override permissions (using context instead of page for newer Puppeteer versions)
    try {
      const context = this.browser.defaultBrowserContext();
      await context.overridePermissions('https://www.linkedin.com', ['geolocation', 'notifications']);
    } catch (error) {
      console.log('⚠️ Permission override not supported in this Puppeteer version');
    }

    // Setup Voyager API network listener if enabled
    if (this.options.useVoyager) {
      console.log('🔍 Setting up Voyager API network listener...');
      this.page.on('response', async (response) => {
        try {
          const url = response.url();
          
          // Watch for LinkedIn Voyager API endpoints
          if (url.includes('/voyager/api/')) {
            console.log(`📡 Captured Voyager API call: ${url}`);
            
            // Safely attempt to parse JSON response
            try {
              const json = await response.json();
              this.voyagerResponses.push({
                url: url,
                json: json,
                timestamp: Date.now()
              });
              console.log(`✅ Stored Voyager response for: ${url.split('/voyager/api/')[1]}`);
            } catch (jsonError) {
              console.warn(`⚠️ Failed to parse JSON from ${url}:`, jsonError.message);
            }
          }
        } catch (error) {
          // Silently handle any network listener errors to avoid breaking navigation
          console.warn('⚠️ Network listener error:', error.message);
        }
      });
    }

    console.log('✅ LinkedIn Scraper initialized with stealth mode');
  }

  async injectCookies(cookies) {
    if (!cookies || !this.page) {
      throw new Error('Cookies or page not available');
    }

    console.log('🍪 Injecting LinkedIn cookies...');
    
    // Navigate to LinkedIn first to set the correct domain context
    try {
      console.log('🌐 Navigating to LinkedIn to establish domain context...');
      await this.page.goto('https://www.linkedin.com', { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });
      
      // Add random delay to appear more human-like
      await new Promise(resolve => setTimeout(resolve, randomBetween(1000, 3000)));
    } catch (error) {
      console.warn('⚠️ Failed to navigate to LinkedIn for cookie context:', error.message);
    }
    
    // Parse cookies if they're in string format
    let cookieArray = [];
    if (typeof cookies === 'string') {
      try {
        cookieArray = JSON.parse(cookies);
      } catch (e) {
        console.warn('⚠️ Failed to parse JSON cookies, trying Netscape format');
        // Handle Netscape cookie format
        cookieArray = this.parseNetscapeCookies(cookies);
      }
    } else if (Array.isArray(cookies)) {
      cookieArray = cookies;
    }

    if (cookieArray.length === 0) {
      console.warn('⚠️ No valid cookies found to inject');
      return false;
    }

    // Clear existing cookies first to avoid conflicts
    const existingCookies = await this.page.cookies();
    if (existingCookies.length > 0) {
      console.log(`🧹 Clearing ${existingCookies.length} existing cookies...`);
      await this.page.deleteCookie(...existingCookies);
    }

    // Set cookies with enhanced validation and retry logic
    let successCount = 0;
    for (const cookie of cookieArray) {
      try {
        // Validate required cookie properties
        if (!cookie.name || !cookie.value) {
          console.warn(`⚠️ Skipping invalid cookie: missing name or value`);
          continue;
        }

        // Enhanced cookie configuration for LinkedIn
        const cookieConfig = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || '.linkedin.com',
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
          secure: cookie.secure !== false, // Default to true for LinkedIn
          sameSite: cookie.sameSite || 'Lax'
        };

        // Handle expiration if provided
        if (cookie.expires || cookie.expirationDate) {
          const expiry = cookie.expires || cookie.expirationDate;
          if (typeof expiry === 'number') {
            cookieConfig.expires = expiry;
          } else if (typeof expiry === 'string') {
            cookieConfig.expires = Math.floor(new Date(expiry).getTime() / 1000);
          }
        }

        await this.page.setCookie(cookieConfig);
        successCount++;
        
        // Small delay between cookie injections
        await new Promise(resolve => setTimeout(resolve, randomBetween(50, 150)));
        
      } catch (error) {
        console.warn(`⚠️ Failed to set cookie ${cookie.name}:`, error.message);
      }
    }

    console.log(`✅ Successfully injected ${successCount}/${cookieArray.length} cookies`);
    
    // Validate authentication by checking for key LinkedIn cookies
    const authCookies = ['li_at', 'JSESSIONID', 'bcookie', 'bscookie'];
    const currentCookies = await this.page.cookies();
    const foundAuthCookies = authCookies.filter(cookieName => 
      currentCookies.find(c => c.name === cookieName)
    );
    
    if (foundAuthCookies.length === 0) {
      console.warn('⚠️ Warning: No authentication cookies detected. Scraping may be limited.');
      return false;
    }
    
    console.log(`✅ Authentication cookies detected: ${foundAuthCookies.join(', ')}`);
    
    // Refresh the page to apply cookies properly
    try {
      console.log('🔄 Refreshing page to apply cookies...');
      await this.page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, randomBetween(2000, 4000)));
    } catch (error) {
      console.warn('⚠️ Failed to refresh page after cookie injection:', error.message);
    }
    
    return true;
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

  // Alias for loadCookies to maintain compatibility
  async loadCookies(cookies) {
    return await this.injectCookies(cookies);
  }

  async humanLikeScroll() {
    console.log('🎭 Performing enhanced human-like scroll simulation...');
    
    try {
      // Get page dimensions
      const pageHeight = await this.page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = await this.page.evaluate(() => window.innerHeight);
      
      if (pageHeight <= viewportHeight) {
        console.log('📄 Page is short, minimal scrolling needed');
        await this.randomDelay(1000, 2000);
        return;
      }
      
      // Initial pause to simulate reading the top of the page
      await this.randomDelay(2000, 4000);
      
      // Perform realistic scrolling pattern
      const scrollSteps = 4 + Math.floor(Math.random() * 4); // 4-7 scroll steps
      let currentPosition = 0;
      
      for (let i = 0; i < scrollSteps; i++) {
        // Calculate next scroll position (progressive scrolling)
        const progress = (i + 1) / scrollSteps;
        const targetPosition = Math.floor(pageHeight * progress * 0.9); // Don't scroll to absolute bottom
        
        // Smooth scroll with realistic speed
        await this.page.evaluate((position) => {
          window.scrollTo({ 
            top: position, 
            behavior: 'smooth' 
          });
        }, targetPosition);
        
        currentPosition = targetPosition;
        
        // Simulate reading time - longer pauses for more content
        const readingTime = randomBetween(2000, 5000);
        await this.page.waitForTimeout(readingTime);
        
        // Random mouse movements while "reading"
        if (Math.random() > 0.3) { // 70% chance of mouse movement
          await this.simulateMouseMovement();
        }
        
        // Occasionally scroll back up slightly (like re-reading)
        if (Math.random() > 0.7 && i > 0) { // 30% chance
          const backScrollPosition = currentPosition - randomBetween(100, 300);
          await this.page.evaluate((position) => {
            window.scrollTo({ top: Math.max(0, position), behavior: 'smooth' });
          }, backScrollPosition);
          
          await this.randomDelay(1000, 2000);
          
          // Scroll back to original position
          await this.page.evaluate((position) => {
            window.scrollTo({ top: position, behavior: 'smooth' });
          }, currentPosition);
        }
      }
      
      // Final reading pause
      await this.randomDelay(2000, 4000);
      
      console.log('✅ Enhanced human-like scrolling completed');
      
    } catch (error) {
      console.warn('⚠️ Error during human-like scrolling:', error.message);
    }
  }

  async simulateMouseMovement() {
    try {
      // Initialize mouse position first
      await this.page.mouse.move(100, 100);
      await new Promise(resolve => setTimeout(resolve, randomBetween(100, 300)));
      
      // Get viewport dimensions
      const viewport = await this.page.viewport();
      
      if (!viewport || !viewport.width || !viewport.height) {
        console.warn('⚠️ Viewport not available for mouse simulation');
        return;
      }
      
      // Generate realistic mouse path (not completely random)
      const startX = Math.floor(Math.random() * viewport.width);
      const startY = Math.floor(Math.random() * viewport.height);
      
      // Move to starting position
      await this.page.mouse.move(startX, startY);
      
      // Create a path of 3-6 movements
      const movements = 3 + Math.floor(Math.random() * 4);
      let currentX = startX;
      let currentY = startY;
      
      for (let i = 0; i < movements; i++) {
        // Small, realistic movements (not jumping across screen)
        const deltaX = randomBetween(-200, 200);
        const deltaY = randomBetween(-150, 150);
        
        currentX = Math.max(0, Math.min(viewport.width, currentX + deltaX));
        currentY = Math.max(0, Math.min(viewport.height, currentY + deltaY));
        
        await this.page.mouse.move(currentX, currentY);
        await new Promise(resolve => setTimeout(resolve, randomBetween(200, 800)));
      }
      
    } catch (error) {
      console.warn('⚠️ Error during mouse simulation:', error.message);
    }
  }

  async simulateTyping(text, selector = null) {
    try {
      if (selector) {
        await this.page.focus(selector);
        await this.randomDelay(300, 700); // Pause after focusing
      }
      
      // Type with human-like delays and occasional mistakes
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        // Occasionally make a "typo" and correct it (5% chance)
        if (Math.random() < 0.05 && i < text.length - 1) {
          // Type wrong character
          const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
          await this.page.keyboard.type(wrongChar);
          await this.randomDelay(100, 300);
          
          // Backspace to correct
          await this.page.keyboard.press('Backspace');
          await this.randomDelay(200, 500);
        }
        
        // Type the correct character
        await this.page.keyboard.type(char);
        
        // Variable typing speed (faster for common words, slower for complex ones)
        const delay = char === ' ' ? randomBetween(150, 400) : randomBetween(50, 200);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      console.warn('⚠️ Error during typing simulation:', error.message);
    }
  }

  async simulateReading(minTime = 3000, maxTime = 8000) {
    console.log('📖 Simulating reading behavior...');
    
    try {
      const readingTime = randomBetween(minTime, maxTime);
      const startTime = Date.now();
      
      // Simulate eye movement patterns while reading
      while (Date.now() - startTime < readingTime) {
        // Small mouse movements to simulate eye tracking
        const viewport = await this.page.viewport();
        const currentPos = await this.page.evaluate(() => ({ x: 0, y: 0 })); // Get current mouse position if possible
        
        // Small movements within reading area (center of screen)
        const centerX = viewport.width / 2;
        const centerY = viewport.height / 2;
        const readingAreaX = centerX + randomBetween(-300, 300);
        const readingAreaY = centerY + randomBetween(-200, 200);
        
        await this.page.mouse.move(
          Math.max(0, Math.min(viewport.width, readingAreaX)),
          Math.max(0, Math.min(viewport.height, readingAreaY))
        );
        
        await new Promise(resolve => setTimeout(resolve, randomBetween(800, 2000)));
      }
      
    } catch (error) {
      console.warn('⚠️ Error during reading simulation:', error.message);
    }
  }

  async humanLikeScroll() {
    console.log('🖱️ Performing human-like scrolling...');
    
    // Get page height for calculations
    const pageHeight = await this.page.evaluate(() => document.body.scrollHeight);
    
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

  async randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`⏱️ Waiting ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = delay * 0.1 * Math.random(); // Add 10% jitter
    const finalDelay = Math.floor(delay + jitter);
    
    console.log(`⏳ Exponential backoff: attempt ${attempt + 1}, waiting ${finalDelay}ms`);
    await new Promise(resolve => setTimeout(resolve, finalDelay));
  }

  // Method to ensure we have a fresh page for each scrape
  async ensureFreshPage() {
    try {
      // If page exists and is not closed, clear it
      if (this.page && !this.page.isClosed()) {
        console.log('🧹 Clearing page state...');
        
        // Clear cookies, local storage, and session storage
        await this.page.evaluate(() => {
          // Clear local storage
          if (window.localStorage) {
            window.localStorage.clear();
          }
          // Clear session storage
          if (window.sessionStorage) {
            window.sessionStorage.clear();
          }
        });
        
        // Navigate to about:blank to clear the page
        await this.page.goto('about:blank');
        
        console.log('✅ Page state cleared');
      } else {
        // Create a new page if current one is closed
        console.log('📄 Creating fresh page...');
        this.page = await this.browser.newPage();
        
        // Reapply settings
        this.page.setDefaultNavigationTimeout(this.options.navigationTimeout);
        this.page.setDefaultTimeout(this.options.waitTimeout);
        await this.page.setUserAgent(this.options.userAgent);
        await this.page.setViewport(this.options.viewport);
        
        // Set extra headers
        await this.page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0'
        });
        
        console.log('✅ Fresh page created and configured');
      }
    } catch (error) {
      console.warn('⚠️ Error ensuring fresh page:', error.message);
      // If there's an error, try to create a completely new page
      try {
        this.page = await this.browser.newPage();
        console.log('✅ Created new page after error');
      } catch (newPageError) {
        console.error('❌ Failed to create new page:', newPageError.message);
        throw newPageError;
      }
    }
  }

  // Add validation method before scrapeProfile
  validateProfileContent(html, url) {
    const $ = cheerio.load(html);
    
    // Check for guest page indicators
    const pageKey = $('meta[name="pageKey"]').attr('content');
    if (pageKey && pageKey.includes('guest-home')) {
      console.log('❌ Content validation failed: Guest homepage detected');
      return false;
    }
    
    // Check for login page indicators
    if (html.includes('authwall') || html.includes('login-form') || html.includes('sign-in')) {
      console.log('❌ Content validation failed: Login page detected');
      return false;
    }
    
    // Check for actual profile content
    const hasProfileElements = (
      $('.pv-top-card').length > 0 ||
      $('[data-section="summary"]').length > 0 ||
      $('.profile-section').length > 0 ||
      $('.pv-entity__summary-info').length > 0 ||
      $('h1').text().trim().length > 0
    );
    
    if (!hasProfileElements) {
      console.log('❌ Content validation failed: No profile elements found');
      return false;
    }
    
    console.log('✅ Content validation passed: Profile elements detected');
    return true;
  }

  async scrapeProfile(url, account) {
    console.log(`🔍 Scraping profile: ${url}`);
    
    // Clear previous Voyager responses before each scrape
    if (this.options.useVoyager) {
      this.voyagerResponses = [];
      console.log('🧹 Cleared previous Voyager responses');
    }
    
    // Ensure we have a fresh page for each scrape
    await this.ensureFreshPage();
    
    // Add initial random delay to simulate human browsing patterns
    await this.randomDelay(1000, 3000);
    
    for (let attempt = 0; attempt < this.options.retryAttempts; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt + 1}/${this.options.retryAttempts}`);
        
        // Add exponential backoff delay for retries
        if (attempt > 0) {
          await this.exponentialBackoff(attempt - 1);
        }
        
        // Verify authentication before scraping
        if (account && account.cookies) {
          const authSuccess = await this.injectCookies(account.cookies);
          if (!authSuccess) {
            console.warn('⚠️ Authentication may be insufficient for this profile');
          }
          // Add delay after cookie injection
          await this.randomDelay(1500, 3000);
        } else {
          console.warn('⚠️ No authentication cookies provided - scraping may be limited');
        }

        // Add random delay before navigation (simulate thinking time)
        await this.randomDelay(2000, 5000);

        // Simulate mouse movement before navigation
        await this.simulateMouseMovement();

        // Enhanced navigation with retry mechanism and page reloads
        console.log('🌐 Navigating to profile URL...');
        let response;
        
        for (let navAttempt = 1; navAttempt <= 3; navAttempt++) {
          try {
            response = await this.page.goto(url, { 
              waitUntil: 'networkidle2',
              timeout: 120000 
            });
            console.log(`✅ Navigation successful on attempt ${navAttempt}`);
            break; // Success, exit retry loop
          } catch (navError) {
            console.log(`❌ Navigation attempt ${navAttempt} failed:`, navError.message);
            
            if (navAttempt < 3) {
              console.log('🔄 Reloading page and retrying navigation...');
              try {
                await this.page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
                await new Promise(resolve => setTimeout(resolve, 2000 * navAttempt)); // Progressive delay
              } catch (reloadError) {
                console.warn('⚠️ Page reload failed:', reloadError.message);
              }
            } else {
              throw navError; // Re-throw on final attempt
            }
          }
        }

        // Add delay after navigation
        await this.randomDelay(1000, 2500);

        // Check if we were redirected to login or guest page
        const currentUrl = this.page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('guest-home') || currentUrl.includes('authwall')) {
          console.log('⚠️ Redirected to login/guest page - profile requires authentication');
          
          // If we have account cookies, try re-injecting them
          if (account && account.cookies) {
            console.log('🔄 Re-injecting authentication cookies...');
            await this.injectCookies(account.cookies);
            
            // Wait a moment for cookies to take effect
            await this.randomDelay(2000, 4000);
          }
          
          // Try to access the profile directly with better headers
          await this.page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://www.linkedin.com/'
          });

          // Add delay before retry
          await this.randomDelay(1500, 3000);

          // Try again with different approach
          await this.page.goto(url, { 
            waitUntil: ['networkidle2'],
            timeout: this.options.navigationTimeout 
          });
          
          // Check again if we're still on login/guest page
          const finalUrl = this.page.url();
          if (finalUrl.includes('/login') || finalUrl.includes('guest-home') || finalUrl.includes('authwall')) {
            console.error('❌ Still redirected to login page after retry - authentication failed');
            
            // If this is not the last attempt, continue to retry
            if (attempt < this.options.retryAttempts - 1) {
              console.log('🔄 Will retry with different approach...');
              continue;
            }
            
            return {
              success: false,
              error: 'Authentication required - redirected to login page',
              url: url,
              content_validation: 'failed',
              validation_status: 'authentication_required'
            };
          }
        }

        // Wait for LinkedIn's dynamic content to load
        console.log('⏳ Waiting for dynamic content to load...');
        
        // Wait for potential profile elements to appear
        try {
          await this.page.waitForSelector('main, [data-section="summary"], .pv-top-card, .profile-section', { 
            timeout: this.options.waitTimeout 
          });
        } catch (e) {
          console.log('⚠️ Profile elements not found, continuing with available content');
        }

        // Additional wait for JavaScript rendering with random delay
        await this.randomDelay(3000, 6000);

        // Simulate mouse movement before scrolling
        await this.simulateMouseMovement();

        // Perform human-like scrolling to trigger lazy loading
        await this.humanLikeScroll();

        // Add random pause (simulate reading/thinking)
        await this.randomDelay(2000, 4000);

        // Simulate reading behavior
        await this.simulateReading();

        // Random mouse movement during reading
        await this.simulateMouseMovement();

        // Wait a bit more after interactions
        await this.randomDelay(2000, 4000);

        // Get page HTML after all interactions
        const html = await this.page.content();
        
        // Validate that we have actual profile content
        const isValidProfile = this.validateProfileContent(html, url);
        
        // Save HTML page locally
        const filename = this.generateFilename(url, 'profile');
        await this.saveHtmlPage(html, filename);

        // Extract structured data
        const profileData = await this.extractProfileData(html, url);
        
        // Add validation status to the data
        profileData.content_validation = isValidProfile ? 'valid' : 'guest_page_or_blocked';
        
        // Extract Voyager API data if enabled
        let voyagerData = null;
        if (this.options.useVoyager) {
          console.log('🔍 Processing Voyager API responses...');
          voyagerData = this.extractVoyagerProfileData();
        }
        
        console.log(`✅ Profile scraped: ${profileData.full_name || 'Unknown'} (${profileData.content_validation})`);
        
        const result = {
          url,
          status: isValidProfile ? 'success' : 'partial',
          data: profileData,
          html_file: filename,
          scraped_at: new Date().toISOString(),
          success: true,
          attempt: attempt + 1
        };
        
        // Add Voyager data if available
        if (voyagerData) {
          result.voyagerData = voyagerData;
        }
        
        return result;

      } catch (error) {
        console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);
        
        // If this is the last attempt, throw the error
        if (attempt === this.options.retryAttempts - 1) {
          console.error('❌ All retry attempts exhausted');
          throw error;
        }
        
        // For navigation timeout errors, try refreshing the page
        if (error.message.includes('Navigation timeout') || error.message.includes('timeout')) {
          console.log('🔄 Navigation timeout detected, will retry with page refresh...');
          try {
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
          } catch (reloadError) {
            console.log('⚠️ Page reload failed, continuing to next attempt...');
          }
        }
        
        console.log(`🔄 Retrying in a moment... (${this.options.retryAttempts - attempt - 1} attempts remaining)`);
      }
    }
  }

  // Add company validation method
  validateCompanyContent(html, url) {
    const $ = cheerio.load(html);
    
    // Check for guest page indicators
    const pageKey = $('meta[name="pageKey"]').attr('content');
    if (pageKey && pageKey.includes('guest-home')) {
      console.log('❌ Company content validation failed: Guest homepage detected');
      return false;
    }
    
    // Check for login page indicators
    if (html.includes('authwall') || html.includes('login-form') || html.includes('sign-in')) {
      console.log('❌ Company content validation failed: Login page detected');
      return false;
    }
    
    // Check for actual company content
    const hasCompanyElements = (
      $('.org-top-card').length > 0 ||
      $('.company-page').length > 0 ||
      $('[data-section="overview"]').length > 0 ||
      $('.org-page-navigation').length > 0 ||
      $('h1').text().trim().length > 0
    );
    
    if (!hasCompanyElements) {
      console.log('❌ Company content validation failed: No company elements found');
      return false;
    }
    
    console.log('✅ Company content validation passed: Company elements detected');
    return true;
  }

  async scrapeCompany(url, account) {
    console.log(`🏢 Scraping company: ${url}`);
    
    // Clear previous Voyager responses before each scrape
    if (this.options.useVoyager) {
      this.voyagerResponses = [];
      console.log('🧹 Cleared previous Voyager responses');
    }
    
    // Ensure we have a fresh page for each scrape
    await this.ensureFreshPage();
    
    // Add initial random delay to simulate human browsing patterns
    await this.randomDelay(1000, 3000);
    
    for (let attempt = 0; attempt < this.options.retryAttempts; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt + 1}/${this.options.retryAttempts}`);
        
        // Add exponential backoff delay for retries
        if (attempt > 0) {
          await this.exponentialBackoff(attempt - 1);
        }
        
        // Verify authentication before scraping
        if (account && account.cookies) {
          const authSuccess = await this.injectCookies(account.cookies);
          if (!authSuccess) {
            console.warn('⚠️ Authentication may be insufficient for this company page');
          }
          // Add delay after cookie injection
          await this.randomDelay(1500, 3000);
        }

        // Add random delay before navigation (simulate thinking time)
        await this.randomDelay(2000, 5000);

        // Simulate mouse movement before navigation
        await this.simulateMouseMovement();

        // Enhanced navigation with retry mechanism and page reloads
        console.log('🌐 Navigating to company URL...');
        let response;
        
        for (let navAttempt = 1; navAttempt <= 3; navAttempt++) {
          try {
            response = await this.page.goto(url, { 
              waitUntil: 'networkidle2',
              timeout: 120000 
            });
            console.log(`✅ Navigation successful on attempt ${navAttempt}`);
            break; // Success, exit retry loop
          } catch (navError) {
            console.log(`❌ Navigation attempt ${navAttempt} failed:`, navError.message);
            
            if (navAttempt < 3) {
              console.log('🔄 Reloading page and retrying navigation...');
              try {
                await this.page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
                await new Promise(resolve => setTimeout(resolve, 2000 * navAttempt)); // Progressive delay
              } catch (reloadError) {
                console.warn('⚠️ Page reload failed:', reloadError.message);
              }
            } else {
              throw navError; // Re-throw on final attempt
            }
          }
        }

        // Add delay after navigation
        await this.randomDelay(1000, 2500);

        // Wait for page to fully load with random delay
        await this.randomDelay(3000, 6000);

        // Simulate mouse movement before scrolling
        await this.simulateMouseMovement();

        // Perform human-like scrolling
        await this.humanLikeScroll();

        // Add random pause (simulate reading/thinking)
        await this.randomDelay(2000, 4000);

        // Simulate reading behavior
        await this.simulateReading();

        // Random mouse movement during reading
        await this.simulateMouseMovement();

        // Additional wait after interactions
        await this.randomDelay(2000, 4000);

        // Get page HTML
        const html = await this.page.content();
        
        // Validate that we have actual company content
        const isValidCompany = this.validateCompanyContent(html, url);
        
        // Save HTML page locally
        const filename = this.generateFilename(url, 'company');
        await this.saveHtmlPage(html, filename);

        // Extract structured data
        const companyData = await this.extractCompanyData(html, url);
        
        // Add validation status to the data
        companyData.content_validation = isValidCompany ? 'valid' : 'guest_page_or_blocked';
        
        // Extract Voyager API data if enabled
        let voyagerData = null;
        if (this.options.useVoyager) {
          console.log('🔍 Processing Voyager API responses...');
          voyagerData = this.extractVoyagerCompanyData();
        }
        
        console.log(`✅ Company scraped: ${companyData.company_name || 'Unknown'} (${companyData.content_validation})`);
        
        const result = {
          url,
          status: isValidCompany ? 'success' : 'partial',
          data: companyData,
          html_file: filename,
          scraped_at: new Date().toISOString(),
          account_used: account.account_name,
          validation_status: companyData.content_validation,
          success: true,
          attempt: attempt + 1
        };
        
        // Add Voyager data if available
        if (voyagerData) {
          result.voyagerData = voyagerData;
        }
        
        return result;
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);
        
        // If this is the last attempt, return error result
        if (attempt === this.options.retryAttempts - 1) {
          console.error('❌ All retry attempts exhausted');
          return {
            url,
            status: 'failed',
            error: error.message,
            scraped_at: new Date().toISOString(),
            account_used: account.account_name,
            success: false,
            attempts_made: this.options.retryAttempts
          };
        }
        
        // For navigation timeout errors, try refreshing the page
        if (error.message.includes('Navigation timeout') || error.message.includes('timeout')) {
          console.log('🔄 Navigation timeout detected, will retry with page refresh...');
          try {
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
          } catch (reloadError) {
            console.log('⚠️ Page reload failed, continuing to next attempt...');
          }
        }
        
        console.log(`🔄 Retrying in a moment... (${this.options.retryAttempts - attempt - 1} attempts remaining)`);
      }
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
    
    console.log('🔍 Extracting profile data with improved selectors...');
    
    // Enhanced selectors for different LinkedIn layouts
    const selectors = {
      name: [
        'h1.text-heading-xlarge',
        'h1.pv-top-card--list-bullet h1',
        '.pv-text-details__left-panel h1',
        '.ph5.pb5 h1',
        'h1[data-anonymize="person-name"]',
        '.pv-top-card-v2-ctas h1',
        'main h1',
        'h1'
      ],
      headline: [
        '.text-body-medium.break-words',
        '.pv-text-details__left-panel .text-body-medium',
        '.pv-top-card--list-bullet .text-body-medium',
        '.ph5.pb5 .text-body-medium',
        '.pv-top-card-v2-ctas .text-body-medium',
        '.pv-entity__summary-info h2',
        '.pv-top-card-section__headline',
        '[data-anonymize="headline"]'
      ],
      location: [
        '.text-body-small.inline.t-black--light.break-words',
        '.pv-text-details__left-panel .text-body-small',
        '.pv-top-card--list-bullet .text-body-small',
        '.ph5.pb5 .text-body-small',
        '.pv-entity__summary-info .pv-entity__secondary-title',
        '.pv-top-card-section__location'
      ],
      about: [
        '[data-section="summary"] .pv-shared-text-with-see-more span[aria-hidden="true"]',
        '.pv-about-section .pv-shared-text-with-see-more span',
        '.summary-section .pv-entity__summary-info',
        '[data-section="summary"] .inline-show-more-text',
        '.about-section .pv-shared-text-with-see-more'
      ],
      experience: [
        '[data-section="experience"] .pvs-list__item--line-separated',
        '.experience-section .pv-entity__summary-info',
        '.pv-profile-section__card-item-v2'
      ],
      education: [
        '[data-section="education"] .pvs-list__item--line-separated',
        '.education-section .pv-entity__summary-info',
        '.pv-profile-section__card-item-v2'
      ],
      skills: [
        '[data-section="skills"] .pvs-list__item--line-separated',
        '.skills-section .pv-skill-category-entity',
        '.pv-skill-categories-section__expanded'
      ]
    };

    // Helper function to try multiple selectors
    const trySelectors = (selectorArray, attribute = null) => {
      for (const selector of selectorArray) {
        const element = $(selector).first();
        if (element.length > 0) {
          const text = attribute ? element.attr(attribute) : element.text().trim();
          if (text && text.length > 0) {
            console.log(`✅ Found data with selector: ${selector}`);
            return text;
          }
        }
      }
      return null;
    };

    // Extract data using improved selectors
    const fullName = trySelectors(selectors.name) || this.extractText($, 'h1.text-heading-xlarge, .pv-text-details__left-panel h1, .top-card-layout__title') || '';
    const headline = trySelectors(selectors.headline) || this.extractText($, '.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium, .top-card-layout__headline') || '';
    const location = trySelectors(selectors.location) || this.extractText($, '.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small, .top-card-layout__first-subline') || '';
    const about = trySelectors(selectors.about) || this.extractText($, '#about ~ * .pv-shared-text-with-see-more, .pv-about-section .pv-about__summary-text, section[data-section="summary"] .pv-about__summary-text') || '';
    
    // Extract experience (first job)
    let currentJobTitle = '';
    let currentCompany = '';
    
    const experienceElements = $('[data-section="experience"] .pvs-list__item--line-separated').first();
    if (experienceElements.length > 0) {
      const positionText = experienceElements.find('.mr1.t-bold span[aria-hidden="true"]').text().trim();
      const companyText = experienceElements.find('.t-14.t-normal span[aria-hidden="true"]').text().trim();
      
      if (positionText) currentJobTitle = positionText;
      if (companyText) currentCompany = companyText.split(' · ')[0]; // Remove duration info
    }
    
    // Fallback to original selectors if new ones didn't work
    if (!currentJobTitle) {
      currentJobTitle = this.extractText($, '.experience-section .pv-entity__summary-info h3, .pvs-entity__caption-wrapper h3, .experience-item__title');
    }
    if (!currentCompany) {
      currentCompany = this.extractText($, '.experience-section .pv-entity__secondary-title, .pvs-entity__caption-wrapper .t-14, .experience-item__subtitle');
    }
    
    // Extract profile data using various selectors
    const profileData = {
      profile_url: url,
      full_name: fullName,
      headline: headline,
      about: about.substring(0, 1000), // Limit length
      location: location,
      industry: this.extractText($, '.pv-text-details__left-panel .text-body-small:nth-child(3), .top-card-layout__second-subline'),
      current_job_title: currentJobTitle,
      current_company: currentCompany,
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
    
    console.log(`📊 Extracted profile data:`, {
      name: profileData.full_name,
      headline: profileData.headline,
      location: profileData.location,
      position: profileData.current_job_title,
      company: profileData.current_company
    });
    
    return profileData;
  }

  async extractCompanyData(html, url) {
    const $ = cheerio.load(html);
    
    console.log('🔍 Extracting company data with improved selectors...');
    
    // Enhanced selectors for different LinkedIn company layouts
    const selectors = {
      name: [
        'h1.org-top-card-summary__title',
        '.org-top-card-summary-info-list__info-item h1',
        '.org-page-navigation__title',
        '.company-page h1',
        'h1[data-anonymize="company-name"]',
        'main h1',
        'h1'
      ],
      tagline: [
        '.org-top-card-summary__tagline',
        '.org-top-card-summary-info-list__info-item .t-black--light',
        '.company-tagline',
        '.org-about-company-module__company-description'
      ],
      industry: [
        '.org-top-card-summary-info-list__info-item:contains("Industry") dd',
        '.org-about-company-module__company-staff-count-range',
        '.company-industries'
      ],
      size: [
        '.org-top-card-summary-info-list__info-item:contains("Company size") dd',
        '.org-about-company-module__company-staff-count-range',
        '.company-size'
      ],
      location: [
        '.org-top-card-summary-info-list__info-item:contains("Headquarters") dd',
        '.org-about-company-module__headquarters',
        '.company-location'
      ],
      website: [
        '.org-about-company-module__company-page-url a',
        '.company-website a',
        'a[data-tracking-control-name="about_website"]'
      ],
      description: [
        '.org-about-company-module__company-description',
        '.company-description',
        '.about-company-description'
      ]
    };

    // Helper function to try multiple selectors
    const trySelectors = (selectorArray, attribute = null) => {
      for (const selector of selectorArray) {
        const element = $(selector).first();
        if (element.length > 0) {
          const text = attribute ? element.attr(attribute) : element.text().trim();
          if (text && text.length > 0) {
            console.log(`✅ Found company data with selector: ${selector}`);
            return text;
          }
        }
      }
      return null;
    };

    // Extract data using improved selectors
    const companyName = trySelectors(selectors.name) || 'Unknown';
    const tagline = trySelectors(selectors.tagline) || 'Unknown';
    const industry = trySelectors(selectors.industry) || 'Unknown';
    const companySize = trySelectors(selectors.size) || 'Unknown';
    const location = trySelectors(selectors.location) || 'Unknown';
    const website = trySelectors(selectors.website, 'href') || trySelectors(selectors.website) || 'Unknown';
    const description = trySelectors(selectors.description) || 'Unknown';

    // Extract follower count
    let followerCount = 'Unknown';
    const followerElement = $('.org-top-card-summary-info-list__info-item').filter((i, elem) => {
      return $(elem).text().includes('followers');
    });
    if (followerElement.length > 0) {
      const followerText = followerElement.text().trim();
      const match = followerText.match(/([\d,]+)\s+followers/);
      if (match) {
        followerCount = match[1];
      }
    }

    const companyData = {
      company_url: url,
      company_name: companyName,
      company_tagline: tagline,
      company_industry: industry,
      company_size: companySize,
      company_hq: location,
      company_website: website,
      company_description: description.substring(0, 1000), // Limit length
      company_followers: followerCount,
      
      // Metadata
      scraped_at: new Date().toISOString(),
      scraper_version: '1.0.0'
    };

    console.log(`📊 Extracted company data:`, {
      name: companyData.company_name,
      industry: companyData.company_industry,
      size: companyData.company_size,
      location: companyData.company_hq,
      followers: companyData.company_followers
    });

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
    console.log('🧹 Closing LinkedIn Scraper...');
    
    // Close the page if it exists and is not already closed
    if (this.page && !this.page.isClosed()) {
      try {
        await this.page.close();
        console.log('📄 Page closed successfully');
      } catch (error) {
        console.warn('⚠️ Error closing page:', error.message);
      }
      this.page = null;
    }
    
    // Decrease reference count and close browser if no more references
    if (browserInstance) {
      browserRefCount--;
      console.log(`📊 Browser reference count: ${browserRefCount}`);
      
      if (browserRefCount <= 0) {
        try {
          await browserInstance.close();
          console.log('🌐 Browser instance closed');
          browserInstance = null;
          browserRefCount = 0;
        } catch (error) {
          console.warn('⚠️ Error closing browser:', error.message);
        }
      }
    }
    
    this.browser = null;
    console.log('🔒 LinkedIn Scraper closed');
  }

  // Static method to force close all browser instances (for cleanup)
  static async forceCloseAll() {
    if (browserInstance) {
      try {
        await browserInstance.close();
        console.log('🌐 Force closed browser instance');
      } catch (error) {
        console.warn('⚠️ Error force closing browser:', error.message);
      }
      browserInstance = null;
      browserRefCount = 0;
    }
  }

  // Method to get current browser stats
  static getBrowserStats() {
    return {
      hasInstance: !!browserInstance,
      refCount: browserRefCount
    };
  }

  // Concurrency management methods
  async waitForAvailableSlot(operationId) {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (this.activeScrapes.size < this.maxConcurrentScrapes) {
          this.activeScrapes.add(operationId);
          console.log(`🚀 Starting scrape ${operationId} (${this.activeScrapes.size}/${this.maxConcurrentScrapes} active)`);
          resolve();
        } else {
          console.log(`⏳ Waiting for available slot... (${this.activeScrapes.size}/${this.maxConcurrentScrapes} active)`);
          setTimeout(checkSlot, 1000); // Check every second
        }
      };
      checkSlot();
    });
  }

  releaseSlot(operationId) {
    this.activeScrapes.delete(operationId);
    console.log(`✅ Released scrape slot ${operationId} (${this.activeScrapes.size}/${this.maxConcurrentScrapes} active)`);
  }

  // Enhanced scraping methods with concurrency control
  async scrapeProfileWithConcurrency(url, account) {
    const operationId = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await this.waitForAvailableSlot(operationId);
      return await this.scrapeProfile(url, account);
    } finally {
      this.releaseSlot(operationId);
    }
  }

  async scrapeCompanyWithConcurrency(url, account) {
    const operationId = `company-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await this.waitForAvailableSlot(operationId);
      return await this.scrapeCompany(url, account);
    } finally {
      this.releaseSlot(operationId);
    }
  }

  // Batch processing with concurrency limits
  async scrapeBatch(urls, account, type = 'profile') {
    console.log(`📦 Starting batch scrape of ${urls.length} ${type}s with max concurrency: ${this.maxConcurrentScrapes}`);
    
    const results = [];
    const promises = urls.map(async (url, index) => {
      try {
        let result;
        if (type === 'profile') {
          result = await this.scrapeProfileWithConcurrency(url, account);
        } else {
          result = await this.scrapeCompanyWithConcurrency(url, account);
        }
        
        return { index, url, result, success: true };
      } catch (error) {
        console.error(`❌ Batch item ${index + 1} failed:`, error.message);
        return { index, url, error: error.message, success: false };
      }
    });

    // Wait for all promises to complete
    const batchResults = await Promise.allSettled(promises);
    
    // Process results
    for (const promiseResult of batchResults) {
      if (promiseResult.status === 'fulfilled') {
        results.push(promiseResult.value);
      } else {
        results.push({
          error: promiseResult.reason.message,
          success: false
        });
      }
    }

    console.log(`📊 Batch complete: ${results.filter(r => r.success).length}/${urls.length} successful`);
    return results;
  }

  // Voyager API data extraction methods
  
  /**
   * Extract profile data from captured Voyager API responses
   * @returns {Object|null} Extracted profile data from Voyager APIs
   */
  extractVoyagerProfileData() {
    if (!this.voyagerResponses || this.voyagerResponses.length === 0) {
      console.log('📭 No Voyager API responses captured');
      return null;
    }

    console.log(`🔍 Processing ${this.voyagerResponses.length} Voyager API responses`);
    
    const profileData = {
      identity: null,
      positions: null,
      skills: null,
      education: null,
      recommendations: null,
      raw_responses: []
    };

    for (const response of this.voyagerResponses) {
      try {
        const { url, json } = response;
        
        // Store raw response for debugging
        profileData.raw_responses.push({
          url: url,
          endpoint: url.split('/voyager/api/')[1],
          timestamp: response.timestamp
        });

        // Extract profile identity data
        if (url.includes('/voyager/api/identity/profiles/')) {
          if (url.includes('/positions')) {
            profileData.positions = json;
            console.log('✅ Extracted positions data from Voyager API');
          } else if (url.includes('/skills')) {
            profileData.skills = json;
            console.log('✅ Extracted skills data from Voyager API');
          } else if (url.includes('/education')) {
            profileData.education = json;
            console.log('✅ Extracted education data from Voyager API');
          } else if (url.includes('/recommendations')) {
            profileData.recommendations = json;
            console.log('✅ Extracted recommendations data from Voyager API');
          } else {
            // Basic profile info
            profileData.identity = json;
            console.log('✅ Extracted identity data from Voyager API');
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to process Voyager response: ${error.message}`);
      }
    }

    return profileData;
  }

  /**
   * Extract company data from captured Voyager API responses
   * @returns {Object|null} Extracted company data from Voyager APIs
   */
  extractVoyagerCompanyData() {
    if (!this.voyagerResponses || this.voyagerResponses.length === 0) {
      console.log('📭 No Voyager API responses captured');
      return null;
    }

    console.log(`🔍 Processing ${this.voyagerResponses.length} Voyager API responses`);
    
    const companyData = {
      organization: null,
      employees: null,
      updates: null,
      jobs: null,
      raw_responses: []
    };

    for (const response of this.voyagerResponses) {
      try {
        const { url, json } = response;
        
        // Store raw response for debugging
        companyData.raw_responses.push({
          url: url,
          endpoint: url.split('/voyager/api/')[1],
          timestamp: response.timestamp
        });

        // Extract company organization data
        if (url.includes('/voyager/api/organization/companies/')) {
          if (url.includes('/employees')) {
            companyData.employees = json;
            console.log('✅ Extracted employees data from Voyager API');
          } else if (url.includes('/updates')) {
            companyData.updates = json;
            console.log('✅ Extracted updates data from Voyager API');
          } else if (url.includes('/jobs')) {
            companyData.jobs = json;
            console.log('✅ Extracted jobs data from Voyager API');
          } else {
            // Basic company info
            companyData.organization = json;
            console.log('✅ Extracted organization data from Voyager API');
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to process Voyager response: ${error.message}`);
      }
    }

    return companyData;
  }

  /**
   * Optional helper to directly fetch Voyager API endpoints
   * @param {string} url - The Voyager API URL to fetch
   * @returns {Promise<Object|null>} JSON response or null if failed
   */
  async fetchVoyagerDirect(url) {
    if (!this.page) {
      console.error('❌ Page not initialized for direct Voyager fetch');
      return null;
    }

    try {
      console.log(`🔗 Direct Voyager API fetch: ${url}`);
      
      // Extract CSRF token from JSESSIONID cookie
      const cookies = await this.page.cookies();
      const jsessionCookie = cookies.find(cookie => cookie.name === 'JSESSIONID');
      
      if (!jsessionCookie) {
        console.warn('⚠️ JSESSIONID cookie not found for CSRF token');
        return null;
      }

      // Use page.evaluate to make the fetch request with proper headers
      const result = await this.page.evaluate(async (apiUrl, jsessionId) => {
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/vnd.linkedin.normalized+json+2.1',
              'csrf-token': jsessionId,
              'x-restli-protocol-version': '2.0.0'
            },
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return await response.json();
        } catch (error) {
          return { error: error.message };
        }
      }, url, jsessionCookie.value);

      if (result.error) {
        console.error(`❌ Direct Voyager fetch failed: ${result.error}`);
        return null;
      }

      console.log('✅ Direct Voyager API fetch successful');
      return result;
    } catch (error) {
      console.error(`❌ Direct Voyager fetch error: ${error.message}`);
      return null;
    }
  }
}

module.exports = LinkedInScraper;