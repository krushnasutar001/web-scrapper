/**
 * LinkedIn Account Manager - Express.js Backend
 * Simple account management with validation status tracking
 */

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const BulkScrapingService = require('./services/bulkScrapingService');
const StealthLinkedInScraper = require('./services/stealth-linkedin-scraper');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'LinkedIn Automation Backend'
  });
});

// Bulk company scraping endpoint
app.post('/api/company/scrape-bulk', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Parse CSV file
    const csvData = req.file.buffer.toString('utf8');
    const lines = csvData.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'CSV file must contain at least a header row and one data row'
      });
    }

    // Extract URLs from CSV (assuming first column contains URLs)
    const urls = [];
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns[0] && columns[0].trim()) {
        urls.push(columns[0].trim());
      }
    }

    if (urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid URLs found in CSV file'
      });
    }

    // Create job using existing job creation logic
    const JobManager = require('./services/job-manager');
    const jobManager = new JobManager(db);
    
    const jobResult = await jobManager.createJob({
      jobName: `Company Bulk Scraping - ${new Date().toISOString()}`,
      jobType: 'companies',
      urls: urls,
      accountSelectionMode: 'rotation',
      selectedAccountIds: [],
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        jobId: jobResult.jobId,
        message: 'Bulk company scraping job created successfully',
        urlsProcessed: urls.length
      }
    });

  } catch (error) {
    console.error('Bulk company scraping error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bulk company scraping job'
    });
  }
});

// Bulk search export endpoint
app.post('/api/search/export-bulk', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Parse CSV file
    const csvData = req.file.buffer.toString('utf8');
    const lines = csvData.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'CSV file must contain at least a header row and one data row'
      });
    }

    // Extract search queries from CSV
    const searchQueries = [];
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns[0] && columns[0].trim()) {
        searchQueries.push(columns[0].trim());
      }
    }

    if (searchQueries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid search queries found in CSV file'
      });
    }

    // Create job for search queries
    const JobManager = require('./services/job-manager');
    const jobManager = new JobManager(db);
    
    const jobResult = await jobManager.createJob({
      jobName: `Search Bulk Export - ${new Date().toISOString()}`,
      jobType: 'sales_navigator',
      searchQuery: searchQueries.join(' OR '), // Combine queries
      accountSelectionMode: 'rotation',
      selectedAccountIds: [],
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        jobId: jobResult.jobId,
        message: 'Bulk search export job created successfully',
        queriesProcessed: searchQueries.length
      }
    });

  } catch (error) {
    console.error('Bulk search export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bulk search export job'
    });
  }
});

// Get job status
app.get('/api/jobs/:jobId/status', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const JobManager = require('./services/job-manager');
    const jobManager = new JobManager(db);
    
    const jobStatus = await jobManager.getJobStatus(jobId);
    
    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Check if user owns this job
    if (jobStatus.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      job: jobStatus
    });
    
  } catch (error) {
    console.error('❌ Failed to get job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

// Get job results
app.get('/api/jobs/:jobId/results', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { format = 'json' } = req.query;
    
    const JobManager = require('./services/job-manager');
    const jobManager = new JobManager(db);
    
    // Check if job exists and user owns it
    const jobStatus = await jobManager.getJobStatus(jobId);
    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    if (jobStatus.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const results = await jobManager.getJobResults(jobId, format);
    
    res.json({
      success: true,
      jobId,
      results,
      total: results.length,
      job_status: jobStatus.status
    });
    
  } catch (error) {
    console.error('❌ Failed to get job results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job results',
      details: error.message
    });
  }
});

// Download job results
app.get('/api/jobs/:jobId/download', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { format = 'csv' } = req.query;
    
    if (!['csv', 'json', 'excel'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Supported formats: csv, json, excel'
      });
    }
    
    const JobManager = require('./services/job-manager');
    const jobManager = new JobManager(db);
    
    // Check if job exists and user owns it
    const jobStatus = await jobManager.getJobStatus(jobId);
    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    if (jobStatus.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    if (jobStatus.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job is not completed yet',
        current_status: jobStatus.status
      });
    }
    
    // Generate results file
    const fileInfo = await jobManager.generateResultsFile(jobId, format);
    
    // Set appropriate headers for download
    const contentType = {
      csv: 'text/csv',
      json: 'application/json',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }[format];
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
    res.setHeader('Content-Length', fileInfo.size);
    
    // Stream the file
    const fs = require('fs');
    const fileStream = fs.createReadStream(fileInfo.filePath);
    fileStream.pipe(res);
    
    console.log(`📥 File downloaded: ${fileInfo.filename} (${fileInfo.recordCount} records)`);
    
  } catch (error) {
    console.error('❌ Failed to download results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download results',
      details: error.message
    });
  }
});

// Get all jobs for user
app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE user_id = ?';
    let params = [req.user.id];
    
    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }
    
    const query = `
      SELECT 
        id, job_name, job_type, status, created_at, started_at, 
        completed_at, total_urls, success_count, failure_count
      FROM scraping_jobs 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const [jobs] = await db.execute(query, params);
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM scraping_jobs ${whereClause}`;
    const [countResult] = await db.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      success: true,
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to get jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get jobs',
      details: error.message
    });
  }
});

// Database connection
let db;

// Initialize scraping database schema
async function initScrapingSchema() {
  try {
    console.log('📋 Initializing scraping database schema...');
    
    // Read and execute schema file
    const schemaPath = path.join(__dirname, 'database', 'scraping-schema.sql');
    const schemaSQL = await fs.readFile(schemaPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        await db.execute(statement.trim());
      }
    }
    
    console.log('✅ Scraping database schema initialized');
  } catch (error) {
    console.error('❌ Failed to initialize scraping schema:', error.message);
    // Don't exit - continue with basic functionality
  }
}

async function initDatabase() {
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Krushna_Sutar@0809',
      database: process.env.DB_NAME || 'linkedin_automation',
      charset: 'utf8mb4'
    });
    
    console.log('✅ Database connected successfully');
    
    // Test connection
    await db.execute('SELECT 1');
    
    // Initialize scraping database schema
    await initScrapingSchema();
    
    // Initialize bulk scraping service
    global.bulkScrapingService = new BulkScrapingService(db);
    console.log('🚀 Bulk scraping service initialized');
    
    // Initialize two-stage scraper service
    const TwoStageScraper = require('./services/two-stage-scraper');
    global.twoStageScraper = new TwoStageScraper(db);
    await global.twoStageScraper.start();
    console.log('🚀 Two-stage scraper service initialized');
    
    // Initialize stealth LinkedIn scraper service
    global.stealthScraper = new StealthLinkedInScraper(db);
    await global.stealthScraper.start();
    console.log('🕵️ Stealth LinkedIn scraper initialized');
    
    // Initialize account validator service
    const AccountValidator = require('./services/account-validator');
    global.accountValidator = new AccountValidator(db);
    await global.accountValidator.start();
    console.log('🚀 Account validator service initialized');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

// Playwright validation function
async function validateLinkedInAccount(account) {
  let browser = null;
  const startTime = Date.now();
  
  try {
    console.log(`🔍 Validating account: ${account.account_name || account.name || account.id}`);
    
    // Launch browser with enhanced stealth settings
    const browserOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-translate',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-report-upload',
        '--allow-running-insecure-content',
        '--disable-component-update',
        '--disable-background-networking',
        '--disable-add-to-shelf',
        '--disable-print-preview',
        '--disable-voice-input',
        '--disable-wake-on-wifi',
        '--disable-cookie-encryption',
        '--ignore-gpu-blacklist',
        '--enable-async-dns',
        '--enable-simple-cache-backend',
        '--enable-tcp-fast-open',
        '--media-cache-size=33554432',
        '--aggressive-cache-discard',
        '--enable-gpu-rasterization',
        '--enable-native-gpu-memory-buffers'
      ]
    };
    
    console.log('🚀 Launching browser with enhanced stealth settings...');
    browser = await chromium.launch(browserOptions);
    
    // Create context with realistic browser fingerprint
    const contextOptions = {
      userAgent: account.browser_user_agent || account.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { 
        width: account.browser_viewport_width || 1920, 
        height: account.browser_viewport_height || 1080 
      },
      locale: account.browser_locale || 'en-US',
      timezoneId: account.browser_timezone || 'America/New_York',
      permissions: ['geolocation', 'notifications'],
      colorScheme: 'light',
      reducedMotion: 'no-preference',
      forcedColors: 'none',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };
    
    console.log(`🌐 Browser settings:`);
    console.log(`   User Agent: ${contextOptions.userAgent.substring(0, 50)}...`);
    console.log(`   Viewport: ${contextOptions.viewport.width}x${contextOptions.viewport.height}`);
    console.log(`   Locale: ${contextOptions.locale}`);
    console.log(`   Timezone: ${contextOptions.timezoneId}`);
    
    // Add proxy if provided
    if (account.proxy_url) {
      contextOptions.proxy = { server: account.proxy_url };
      console.log(`🔗 Using proxy: ${account.proxy_url}`);
    }
    
    const context = await browser.newContext(contextOptions);
    
    // Add stealth patches and anti-detection measures
    await context.addInitScript(() => {
      // Disable navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Override plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Override chrome object
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Randomize canvas fingerprint
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
    
    console.log('🛡️ Stealth patches applied successfully');
    
    // Enhanced cookie handling with comprehensive LinkedIn cookie support
    let cookies;
    try {
      console.log('🍪 Processing cookies for LinkedIn authentication...');
      
      if (typeof account.session_cookie === 'string') {
        // Try to parse as JSON first
        try {
          cookies = JSON.parse(account.session_cookie);
          console.log(`   Parsed JSON cookies: ${cookies.length} cookies found`);
        } catch (jsonError) {
          // If JSON parsing fails, try base64 decoding first
          try {
            const decodedCookie = Buffer.from(account.session_cookie, 'base64').toString('utf8');
            cookies = JSON.parse(decodedCookie);
            console.log(`   Decoded base64 cookies: ${cookies.length} cookies found`);
          } catch (base64Error) {
            // If it's a simple cookie string, create comprehensive LinkedIn cookies
            console.log(`   Creating comprehensive cookie set from li_at value`);
            const liAtValue = account.session_cookie;
            
            // Create a comprehensive set of LinkedIn cookies
            cookies = [
              {
                name: 'li_at',
                value: liAtValue,
                domain: '.linkedin.com',
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'None'
              },
              {
                name: 'JSESSIONID',
                value: `ajax:${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
                domain: '.linkedin.com',
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'None'
              },
              {
                name: 'bscookie',
                value: `v=1&${new Date().toISOString().split('T')[0].replace(/-/g, '')}`,
                domain: '.linkedin.com',
                path: '/',
                secure: true,
                sameSite: 'None'
              },
              {
                name: 'bcookie',
                value: `v=2&${Math.random().toString(36).substr(2, 8)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 4)}-${Math.random().toString(36).substr(2, 12)}`,
                domain: '.linkedin.com',
                path: '/',
                secure: true,
                sameSite: 'None'
              },
              {
                name: 'lidc',
                value: `b=VGST02:s=V:r=V:a=V:p=V:g=${Math.floor(Date.now() / 1000)}:u=1:x=1:i=${Date.now()}`,
                domain: '.linkedin.com',
                path: '/',
                secure: true,
                sameSite: 'None'
              }
            ];
          }
        }
      } else {
        cookies = account.session_cookie;
      }
      
      // Ensure cookies have proper LinkedIn domains and security settings
      if (Array.isArray(cookies)) {
        cookies = cookies.map(cookie => {
          // Validate and fix sameSite values
          let sameSite = 'None'; // Default
          if (cookie.sameSite) {
            const validSameSite = ['Strict', 'Lax', 'None'];
            if (validSameSite.includes(cookie.sameSite)) {
              sameSite = cookie.sameSite;
            } else if (typeof cookie.sameSite === 'string') {
              // Try to match case-insensitive
              const match = validSameSite.find(valid => 
                valid.toLowerCase() === cookie.sameSite.toLowerCase()
              );
              sameSite = match || 'None';
            }
          }
          
          return {
            ...cookie,
            domain: (cookie.domain || '.linkedin.com').replace(/^www\./g, '.'), // Normalize domain
            path: cookie.path || '/',
            secure: cookie.secure !== false,
            sameSite: sameSite,
            value: (cookie.value || '').toString().replace(/^"|"$/g, '') // Remove quotes
          };
        });
        
        // Log cookie details for debugging
        console.log(`   Cookie details:`);
        cookies.forEach((cookie, index) => {
          console.log(`     ${index + 1}. ${cookie.name}: ${cookie.value.substring(0, 20)}... (domain: ${cookie.domain})`);
        });
        
        await context.addCookies(cookies);
        console.log(`🍪 Successfully added ${cookies.length} cookies to browser context`);
        
      } else if (cookies && typeof cookies === 'object') {
        // Single cookie object - apply same validation
        let sameSite = 'None'; // Default
        if (cookies.sameSite) {
          const validSameSite = ['Strict', 'Lax', 'None'];
          if (validSameSite.includes(cookies.sameSite)) {
            sameSite = cookies.sameSite;
          } else if (typeof cookies.sameSite === 'string') {
            // Try to match case-insensitive
            const match = validSameSite.find(valid => 
              valid.toLowerCase() === cookies.sameSite.toLowerCase()
            );
            sameSite = match || 'None';
          }
        }
        
        const singleCookie = {
          ...cookies,
          domain: (cookies.domain || '.linkedin.com').replace(/^www\./g, '.'), // Normalize domain
          path: cookies.path || '/',
          secure: cookies.secure !== false,
          sameSite: sameSite,
          value: (cookies.value || '').toString().replace(/^"|"$/g, '') // Remove quotes
        };
        
        await context.addCookies([singleCookie]);
        console.log(`🍪 Successfully added 1 cookie: ${singleCookie.name}`);
        
      } else {
        throw new Error('No valid cookies provided');
      }
      
    } catch (cookieError) {
      console.error(`❌ Cookie processing error:`, cookieError);
      throw new Error(`Cookie processing failed: ${cookieError.message}`);
    }
    
    // Navigate to LinkedIn with anti-detection strategy
    const page = await context.newPage();
    
    // Add additional stealth measures
    await page.addInitScript(() => {
      // Remove webdriver property
      delete navigator.webdriver;
      
      // Override the plugins property to use a custom getter
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override the languages property to use a custom getter
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
      
      // Override the webdriver property to use a custom getter
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });
    });
    
    console.log('🌐 Starting LinkedIn navigation with anti-detection...');
    
    try {
      // Step 1: Navigate to LinkedIn homepage first to establish session
      console.log('   Step 1: Loading LinkedIn homepage...');
      await page.goto('https://www.linkedin.com/', {
        waitUntil: 'networkidle',
        timeout: 20000
      });
      
      // Wait for initial page load
      await page.waitForTimeout(2000);
      
      // Check if we're already on a logged-in page
      const currentUrl = page.url();
      console.log(`   Current URL after homepage: ${currentUrl}`);
      
      if (currentUrl.includes('/feed') || currentUrl.includes('/in/')) {
        console.log('   ✅ Already redirected to authenticated page');
      } else {
        // Step 2: Try to navigate to feed
        console.log('   Step 2: Navigating to feed...');
        
        try {
          await page.goto('https://www.linkedin.com/feed/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          });
        } catch (feedError) {
          console.log(`   ⚠️  Feed navigation failed: ${feedError.message}`);
          
          // Step 3: Try alternative navigation methods
          console.log('   Step 3: Trying alternative navigation...');
          
          try {
            // Try clicking on feed link if available
            const feedLink = await page.$('a[href*="/feed"], a[href="/"]');
            if (feedLink) {
              await feedLink.click();
              await page.waitForTimeout(3000);
            } else {
              // Try direct URL navigation with different options
              await page.goto('https://www.linkedin.com/in/', {
                waitUntil: 'domcontentloaded',
                timeout: 10000
              });
            }
          } catch (altError) {
            console.log(`   ⚠️  Alternative navigation failed: ${altError.message}`);
            // Continue with current page for validation
          }
        }
      }
      
      // Wait for page to stabilize
      await page.waitForTimeout(3000);
      
    } catch (navigationError) {
      console.log(`⚠️  Navigation error: ${navigationError.message}`);
      // Continue with validation on current page
    }
    
    // Enhanced LinkedIn validation with multiple detection methods
    let isLoggedIn = false;
    let errorMessage = null;
    let validationDetails = {
      currentUrl: page.url(),
      pageTitle: '',
      bodyTextSample: '',
      foundElements: [],
      loginIndicators: [],
      feedIndicators: []
    };
    
    try {
      // Get page information
      validationDetails.pageTitle = await page.title();
      const bodyText = await page.locator('body').innerText();
      validationDetails.bodyTextSample = bodyText.substring(0, 500);
      
      console.log(`📄 Page URL: ${validationDetails.currentUrl}`);
      console.log(`📄 Page Title: ${validationDetails.pageTitle}`);
      
      // Method 1: Check URL - if we're redirected to login, we're not logged in
      const currentUrl = page.url().toLowerCase();
      if (currentUrl.includes('/login') || currentUrl.includes('/uas/login') || currentUrl.includes('/checkpoint')) {
        isLoggedIn = false;
        errorMessage = `Redirected to login page: ${currentUrl}`;
        console.log(`❌ URL Check: ${errorMessage}`);
      } else {
        console.log(`✅ URL Check: Not redirected to login (${currentUrl})`);
        
        // Method 2: Check for explicit login indicators (bad signs)
        const loginIndicators = [
          'sign in to linkedin',
          'join linkedin',
          'welcome back',
          'email or phone',
          'password',
          'forgot password',
          'sign in with',
          'create account'
        ];
        
        const foundLoginIndicators = loginIndicators.filter(indicator => 
          bodyText.toLowerCase().includes(indicator)
        );
        validationDetails.loginIndicators = foundLoginIndicators;
        
        // Method 3: Check for feed/authenticated content (good signs)
        const feedIndicators = [
          'start a post',
          'share an update',
          'what\'s on your mind',
          'feed',
          'home feed',
          'recent activity',
          'notifications',
          'messaging',
          'my network'
        ];
        
        const foundFeedIndicators = feedIndicators.filter(indicator => 
          bodyText.toLowerCase().includes(indicator)
        );
        validationDetails.feedIndicators = foundFeedIndicators;
        
        // Method 4: Check for authenticated DOM elements
        const authenticatedSelectors = [
          // Navigation elements
          '[data-test-id="nav-user-menu"]',
          '.global-nav__me',
          '.global-nav__primary-link',
          // Feed elements
          '.feed-shared-update-v2',
          '.share-box',
          '.artdeco-button--primary',
          // Layout elements
          '.scaffold-layout__sidebar',
          '.scaffold-layout__main',
          // Profile elements
          '.profile-photo',
          '.identity-headline',
          // Modern selectors
          '[data-test-id="share-box"]',
          '[aria-label="Start a post"]',
          '.share-creation-state__text-editor'
        ];
        
        let authenticatedElementsFound = 0;
        const foundElements = [];
        
        for (const selector of authenticatedSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              authenticatedElementsFound++;
              foundElements.push(selector);
            }
          } catch (e) {
            // Element not found, continue
          }
        }
        
        validationDetails.foundElements = foundElements;
        
        // Enhanced validation logic with multiple criteria
        const hasLoginIndicators = foundLoginIndicators.length > 0;
        const hasFeedIndicators = foundFeedIndicators.length > 0;
        const hasAuthElements = authenticatedElementsFound > 0;
        
        console.log(`🔍 Validation Analysis:`);
        console.log(`   Login indicators found: ${foundLoginIndicators.length} (${foundLoginIndicators.join(', ')})`);
        console.log(`   Feed indicators found: ${foundFeedIndicators.length} (${foundFeedIndicators.join(', ')})`);
        console.log(`   Auth elements found: ${authenticatedElementsFound} (${foundElements.slice(0, 3).join(', ')})`);
        
        // Determine login status with improved logic
        if (hasLoginIndicators && foundLoginIndicators.length >= 2) {
          // Strong indication of login page
          isLoggedIn = false;
          errorMessage = `Multiple login indicators detected: ${foundLoginIndicators.join(', ')}`;
        } else if (hasFeedIndicators || hasAuthElements) {
          // Positive indicators of being logged in
          isLoggedIn = true;
          errorMessage = null;
        } else if (hasLoginIndicators) {
          // Some login indicators but not strong enough
          isLoggedIn = false;
          errorMessage = `Login indicators detected: ${foundLoginIndicators.join(', ')}`;
        } else {
          // No clear indicators - check page content more carefully
          const pageContent = bodyText.toLowerCase();
          if (pageContent.includes('linkedin') && 
              (pageContent.includes('feed') || pageContent.includes('home') || pageContent.includes('network'))) {
            isLoggedIn = true;
            errorMessage = null;
          } else {
            isLoggedIn = false;
            errorMessage = `No authenticated content detected. Page may have loaded incorrectly.`;
          }
        }
      }
      
      console.log(`${isLoggedIn ? '✅' : '❌'} Account ${account.account_name || account.name || account.id}: ${isLoggedIn ? 'VALID' : 'INVALID'}`);
      if (errorMessage) {
        console.log(`   Reason: ${errorMessage}`);
      }
      if (isLoggedIn) {
        console.log(`   Success factors: ${validationDetails.feedIndicators.length} feed indicators, ${validationDetails.foundElements.length} auth elements`);
      }
      
    } catch (error) {
      isLoggedIn = false;
      errorMessage = `Validation error: ${error.message}`;
      console.log(`❌ Account ${account.account_name || account.name || account.id}: ERROR - ${errorMessage}`);
    }
    
    const responseTime = Date.now() - startTime;
    
    return {
      isValid: isLoggedIn,
      status: isLoggedIn ? 'ACTIVE' : 'INVALID',
      errorMessage,
      responseTime
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Validation failed for ${account.account_name || account.name || account.id}:`, error.message);
    
    return {
      isValid: false,
      status: 'INVALID',
      errorMessage: error.message,
      responseTime
    };
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Parallel validation function for multiple accounts
async function validateMultipleAccounts(accounts, options = {}) {
  const {
    concurrency = 3,
    logProgress = true
  } = options;
  
  console.log(`\n🔄 === PARALLEL VALIDATION STARTED ===`);
  console.log(`📊 Validating ${accounts.length} accounts with concurrency: ${concurrency}`);
  
  const startTime = Date.now();
  const results = [];
  const timings = {
    browserLaunch: [],
    cookieInjection: [],
    navigation: [],
    validation: [],
    total: []
  };
  
  // Split accounts into batches for controlled concurrency
  const batches = [];
  for (let i = 0; i < accounts.length; i += concurrency) {
    batches.push(accounts.slice(i, i + concurrency));
  }
  
  console.log(`📦 Processing ${batches.length} batches of up to ${concurrency} accounts each`);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\n🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} accounts)`);
    
    // Validate accounts in current batch in parallel
    const batchPromises = batch.map(async (account, index) => {
      const accountStartTime = Date.now();
      
      try {
        if (logProgress) {
          console.log(`   🔍 [${batchIndex + 1}.${index + 1}] Starting validation: ${account.account_name || account.name || account.id}`);
        }
        
        const result = await validateLinkedInAccount(account);
        
        const totalTime = Date.now() - accountStartTime;
        timings.total.push(totalTime);
        
        if (logProgress) {
          console.log(`   ${result.isValid ? '✅' : '❌'} [${batchIndex + 1}.${index + 1}] ${account.account_name || account.name || account.id}: ${result.status} (${totalTime}ms)`);
        }
        
        return {
          account,
          result,
          timing: {
            total: totalTime,
            batchIndex: batchIndex + 1,
            accountIndex: index + 1
          }
        };
        
      } catch (error) {
        const totalTime = Date.now() - accountStartTime;
        
        if (logProgress) {
          console.log(`   ❌ [${batchIndex + 1}.${index + 1}] ${account.account_name || account.name || account.id}: ERROR - ${error.message} (${totalTime}ms)`);
        }
        
        return {
          account,
          result: {
            isValid: false,
            status: 'INVALID',
            errorMessage: error.message,
            responseTime: totalTime
          },
          timing: {
            total: totalTime,
            batchIndex: batchIndex + 1,
            accountIndex: index + 1
          }
        };
      }
    });
    
    // Wait for current batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to avoid overwhelming the system
    if (batchIndex < batches.length - 1) {
      console.log(`   ⏳ Waiting 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const totalTime = Date.now() - startTime;
  
  // Calculate statistics
  const stats = {
    total: results.length,
    valid: results.filter(r => r.result.isValid).length,
    invalid: results.filter(r => !r.result.isValid).length,
    averageTime: Math.round(timings.total.reduce((a, b) => a + b, 0) / timings.total.length),
    minTime: Math.min(...timings.total),
    maxTime: Math.max(...timings.total),
    totalTime
  };
  
  console.log(`\n📊 === PARALLEL VALIDATION COMPLETED ===`);
  console.log(`⏱️  Total time: ${totalTime}ms (${Math.round(totalTime / 1000)}s)`);
  console.log(`📈 Results: ${stats.valid}/${stats.total} valid (${Math.round((stats.valid / stats.total) * 100)}%)`);
  console.log(`⚡ Performance: avg ${stats.averageTime}ms, min ${stats.minTime}ms, max ${stats.maxTime}ms per account`);
  console.log(`🚀 Throughput: ${Math.round((stats.total / totalTime) * 1000)} accounts/second`);
  
  return {
    results,
    stats,
    timings: {
      total: totalTime,
      average: stats.averageTime,
      min: stats.minTime,
      max: stats.maxTime
    }
  };
}

// API Routes

// GET /api/accounts - List all accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const [accounts] = await db.execute(`
      SELECT id, account_name as name, proxy_url, browser_user_agent as user_agent, validation_status as status, 
             created_at, updated_at, last_validated_at, last_error_message as validation_error
      FROM linkedin_accounts 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      accounts: accounts.map(account => ({
        ...account,
        cookies: '[HIDDEN]' // Don't expose cookies in list view
      }))
    });
    
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch accounts'
    });
  }
});

// POST /api/accounts - Add new account
app.post('/api/accounts', upload.single('cookiesFile'), async (req, res) => {
  console.log('\n🔍 === ADD ACCOUNT REQUEST DEBUG ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Request file:', req.file ? {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  } : 'No file uploaded');
  
  try {
    const { name, proxy_url, user_agent } = req.body;
    let cookies;
    
    console.log('📝 Processing request data:');
    console.log('  - Name:', name);
    console.log('  - Proxy URL:', proxy_url);
    console.log('  - User Agent:', user_agent);
    
    // Handle cookies from file upload or JSON string
    if (req.file) {
      console.log('🍪 Processing cookies from file upload...');
      try {
        const cookiesText = req.file.buffer.toString('utf8');
        console.log('  - File content (first 200 chars):', cookiesText.substring(0, 200));
        cookies = JSON.parse(cookiesText);
        console.log('  - Parsed cookies count:', Array.isArray(cookies) ? cookies.length : 'Not an array');
      } catch (parseError) {
        console.error('❌ Cookie file parsing error:', parseError.message);
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON in cookies file: ' + parseError.message
        });
      }
    } else if (req.body.cookies) {
      console.log('🍪 Processing cookies from request body...');
      try {
        cookies = typeof req.body.cookies === 'string' ? 
          JSON.parse(req.body.cookies) : req.body.cookies;
        console.log('  - Parsed cookies count:', Array.isArray(cookies) ? cookies.length : 'Not an array');
      } catch (parseError) {
        console.error('❌ Cookie body parsing error:', parseError.message);
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON in cookies body: ' + parseError.message
        });
      }
    } else {
      console.log('❌ No cookies provided in request');
      return res.status(400).json({
        success: false,
        error: 'Cookies are required (either as file upload or JSON)'
      });
    }
    
    // Validate required fields
    if (!name || !cookies) {
      console.log('❌ Missing required fields:', { name: !!name, cookies: !!cookies });
      return res.status(400).json({
        success: false,
        error: 'Name and cookies are required'
      });
    }
    
    // Validate cookies format
    if (!Array.isArray(cookies) || cookies.length === 0) {
      console.log('❌ Invalid cookies format:', { isArray: Array.isArray(cookies), length: cookies?.length });
      return res.status(400).json({
        success: false,
        error: 'Cookies must be a non-empty array'
      });
    }
    
    console.log('✅ Validation passed, checking for existing account...');
    
    // Check if account name already exists
    try {
      const [existing] = await db.execute(
        'SELECT id FROM linkedin_accounts WHERE account_name = ?',
        [name]
      );
      
      if (existing.length > 0) {
        console.log('❌ Account name already exists:', name);
        return res.status(400).json({
          success: false,
          error: 'Account name already exists'
        });
      }
      
      console.log('✅ Account name is unique, proceeding...');
    } catch (dbError) {
      console.error('❌ Database error checking existing account:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Database error: ' + dbError.message
      });
    }
    
    // Get a user_id (use first available user or create a default)
    let userId;
    try {
      const [users] = await db.execute('SELECT id FROM users LIMIT 1');
      userId = users.length > 0 ? users[0].id : '0e5719e5-009c-4e99-b50c-b2730f659d55';
      console.log('📋 Using user ID:', userId);
    } catch (userError) {
      console.error('❌ Error getting user ID:', userError);
      userId = '0e5719e5-009c-4e99-b50c-b2730f659d55'; // Fallback
      console.log('📋 Using fallback user ID:', userId);
    }
    
    // Insert new account
    console.log('💾 Inserting new account into database...');
    try {
      const insertQuery = `
        INSERT INTO linkedin_accounts (id, user_id, account_name, session_cookie, proxy_url, browser_user_agent, validation_status)
        VALUES (UUID(), ?, ?, ?, ?, ?, 'pending')
      `;
      
      const insertParams = [
        userId,
        name,
        JSON.stringify(cookies),
        proxy_url || null,
        user_agent || null
      ];
      
      console.log('📝 Insert query:', insertQuery);
      console.log('📝 Insert params:', insertParams.map((p, i) => 
        i === 2 ? `[COOKIES_JSON_${JSON.stringify(cookies).length}_CHARS]` : p
      ));
      
      const [result] = await db.execute(insertQuery, insertParams);
      
      console.log('✅ Database insert result:', {
        insertId: result.insertId,
        affectedRows: result.affectedRows,
        warningCount: result.warningCount
      });
      
      console.log(`✅ Added new account: ${name}`);
      
      res.json({
        success: true,
        message: 'Account added successfully',
        accountId: result.insertId || 'UUID_GENERATED',
        debug: {
          cookiesCount: cookies.length,
          hasProxy: !!proxy_url,
          hasUserAgent: !!user_agent
        }
      });
      
    } catch (insertError) {
      console.error('❌ Database insert error:', {
        message: insertError.message,
        code: insertError.code,
        errno: insertError.errno,
        sqlState: insertError.sqlState,
        sqlMessage: insertError.sqlMessage,
        sql: insertError.sql,
        stack: insertError.stack
      });
      
      return res.status(500).json({
        success: false,
        error: 'Database insert failed: ' + insertError.message,
        debug: {
          code: insertError.code,
          errno: insertError.errno,
          sqlState: insertError.sqlState
        }
      });
    }
    
  } catch (error) {
    console.error('❌ === GENERAL ERROR IN ADD ACCOUNT ===');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to add account: ' + error.message,
      debug: {
        errorName: error.name,
        errorCode: error.code,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// POST /api/accounts/bulk-import - Bulk import accounts from folder
app.post('/api/accounts/bulk-import', async (req, res) => {
  console.log('\n📁 === BULK IMPORT REQUEST DEBUG ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { folderPath } = req.body;
    
    if (!folderPath) {
      return res.status(400).json({
        success: false,
        error: 'Folder path is required'
      });
    }
    
    console.log(`📂 Processing folder: ${folderPath}`);
    
    // Check if folder exists
    try {
      const stats = await fs.stat(folderPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({
          success: false,
          error: 'Provided path is not a directory'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Folder does not exist or is not accessible: ' + error.message
      });
    }
    
    // Read all JSON files from folder
    console.log('📄 Reading JSON files from folder...');
    const files = await fs.readdir(folderPath);
    const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
    
    if (jsonFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No JSON files found in the specified folder'
      });
    }
    
    console.log(`📋 Found ${jsonFiles.length} JSON files: ${jsonFiles.join(', ')}`);
    
    // Process each JSON file
    const accountsToImport = [];
    const errors = [];
    
    for (const fileName of jsonFiles) {
      const filePath = path.join(folderPath, fileName);
      console.log(`\n🔍 Processing file: ${fileName}`);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const accountData = JSON.parse(fileContent);
        
        // Validate account data structure
        if (!accountData.name) {
          accountData.name = path.basename(fileName, '.json');
        }
        
        // Flexible cookie validation - accept multiple formats
        let processedCookies = [];
        let cookieData = null;
        
        // Try different field names for cookies
        if (accountData.cookies) {
          cookieData = accountData.cookies;
          console.log(`   📋 Found cookies field`);
        } else if (accountData.cookie) {
          cookieData = accountData.cookie;
          console.log(`   📋 Found cookie field (singular)`);
        } else if (accountData.sessionCookie) {
          cookieData = accountData.sessionCookie;
          console.log(`   📋 Found sessionCookie field`);
        } else if (accountData.session_cookie) {
          cookieData = accountData.session_cookie;
          console.log(`   📋 Found session_cookie field`);
        } else if (accountData.li_at) {
          cookieData = accountData.li_at;
          console.log(`   📋 Found li_at field directly`);
        } else if (Object.keys(accountData).length === 1 && typeof Object.values(accountData)[0] === 'string') {
          // If the JSON has only one field and it's a string, assume it's the cookie
          cookieData = Object.values(accountData)[0];
          console.log(`   📋 Single field detected, treating as cookie data`);
        } else if (Array.isArray(accountData) && accountData.length > 0) {
          // If the entire JSON is an array, assume it's cookies
          cookieData = accountData;
          console.log(`   📋 Root level array detected, treating as cookies`);
        } else {
          // Try to find any field that looks like cookie data
          const possibleCookieFields = Object.keys(accountData).filter(key => 
            key.toLowerCase().includes('cookie') || 
            key.toLowerCase().includes('session') ||
            key.toLowerCase().includes('li_at') ||
            (typeof accountData[key] === 'string' && accountData[key].length > 50)
          );
          
          if (possibleCookieFields.length > 0) {
            cookieData = accountData[possibleCookieFields[0]];
            console.log(`   📋 Found potential cookie field: ${possibleCookieFields[0]}`);
          }
        }
        
        if (!cookieData) {
          console.log(`   📋 Available fields: ${Object.keys(accountData).join(', ')}`);
          errors.push({
            file: fileName,
            error: `No cookie data found. Available fields: ${Object.keys(accountData).join(', ')}. Expected: cookies, cookie, sessionCookie, session_cookie, or li_at`
          });
          continue;
        }
        
        // Handle different cookie formats
        if (Array.isArray(cookieData)) {
          // Already in array format - use as is
          processedCookies = cookieData;
          console.log(`   📋 Cookies format: Array with ${processedCookies.length} items`);
        } else if (typeof cookieData === 'string') {
          // String format - try to parse or convert
          console.log(`   📋 Cookies format: String`);
          try {
            // Try to parse as JSON first
            processedCookies = JSON.parse(cookieData);
            if (!Array.isArray(processedCookies)) {
              processedCookies = [processedCookies];
            }
          } catch (e) {
            // If not JSON, treat as cookie string and create basic cookie object
            if (cookieData.includes('li_at=')) {
              // Extract li_at value from cookie string
              const liAtMatch = cookieData.match(/li_at=([^;]+)/);
              if (liAtMatch) {
                processedCookies = [{
                  name: 'li_at',
                  value: liAtMatch[1],
                  domain: '.linkedin.com',
                  path: '/',
                  httpOnly: true,
                  secure: true,
                  sameSite: 'None'
                }];
              }
            } else {
              // Assume the entire string is the li_at value
              processedCookies = [{
                name: 'li_at',
                value: cookieData,
                domain: '.linkedin.com',
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'None'
              }];
            }
          }
        } else if (typeof cookieData === 'object') {
          // Object format - convert to array
          console.log(`   📋 Cookies format: Object`);
          if (cookieData.name && cookieData.value) {
            // Single cookie object
            processedCookies = [cookieData];
          } else {
            // Object with cookie properties - try to extract
            const cookieEntries = Object.entries(cookieData);
            processedCookies = cookieEntries.map(([name, value]) => ({
              name,
              value: typeof value === 'string' ? value : JSON.stringify(value),
              domain: '.linkedin.com',
              path: '/',
              httpOnly: true,
              secure: true,
              sameSite: 'None'
            }));
          }
        }
        
        // Validate we have at least one cookie
        if (!processedCookies || processedCookies.length === 0) {
          errors.push({
            file: fileName,
            error: 'No valid cookies found after processing'
          });
          continue;
        }
        
        // Ensure all cookies have required properties and valid values
        processedCookies = processedCookies.map(cookie => {
          // Handle sameSite validation - must be 'Strict', 'Lax', or 'None'
          let sameSite = 'None'; // Default
          if (cookie.sameSite) {
            const validSameSite = ['Strict', 'Lax', 'None'];
            if (validSameSite.includes(cookie.sameSite)) {
              sameSite = cookie.sameSite;
            } else if (typeof cookie.sameSite === 'string') {
              // Try to match case-insensitive
              const match = validSameSite.find(valid => 
                valid.toLowerCase() === cookie.sameSite.toLowerCase()
              );
              sameSite = match || 'None';
            }
          }
          
          return {
            name: cookie.name || 'li_at',
            value: (cookie.value || cookie).toString().replace(/^"|"$/g, ''), // Remove quotes
            domain: (cookie.domain || '.linkedin.com').replace(/^www\./g, '.'), // Normalize domain
            path: cookie.path || '/',
            httpOnly: cookie.httpOnly !== false,
            secure: cookie.secure !== false,
            sameSite: sameSite
          };
        });
        
        console.log(`   🍪 Processed ${processedCookies.length} cookies:`);
        processedCookies.forEach((cookie, i) => {
          console.log(`     ${i + 1}. ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
        });
        
        // Check if account name already exists
        const [existing] = await db.execute(
          'SELECT id FROM linkedin_accounts WHERE account_name = ?',
          [accountData.name]
        );
        
        if (existing.length > 0) {
          errors.push({
            file: fileName,
            error: `Account name '${accountData.name}' already exists`
          });
          continue;
        }
        
        accountsToImport.push({
          fileName,
          filePath,
          name: accountData.name,
          cookies: processedCookies,
          proxy: accountData.proxy || null,
          userAgent: accountData.userAgent || null,
          timezone: accountData.timezone || 'America/New_York'
        });
        
        console.log(`   ✅ Valid account: ${accountData.name} (${processedCookies.length} cookies)`);
        
      } catch (parseError) {
        console.error(`   ❌ Error parsing ${fileName}:`, parseError.message);
        errors.push({
          file: fileName,
          error: 'JSON parsing failed: ' + parseError.message
        });
      }
    }
    
    if (accountsToImport.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid accounts found to import',
        errors
      });
    }
    
    console.log(`\n💾 Importing ${accountsToImport.length} accounts to database...`);
    
    // Get user_id for accounts
    const [users] = await db.execute('SELECT id FROM users LIMIT 1');
    const userId = users.length > 0 ? users[0].id : '0e5719e5-009c-4e99-b50c-b2730f659d55';
    
    // Insert accounts into database
    const importedAccounts = [];
    const importErrors = [];
    
    for (const account of accountsToImport) {
      try {
        const [result] = await db.execute(`
          INSERT INTO linkedin_accounts (
            id, user_id, account_name, session_cookie, proxy_url, 
            browser_user_agent, browser_timezone, validation_status, cookie_file_path
          )
          VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'pending', ?)
        `, [
          userId,
          account.name,
          JSON.stringify(account.cookies),
          account.proxy,
          account.userAgent,
          account.timezone,
          account.filePath
        ]);
        
        importedAccounts.push({
          name: account.name,
          file: account.fileName,
          accountId: result.insertId || 'UUID_GENERATED',
          cookiesCount: account.cookies.length,
          hasProxy: !!account.proxy,
          hasUserAgent: !!account.userAgent
        });
        
        console.log(`   ✅ Imported: ${account.name}`);
        
      } catch (dbError) {
        console.error(`   ❌ Database error for ${account.name}:`, dbError.message);
        importErrors.push({
          file: account.fileName,
          name: account.name,
          error: 'Database insert failed: ' + dbError.message
        });
      }
    }
    
    console.log(`\n🎉 Bulk import completed:`);
    console.log(`   ✅ Successfully imported: ${importedAccounts.length} accounts`);
    console.log(`   ❌ Errors: ${errors.length + importErrors.length}`);
    
    // Start validation process for imported accounts
    if (importedAccounts.length > 0) {
      console.log('\n🔄 Starting validation process for imported accounts...');
      // Trigger validation worker (will be handled by the existing cron job)
      setTimeout(() => {
        runValidationWorker();
      }, 2000);
    }
    
    res.json({
      success: true,
      message: `Successfully imported ${importedAccounts.length} accounts`,
      summary: {
        totalFiles: jsonFiles.length,
        validFiles: accountsToImport.length,
        imported: importedAccounts.length,
        errors: errors.length + importErrors.length
      },
      importedAccounts,
      errors: [...errors, ...importErrors]
    });
    
  } catch (error) {
    console.error('❌ === BULK IMPORT ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Bulk import failed: ' + error.message,
      debug: {
        errorName: error.name,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET /api/accounts/:id - Get specific account
app.get('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [accounts] = await db.execute(
      'SELECT * FROM linkedin_accounts WHERE id = ?',
      [id]
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    const account = accounts[0];
    
    res.json({
      success: true,
      account: {
        ...account,
        cookies: JSON.parse(account.cookies)
      }
    });
    
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch account'
    });
  }
});

// DELETE /api/accounts/:id - Delete account
app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.execute(
      'DELETE FROM linkedin_accounts WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    console.log(`🗑️ Deleted account ID: ${id}`);
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account'
    });
  }
});

// POST /api/accounts/:id/validate - Manually validate specific account
app.post('/api/accounts/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get account details
    const [accounts] = await db.execute(
      'SELECT * FROM linkedin_accounts WHERE id = ?',
      [id]
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    const account = accounts[0];
    
    // Validate account
    const validationResult = await validateLinkedInAccount(account);
    
    // Update account status
    await db.execute(`
      UPDATE linkedin_accounts 
      SET validation_status = ?, last_validated_at = NOW(), last_error_message = ?
      WHERE id = ?
    `, [
      validationResult.status,
      validationResult.errorMessage,
      id
    ]);
    
    // Log validation result
    await db.execute(`
      INSERT INTO validation_logs (account_id, status, error_message, response_time_ms)
      VALUES (?, ?, ?, ?)
    `, [
      id,
      validationResult.status,
      validationResult.errorMessage,
      validationResult.responseTime
    ]);
    
    res.json({
      success: true,
      result: validationResult
    });
    
  } catch (error) {
    console.error('Error validating account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate account: ' + error.message
    });
  }
});

// POST /api/accounts/validate-parallel - Validate multiple accounts in parallel
app.post('/api/accounts/validate-parallel', async (req, res) => {
  try {
    const { accountIds, concurrency = 3 } = req.body;
    
    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Account IDs array is required'
      });
    }
    
    console.log(`\n🔄 === PARALLEL VALIDATION REQUEST ===`);
    console.log(`📋 Validating ${accountIds.length} accounts with concurrency: ${concurrency}`);
    
    // Get account details
    const placeholders = accountIds.map(() => '?').join(',');
    const [accounts] = await db.execute(
      `SELECT * FROM linkedin_accounts WHERE id IN (${placeholders})`,
      accountIds
    );
    
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No accounts found with provided IDs'
      });
    }
    
    console.log(`📊 Found ${accounts.length} accounts to validate`);
    
    // Perform parallel validation
    const validationResults = await validateMultipleAccounts(accounts, {
      concurrency,
      logProgress: true
    });
    
    // Update database with results
    console.log('\n💾 Updating database with validation results...');
    const updatePromises = validationResults.results.map(async ({ account, result }) => {
      try {
        // Update account status
        await db.execute(`
          UPDATE linkedin_accounts 
          SET validation_status = ?, last_validated_at = NOW(), last_error_message = ?
          WHERE id = ?
        `, [
          result.status,
          result.errorMessage,
          account.id
        ]);
        
        // Log validation result
        await db.execute(`
          INSERT INTO validation_logs (account_id, status, error_message, response_time_ms)
          VALUES (?, ?, ?, ?)
        `, [
          account.id,
          result.status,
          result.errorMessage,
          result.responseTime
        ]);
        
        return {
          accountId: account.id,
          accountName: account.account_name,
          status: result.status,
          updated: true
        };
        
      } catch (dbError) {
        console.error(`❌ Database update failed for account ${account.id}:`, dbError.message);
        return {
          accountId: account.id,
          accountName: account.account_name,
          status: result.status,
          updated: false,
          error: dbError.message
        };
      }
    });
    
    const updateResults = await Promise.all(updatePromises);
    const successfulUpdates = updateResults.filter(r => r.updated).length;
    
    console.log(`✅ Database updates completed: ${successfulUpdates}/${updateResults.length} successful`);
    
    res.json({
      success: true,
      message: `Validated ${accounts.length} accounts in parallel`,
      summary: {
        totalAccounts: accounts.length,
        validAccounts: validationResults.stats.valid,
        invalidAccounts: validationResults.stats.invalid,
        successRate: Math.round((validationResults.stats.valid / validationResults.stats.total) * 100),
        totalTime: validationResults.timings.total,
        averageTimePerAccount: validationResults.timings.average,
        concurrency
      },
      results: validationResults.results.map(({ account, result, timing }) => ({
        accountId: account.id,
        accountName: account.account_name,
        status: result.status,
        isValid: result.isValid,
        errorMessage: result.errorMessage,
        responseTime: result.responseTime,
        batchInfo: {
          batchIndex: timing.batchIndex,
          accountIndex: timing.accountIndex
        }
      })),
      updateResults,
      performance: {
        totalTime: validationResults.timings.total,
        averageTime: validationResults.timings.average,
        minTime: validationResults.timings.min,
        maxTime: validationResults.timings.max,
        throughput: Math.round((accounts.length / validationResults.timings.total) * 1000)
      }
    });
    
  } catch (error) {
    console.error('❌ === PARALLEL VALIDATION ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Parallel validation failed: ' + error.message,
      debug: {
        errorName: error.name,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET /api/stats - Get validation statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN validation_status = 'ACTIVE' THEN 1 ELSE 0 END) as valid,
        SUM(CASE WHEN validation_status = 'INVALID' THEN 1 ELSE 0 END) as invalid,
        SUM(CASE WHEN validation_status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM linkedin_accounts
    `);
    
    res.json({
      success: true,
      stats: stats[0]
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Authentication API endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // For demo purposes, accept any email/password combination
    // In production, you would validate against a real user database
    const user = {
      id: '0e5719e5-009c-4e99-b50c-b2730f659d55',
      email: email,
      name: email.split('@')[0],
      role: 'user'
    };
    
    // Generate proper JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      data: {
        user,
        token
      },
      message: 'Login successful'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // For demo purposes, accept any registration
    const user = {
      id: '0e5719e5-009c-4e99-b50c-b2730f659d55',
      email: email,
      name: name || email.split('@')[0],
      role: 'user'
    };
    
    const token = 'demo-token-' + Date.now();
    
    res.json({
      success: true,
      data: {
        user,
        token
      },
      message: 'Registration successful'
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    // For demo purposes, return a default user
    // In production, you would validate the JWT token and get user from database
    const user = {
      id: '0e5719e5-009c-4e99-b50c-b2730f659d55',
      email: 'demo@example.com',
      name: 'Demo User',
      role: 'user'
    };
    
    res.json({
      success: true,
      data: {
        user
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
});

app.put('/api/auth/me', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // For demo purposes, return updated user
    const user = {
      id: '0e5719e5-009c-4e99-b50c-b2730f659d55',
      email: email || 'demo@example.com',
      name: name || 'Demo User',
      role: 'user'
    };
    
    res.json({
      success: true,
      user,
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

app.put('/api/auth/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    res.json({
      success: true,
      message: 'Password reset email sent'
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send password reset email'
    });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }
    
    res.json({
      success: true,
      message: 'Password reset successful'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    const newToken = 'demo-token-' + Date.now();
    
    res.json({
      success: true,
      token: newToken,
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

// Job creation endpoint
app.post('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const { jobType, urls, searchQuery, jobName, accountSelectionMode, selectedAccountIds } = req.body;
    
    console.log('🎯 Creating new scraping job:', {
      jobType,
      urlCount: urls ? urls.length : 0,
      searchQuery,
      jobName,
      accountSelectionMode,
      selectedAccounts: selectedAccountIds ? selectedAccountIds.length : 0
    });
    
    // Get available active accounts
    const [accounts] = await db.execute(`
      SELECT * FROM linkedin_accounts 
      WHERE validation_status = 'ACTIVE'
    `);
    
    if (accounts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active LinkedIn accounts available for scraping'
      });
    }
    
    console.log(`✅ Found ${accounts.length} active accounts for job`);
    
    // For now, use the first active account
    const account = accounts[0];
    console.log(`🔧 Using account: ${account.account_name}`);
    
    // Enhanced URL validation and processing
    const validateAndProcessUrls = (urls, jobType) => {
      if (!urls || !Array.isArray(urls)) {
        return { valid: [], invalid: [] };
      }
      
      const profileRegex = /^https:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?$/;
      const companyRegex = /^https:\/\/(www\.)?linkedin\.com\/company\/[A-Za-z0-9\-_%]+\/?$/;
      
      const valid = [];
      const invalid = [];
      
      urls.forEach(rawUrl => {
        if (!rawUrl || typeof rawUrl !== 'string') {
          invalid.push({ url: rawUrl, reason: 'Invalid URL format' });
          return;
        }
        
        // Normalize URL: trim whitespace, remove query strings
        let cleanUrl = rawUrl.trim();
        
        // Remove query parameters and fragments
        try {
          const urlObj = new URL(cleanUrl);
          cleanUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
          
          // Ensure trailing slash is consistent
          if (!cleanUrl.endsWith('/')) {
            cleanUrl += '/';
          }
        } catch (e) {
          invalid.push({ url: rawUrl, reason: 'Malformed URL' });
          return;
        }
        
        // Validate based on job type
        if (jobType === 'profile' || jobType === 'profiles') {
          if (profileRegex.test(cleanUrl)) {
            valid.push(cleanUrl);
          } else {
            invalid.push({ url: rawUrl, reason: 'Invalid LinkedIn profile URL format' });
          }
        } else if (jobType === 'company' || jobType === 'companies') {
          if (companyRegex.test(cleanUrl)) {
            valid.push(cleanUrl);
          } else {
            invalid.push({ url: rawUrl, reason: 'Invalid LinkedIn company URL format' });
          }
        } else {
          // For mixed or unknown job types, accept both profile and company URLs
          if (profileRegex.test(cleanUrl) || companyRegex.test(cleanUrl)) {
            valid.push(cleanUrl);
          } else {
            invalid.push({ url: rawUrl, reason: 'Invalid LinkedIn URL format' });
          }
        }
      });
      
      return { valid, invalid };
    };
    
    let urlsToProcess = [];
    let validationResults = { valid: [], invalid: [] };
    
    if (urls && urls.length > 0) {
      validationResults = validateAndProcessUrls(urls, jobType);
      urlsToProcess = validationResults.valid;
      
      console.log(`📊 URL Validation Results:`);
      console.log(`   ✅ Valid URLs: ${validationResults.valid.length}`);
      console.log(`   ❌ Invalid URLs: ${validationResults.invalid.length}`);
      
      if (validationResults.invalid.length > 0) {
        console.log(`   Invalid URLs:`, validationResults.invalid);
      }
    } else if (jobType === 'search' && searchQuery) {
      // For search jobs, create a LinkedIn search URL
      urlsToProcess = [`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`];
    }
    
    if (urlsToProcess.length === 0) {
      const errorMessage = validationResults.invalid.length > 0 
        ? `No valid LinkedIn URLs found. Invalid URLs: ${validationResults.invalid.map(item => `${item.url} (${item.reason})`).join(', ')}`
        : 'No valid URLs provided for scraping';
      
      return res.status(400).json({
        success: false,
        error: errorMessage,
        validation_results: validationResults
      });
    }
    
    console.log(`🌐 Processing ${urlsToProcess.length} URLs...`);
    
    // Initialize Job Manager
    const JobManager = require('./services/job-manager');
    const jobManager = new JobManager(db);
    
    try {
      // Create job with validated URLs
      const jobResult = await jobManager.createJob({
        jobName: jobName || `${jobType} Job - ${new Date().toISOString()}`,
        jobType: jobType,
        urls: urlsToProcess,
        searchQuery: searchQuery,
        accountSelectionMode: accountSelectionMode || 'rotation',
        selectedAccountIds: selectedAccountIds || [],
        userId: req.user.id
      });
      
      console.log(`✅ Job created successfully: ${jobResult.jobId}`);
    
      res.json({
        success: true,
        jobId: jobResult.jobId,
        message: 'Job created and queued for processing',
        status: 'pending',
        urlsProcessed: urlsToProcess.length,
        validationResults: validationResults,
        accountUsed: account.account_name
      });
      
    } catch (error) {
      console.error('❌ Failed to create job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create scraping job',
        details: error.message
      });
    }
    
  } catch (error) {
    console.error('❌ Job creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Job creation failed: ' + error.message
    });
  }
});

// Get job status
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const [jobs] = await db.execute(
      'SELECT * FROM scraping_jobs WHERE id = ?',
      [jobId]
    );
    
    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const job = jobs[0];
    
    // Get results count
    const [results] = await db.execute(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = "success" THEN 1 ELSE 0 END) as successful FROM scraping_results WHERE job_id = ?',
      [jobId]
    );
    
    res.json({
      success: true,
      job: {
        ...job,
        input_data: JSON.parse(job.input_data || '{}'),
        totalResults: results[0]?.total || 0,
        successfulResults: results[0]?.successful || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Get job status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status: ' + error.message
    });
  }
});

// List all jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const limit = Math.max(1, parseInt(req.query.limit) || 50);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const { status } = req.query;
    
    let query = 'SELECT * FROM scraping_jobs';
    let params = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
      query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    } else {
      query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    }
    
    const [jobs] = await db.execute(query, params);
    
    // Get results count for each job
    for (let job of jobs) {
      try {
        // Try to get results from multiple possible result tables
        let totalResults = 0;
        let successfulResults = 0;
        
        // Check profile_results table
        try {
          const [profileResults] = await db.execute(
            'SELECT COUNT(*) as total FROM profile_results WHERE job_id = ?',
            [job.id]
          );
          totalResults += profileResults[0]?.total || 0;
          successfulResults += profileResults[0]?.total || 0; // Assume all are successful if they exist
        } catch (e) {
          // Table might not exist, continue
        }
        
        // Check company_results table
        try {
          const [companyResults] = await db.execute(
            'SELECT COUNT(*) as total FROM company_results WHERE job_id = ?',
            [job.id]
          );
          totalResults += companyResults[0]?.total || 0;
          successfulResults += companyResults[0]?.total || 0;
        } catch (e) {
          // Table might not exist, continue
        }
        
        // Check sales_navigator_results table
        try {
          const [salesResults] = await db.execute(
            'SELECT COUNT(*) as total FROM sales_navigator_results WHERE job_id = ?',
            [job.id]
          );
          totalResults += salesResults[0]?.total || 0;
          successfulResults += salesResults[0]?.total || 0;
        } catch (e) {
          // Table might not exist, continue
        }
        
        job.totalResults = totalResults;
         job.successfulResults = successfulResults;
       } catch (error) {
         console.error(`Error getting results for job ${job.id}:`, error);
         job.totalResults = 0;
         job.successfulResults = 0;
       }
       
       job.input_data = JSON.parse(job.input_data || '{}');
    }
    
    res.json({
      success: true,
      jobs: jobs
    });
    
  } catch (error) {
    console.error('❌ List jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list jobs: ' + error.message
    });
  }
});

// Cancel job
app.post('/api/jobs/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    await db.execute(
      'UPDATE scraping_jobs SET status = "cancelled", updated_at = NOW() WHERE id = ? AND status IN ("pending", "running")',
      [jobId]
    );
    
    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
    
  } catch (error) {
    console.error('❌ Cancel job error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job: ' + error.message
    });
  }
});

// Export job results to CSV
app.get('/api/jobs/:jobId/export', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get job details
    const [jobs] = await db.execute(
      'SELECT * FROM scraping_jobs WHERE id = ?',
      [jobId]
    );
    
    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const job = jobs[0];
    const csvContent = await global.bulkScrapingService.exportToCSV(jobId, job.job_type);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${job.job_name}_results.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('❌ Export job error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export job results: ' + error.message
    });
  }
});

// Get available LinkedIn accounts for job creation
app.get('/api/linkedin-accounts/available', async (req, res) => {
  try {
    console.log('📋 Fetching available LinkedIn accounts for job creation...');
    
    // Include accounts that can be used for scraping (prioritize ACTIVE and PENDING, but allow INVALID for testing)
    const [accounts] = await db.execute(`
      SELECT id, account_name, validation_status, last_validated_at, created_at
      FROM linkedin_accounts 
      WHERE validation_status IN ('ACTIVE', 'PENDING', 'INVALID')
      ORDER BY 
        CASE validation_status 
          WHEN 'ACTIVE' THEN 1 
          WHEN 'PENDING' THEN 2 
          WHEN 'INVALID' THEN 3 
        END,
        created_at ASC
    `);
    
    console.log(`✅ Found ${accounts.length} usable LinkedIn accounts (${accounts.filter(a => a.validation_status === 'ACTIVE').length} active, ${accounts.filter(a => a.validation_status === 'PENDING').length} pending, ${accounts.filter(a => a.validation_status === 'INVALID').length} recently added)`);
    
    res.json({
      success: true,
      data: accounts,
      count: accounts.length
    });
    
  } catch (error) {
    console.error('❌ Failed to fetch available accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available accounts: ' + error.message
    });
  }
});

// Get job results
app.get('/api/jobs/:jobId/results', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    const [results] = await db.execute(
      'SELECT * FROM scraping_results WHERE job_id = ? ORDER BY scraped_at DESC LIMIT ? OFFSET ?',
      [jobId, parseInt(limit), parseInt(offset)]
    );
    
    // Parse JSON data safely
    const { safeJsonParse } = require('./utils/responseValidator');
    const processedResults = results.map(result => {
      const parseResult = safeJsonParse(result.data || '{}');
      return {
        ...result,
        data: parseResult.success ? parseResult.data : {},
        parseError: parseResult.success ? null : parseResult.error
      };
    });
    
    res.json({
      success: true,
      results: processedResults
    });
    
  } catch (error) {
    console.error('❌ Get job results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job results: ' + error.message
    });
  }
});

// Test scraping endpoint for debugging
app.post('/api/test-scraping', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required'
      });
    }
    
    console.log(`🔍 Testing scraping for ${urls.length} URLs...`);
    
    // Get first active account for testing
    const [accounts] = await db.execute(`
      SELECT * FROM linkedin_accounts 
      WHERE validation_status = 'ACTIVE' 
      LIMIT 1
    `);
    
    if (accounts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active LinkedIn accounts available for scraping'
      });
    }
    
    const account = accounts[0];
    console.log(`✅ Using account: ${account.account_name}`);
    
    const results = [];
    
    for (const url of urls) {
      console.log(`🌐 Scraping: ${url}`);
      
      try {
        // For now, just return mock data to test the flow
        const result = {
          url: url,
          status: 'success',
          data: {
            name: 'Test Profile',
            title: 'Software Engineer',
            company: 'Tech Company',
            location: 'San Francisco, CA'
          },
          scrapedAt: new Date().toISOString(),
          accountUsed: account.account_name
        };
        
        results.push(result);
        console.log(`✅ Scraped successfully: ${url}`);
        
      } catch (scrapeError) {
        console.error(`❌ Scraping failed for ${url}:`, scrapeError.message);
        results.push({
          url: url,
          status: 'error',
          error: scrapeError.message,
          accountUsed: account.account_name
        });
      }
    }
    
    res.json({
      success: true,
      message: `Scraped ${results.length} URLs`,
      results: results,
      accountUsed: account.account_name
    });
    
  } catch (error) {
    console.error('❌ Test scraping error:', error);
    res.status(500).json({
      success: false,
      error: 'Test scraping failed: ' + error.message
    });
  }
});

// Get available LinkedIn accounts for job creation
app.get('/api/linkedin-accounts/available', async (req, res) => {
  try {
    console.log('📋 Fetching available LinkedIn accounts for job creation...');
    
    const [accounts] = await db.execute(`
      SELECT 
        id,
        account_name as name,
        validation_status as status,
        proxy_url,
        browser_user_agent as user_agent,
        created_at,
        updated_at,
        last_validated_at
      FROM linkedin_accounts 
      WHERE validation_status = 'ACTIVE'
      ORDER BY last_validated_at DESC
    `);
    
    console.log(`✅ Found ${accounts.length} active LinkedIn accounts`);
    
    res.json({
      success: true,
      data: accounts,
      count: accounts.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching available accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available accounts: ' + error.message
    });
  }
});

// Background validation worker
async function runValidationWorker() {
  try {
    console.log('🔄 Running validation worker...');
    
    // Get pending accounts
    const [pendingAccounts] = await db.execute(`
      SELECT * FROM linkedin_accounts 
      WHERE validation_status = 'pending' 
      ORDER BY created_at ASC
      LIMIT 5
    `);
    
    if (pendingAccounts.length === 0) {
      console.log('ℹ️  No pending accounts to validate');
      return;
    }
    
    console.log(`📋 Found ${pendingAccounts.length} pending accounts`);
    
    // Use parallel validation for better performance
    const validationResults = await validateMultipleAccounts(pendingAccounts, {
      concurrency: 2, // Conservative concurrency for background worker
      logProgress: true
    });
    
    // Update database with results
    console.log('💾 Updating database with validation results...');
    let successfulUpdates = 0;
    
    for (const { account, result } of validationResults.results) {
      try {
        // Update account status
        await db.execute(`
          UPDATE linkedin_accounts 
          SET validation_status = ?, last_validated_at = NOW(), last_error_message = ?
          WHERE id = ?
        `, [
          result.status,
          result.errorMessage,
          account.id
        ]);
        
        // Log validation result
        await db.execute(`
          INSERT INTO validation_logs (account_id, status, error_message, response_time_ms)
          VALUES (?, ?, ?, ?)
        `, [
          account.id,
          result.status,
          result.errorMessage,
          result.responseTime
        ]);
        
        successfulUpdates++;
        
      } catch (dbError) {
        console.error(`❌ Database update failed for account ${account.account_name || account.name || account.id}:`, dbError.message);
      }
    }
    
    console.log(`✅ Validation worker completed: ${successfulUpdates}/${pendingAccounts.length} accounts updated`);
    console.log(`📊 Results: ${validationResults.stats.valid} valid, ${validationResults.stats.invalid} invalid`);
    console.log(`⚡ Performance: ${validationResults.timings.total}ms total, ${validationResults.timings.average}ms average per account`);
    
    console.log('✅ Validation worker completed');
    
  } catch (error) {
    console.error('❌ Validation worker error:', error.message);
  }
}

// Schedule validation worker to run every 30 minutes
cron.schedule('*/30 * * * *', runValidationWorker);

// Enhanced API endpoints for new job types

// Download sample templates
app.get('/api/templates/:type', (req, res) => {
  const { type } = req.params;
  const templateFiles = {
    'profiles': 'profile-scraping-template.csv',
    'companies': 'company-scraping-template.csv',
    'sales_navigator': 'sales-navigator-template.csv'
  };
  
  const filename = templateFiles[type];
  if (!filename) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  
  const filePath = path.join(__dirname, '..', 'examples', filename);
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('❌ Error downloading template:', err.message);
      res.status(500).json({ success: false, error: 'Failed to download template' });
    }
  });
});

// Get enhanced job results with export options
app.get('/api/jobs/:id/results', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json', download = false } = req.query;
    
    // Get job details
    const [jobs] = await db.execute('SELECT * FROM scraping_jobs WHERE id = ?', [id]);
    if (jobs.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const job = jobs[0];
    let results = [];
    
    // Get results based on job type
    switch (job.job_type) {
      case 'profiles':
        const [profileResults] = await db.execute(`
          SELECT * FROM profile_results WHERE job_id = ? ORDER BY created_at ASC
        `, [id]);
        results = profileResults;
        break;
        
      case 'companies':
        const [companyResults] = await db.execute(`
          SELECT * FROM company_results WHERE job_id = ? ORDER BY created_at ASC
        `, [id]);
        results = companyResults;
        break;
        
      case 'sales_navigator':
        const [salesResults] = await db.execute(`
          SELECT * FROM sales_navigator_results WHERE job_id = ? ORDER BY page_number ASC, result_position ASC
        `, [id]);
        results = salesResults;
        break;
        
      default:
        // Fallback to legacy results
        const [legacyResults] = await db.execute(`
          SELECT * FROM scraping_results WHERE job_id = ? ORDER BY created_at ASC
        `, [id]);
        results = legacyResults;
    }
    
    // Handle different export formats
    if (format === 'csv' || download === 'true') {
      const ExportService = require('./services/export-service');
      const exportService = new ExportService();
      
      const csvData = await exportService.exportToCSV(results, job.job_type);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${job.job_name}_${job.job_type}_${timestamp}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvData);
    }
    
    if (format === 'excel') {
      const ExportService = require('./services/export-service');
      const exportService = new ExportService();
      
      const excelBuffer = await exportService.exportToExcel(results, job.job_type);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${job.job_name}_${job.job_type}_${timestamp}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(excelBuffer);
    }
    
    // Default JSON response
    res.json({
      success: true,
      job: {
        id: job.id,
        name: job.job_name,
        type: job.job_type,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        total_items: job.total_items,
        fetched_items: job.fetched_items,
        parsed_items: job.parsed_items,
        failed_items: job.failed_items
      },
      results: results,
      count: results.length
    });
    
  } catch (error) {
    console.error('❌ Error getting job results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get job statistics and progress
app.get('/api/jobs/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get job details
    const [jobs] = await db.execute('SELECT * FROM scraping_jobs WHERE id = ?', [id]);
    if (jobs.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const job = jobs[0];
    
    // Get HTML snapshots count
    const [snapshots] = await db.execute(`
      SELECT 
        COUNT(*) as total_snapshots,
        SUM(CASE WHEN status = 'fetched' THEN 1 ELSE 0 END) as fetched_snapshots,
        SUM(CASE WHEN status = 'parsed' THEN 1 ELSE 0 END) as parsed_snapshots,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_snapshots
      FROM html_snapshots WHERE job_id = ?
    `, [id]);
    
    // Get results count by status
    let resultStats = { total: 0, success: 0, failed: 0, partial: 0 };
    
    switch (job.job_type) {
      case 'profiles':
        const [profileStats] = await db.execute(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial
          FROM profile_results WHERE job_id = ?
        `, [id]);
        resultStats = profileStats[0];
        break;
        
      case 'companies':
        const [companyStats] = await db.execute(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial
          FROM company_results WHERE job_id = ?
        `, [id]);
        resultStats = companyStats[0];
        break;
        
      case 'sales_navigator':
        const [salesStats] = await db.execute(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial
          FROM sales_navigator_results WHERE job_id = ?
        `, [id]);
        resultStats = salesStats[0];
        break;
    }
    
    res.json({
      success: true,
      job: {
        id: job.id,
        name: job.job_name,
        type: job.job_type,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        total_items: job.total_items,
        fetched_items: job.fetched_items,
        parsed_items: job.parsed_items,
        failed_items: job.failed_items,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      },
      snapshots: snapshots[0],
      results: resultStats
    });
    
  } catch (error) {
    console.error('❌ Error getting job stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual account validation endpoint
app.post('/api/accounts/:id/validate-enhanced', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (global.accountValidator) {
      const result = await global.accountValidator.validateSingleAccount(id);
      res.json({
        success: true,
        validation: result,
        message: 'Account validation completed'
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Account validator service not available'
      });
    }
    
  } catch (error) {
    console.error('❌ Error validating account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stealth LinkedIn Scraper API Endpoints

// Test stealth login with cookies
app.post('/api/stealth/test-login', async (req, res) => {
  try {
    const { cookieFilePath } = req.body;
    const filePath = cookieFilePath || path.join(__dirname, '..', 'account1.json');
    
    if (!global.stealthScraper) {
      return res.status(503).json({
        success: false,
        error: 'Stealth scraper service not available'
      });
    }
    
    // Create stealth browser
    await global.stealthScraper.createStealthBrowser();
    
    // Load cookies
    const cookiesLoaded = await global.stealthScraper.loadCookiesFromFile(filePath);
    if (!cookiesLoaded) {
      return res.status(400).json({
        success: false,
        error: 'Failed to load cookies from file'
      });
    }
    
    // Validate login
    const loginResult = await global.stealthScraper.validateLogin();
    
    res.json({
      success: true,
      login: loginResult,
      message: 'Stealth login test completed'
    });
    
  } catch (error) {
    console.error('❌ Error testing stealth login:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scrape profiles from CSV file
app.post('/api/stealth/scrape-profiles', async (req, res) => {
  try {
    const { csvFilePath } = req.body;
    const filePath = csvFilePath || path.join(__dirname, '..', 'profile_test.csv');
    
    if (!global.stealthScraper) {
      return res.status(503).json({
        success: false,
        error: 'Stealth scraper service not available'
      });
    }
    
    // Ensure browser is ready
    if (!global.stealthScraper.browser) {
      await global.stealthScraper.createStealthBrowser();
      const cookieFilePath = path.join(__dirname, '..', 'account1.json');
      await global.stealthScraper.loadCookiesFromFile(cookieFilePath);
      await global.stealthScraper.validateLogin();
    }
    
    // Scrape profiles
    const results = await global.stealthScraper.scrapeProfilesFromFile(filePath);
    
    res.json({
      success: true,
      results: results,
      count: results.length,
      message: `Successfully scraped ${results.length} profiles`
    });
    
  } catch (error) {
    console.error('❌ Error scraping profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get scraped profiles
app.get('/api/stealth/profiles', async (req, res) => {
  try {
    if (!global.stealthScraper) {
      return res.status(503).json({
        success: false,
        error: 'Stealth scraper service not available'
      });
    }
    
    const profiles = await global.stealthScraper.getScrapedProfiles();
    
    res.json({
      success: true,
      profiles: profiles,
      count: profiles.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get scraped companies
app.get('/api/stealth/companies', async (req, res) => {
  try {
    if (!global.stealthScraper) {
      return res.status(503).json({
        success: false,
        error: 'Stealth scraper service not available'
      });
    }
    
    const companies = await global.stealthScraper.getScrapedCompanies();
    
    res.json({
      success: true,
      companies: companies,
      count: companies.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching companies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update account with overwrite logic
app.post('/api/accounts/add-or-update', async (req, res) => {
  try {
    const { account_name, session_cookie, proxy_url } = req.body;
    
    if (!account_name || !session_cookie) {
      return res.status(400).json({
        success: false,
        error: 'Account name and session cookie are required'
      });
    }
    
    // Remove existing account with same name
    await db.execute(
      'DELETE FROM linkedin_accounts WHERE account_name = ?',
      [account_name]
    );
    
    // Insert new account
    const accountId = require('uuid').v4();
    await db.execute(`
      INSERT INTO linkedin_accounts (
        id, user_id, account_name, session_cookie, proxy_url, 
        validation_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())
    `, [accountId, '246d6940-dc42-41ca-aa3b-f52845c554b3', account_name, session_cookie, proxy_url]);
    
    res.json({
      success: true,
      account_id: accountId,
      message: 'Account added/updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error adding/updating account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'LinkedIn Account Manager Enhanced',
    services: {
      twoStageScraper: global.twoStageScraper ? 'running' : 'stopped',
      accountValidator: global.accountValidator ? 'running' : 'stopped',
      bulkScrapingService: global.bulkScrapingService ? 'running' : 'stopped',
      stealthScraper: global.stealthScraper ? 'running' : 'stopped'
    }
  });
});

// Enhanced error handling middleware with detailed logging
app.use((error, req, res, next) => {
  console.error('\n❌ === UNHANDLED ERROR ===');
  console.error('Request URL:', req.url);
  console.error('Request method:', req.method);
  console.error('Request headers:', JSON.stringify(req.headers, null, 2));
  console.error('Request body:', JSON.stringify(req.body, null, 2));
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Error code:', error.code);
  console.error('Error errno:', error.errno);
  console.error('Error sqlState:', error.sqlState);
  console.error('Error sqlMessage:', error.sqlMessage);
  console.error('Error stack:', error.stack);
  console.error('=========================\n');
  
  res.status(500).json({
    success: false,
    error: 'Internal server error: ' + error.message,
    debug: {
      errorName: error.name,
      errorCode: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      timestamp: new Date().toISOString()
    }
  });
});

// Global unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 === UNHANDLED PROMISE REJECTION ===');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('Stack:', reason?.stack);
  console.error('=====================================\n');
});

// Global uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('\n💥 === UNCAUGHT EXCEPTION ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('============================\n');
  process.exit(1);
});

// Start server
async function startServer() {
  try {
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log('🚀 LinkedIn Account Manager Server Started');
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📋 API endpoints:`);
      console.log(`   GET    /api/accounts - List accounts`);
      console.log(`   POST   /api/accounts - Add account`);
      console.log(`   GET    /api/accounts/:id - Get account`);
      console.log(`   DELETE /api/accounts/:id - Delete account`);
      console.log(`   POST   /api/accounts/:id/validate - Validate account`);
      console.log(`   GET    /api/stats - Get statistics`);
      console.log(`⏰ Validation worker: Every 30 minutes`);
      
      // Run initial validation worker
      setTimeout(runValidationWorker, 5000);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  
  if (db) {
    await db.end();
    console.log('🔌 Database connection closed');
  }
  
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;