const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { Job, Result } = require('../models');
const { authenticate } = require('../middleware/auth');
const ScrapingService = require('../../services/scrapingService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

// Parse Excel/CSV file
const parseFile = (buffer, filename) => {
  try {
    if (filename.endsWith('.csv')) {
      // Parse CSV
      const csvData = buffer.toString('utf8');
      const lines = csvData.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ? values[index].trim() : '';
        });
        data.push(row);
      }
      return data;
    } else {
      // Parse Excel
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (data.length < 2) {
        throw new Error('File must contain at least a header row and one data row');
      }
      
      const headers = data[0].map(h => h.toString().toLowerCase().trim());
      const rows = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = data[i][index] ? data[i][index].toString().trim() : '';
        });
        rows.push(row);
      }
      
      return rows;
    }
  } catch (error) {
    throw new Error(`Failed to parse file: ${error.message}`);
  }
};

// Validate LinkedIn company URL
const isValidLinkedInCompanyUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('linkedin.com') && 
           urlObj.pathname.includes('/company/');
  } catch {
    return false;
  }
};

// POST /api/company/scrape-bulk - Bulk company scraping
router.post('/scrape-bulk', 
  authenticate,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      // Parse the uploaded file
      const data = parseFile(req.file.buffer, req.file.originalname);
      
      // Validate file content
      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File is empty or has no data rows'
        });
      }
      
      // Extract URLs from the file
      let urls = [];
      const firstRow = data[0];
      
      // Check for common column names
      if (firstRow.url) {
        urls = data.map(row => row.url).filter(url => url && url.trim());
      } else if (firstRow.urls) {
        urls = data.map(row => row.urls).filter(url => url && url.trim());
      } else if (firstRow['company url']) {
        urls = data.map(row => row['company url']).filter(url => url && url.trim());
      } else if (firstRow['linkedin url']) {
        urls = data.map(row => row['linkedin url']).filter(url => url && url.trim());
      } else if (firstRow['company_url']) {
        urls = data.map(row => row['company_url']).filter(url => url && url.trim());
      } else {
        return res.status(400).json({
          success: false,
          message: 'File must contain a column named "url", "urls", "company url", "company_url", or "linkedin url"'
        });
      }
      
      if (urls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid URLs found in the file'
        });
      }
      
      // Validate URLs
      const validUrls = urls.filter(url => isValidLinkedInCompanyUrl(url));
      
      if (validUrls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid LinkedIn company URLs found'
        });
      }
      
      // Create a bulk job
      const job = await Job.create({
        userId: req.user.id,
        type: 'bulk_company',
        query: `Bulk company scraping (${validUrls.length} companies)`,
        status: 'queued',
        totalResults: 0,
        processedResults: 0,
        progress: 0,
        configuration: {
          urls: validUrls,
          bulkType: 'company'
        }
      });
      
      // Start processing in background
      processBulkCompany(job.id, validUrls, req.user.id);
      
      res.json({
        success: true,
        message: `Bulk company scraping job created for ${validUrls.length} companies. Processing started.`,
        data: {
          jobId: job.id,
          totalUrls: validUrls.length,
          invalidUrls: urls.length - validUrls.length
        }
      });
      
    } catch (error) {
      console.error('Error processing bulk company scraping:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process bulk company scraping file'
      });
    }
  }
);

// Background processing function for bulk company scraping
const processBulkCompany = async (jobId, urls, userId) => {
  try {
    const job = await Job.findByPk(jobId);
    if (!job) return;
    
    await job.update({ 
      status: 'running', 
      startedAt: new Date() 
    });
    
    const scrapingService = new ScrapingService();
    const allResults = [];
    const errors = [];
    
    for (let i = 0; i < urls.length; i++) {
      try {
        const url = urls[i];
        console.log(`Processing company ${i + 1}/${urls.length}: ${url}`);
        
        // Scrape the company profile
        const companyData = await scrapingService.scrapeCompanyProfile(url);
        
        // Save result to database
        const savedResult = await Result.create({
          jobId: job.id,
          data: {
            type: 'company',
            ...companyData,
            sourceUrl: url
          },
          uniqueKey: url,
          quality: companyData.quality || 'medium'
        });
        
        allResults.push(savedResult);
        
        // Update progress
        const progress = Math.round(((i + 1) / urls.length) * 100);
        await job.update({
          processedResults: i + 1,
          totalResults: allResults.length,
          progress: progress
        });
        
        // Add delay between requests to avoid rate limiting
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay for company scraping
        }
        
      } catch (error) {
        console.error(`Error processing company URL ${urls[i]}:`, error);
        errors.push({
          url: urls[i],
          error: error.message
        });
      }
    }
    
    // Complete the job
    await job.update({
      status: 'completed',
      completedAt: new Date(),
      progress: 100,
      configuration: {
        ...job.configuration,
        errors: errors,
        summary: {
          totalCompanies: urls.length,
          successfulCompanies: urls.length - errors.length,
          failedCompanies: errors.length,
          totalResults: allResults.length
        }
      }
    });
    
    console.log(`Bulk company scraping job ${jobId} completed. Results: ${allResults.length}, Errors: ${errors.length}`);
    
  } catch (error) {
    console.error(`Error in bulk company scraping job ${jobId}:`, error);
    
    // Mark job as failed
    await Job.update(
      { 
        status: 'failed', 
        errorMessage: error.message,
        completedAt: new Date()
      },
      { where: { id: jobId } }
    );
  }
};

// GET /api/company/jobs/:id/status - Get bulk company scraping job status
router.get('/jobs/:id/status', authenticate, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
        type: 'bulk_company'
      }
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Bulk company scraping job not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        totalResults: job.totalResults,
        processedResults: job.processedResults,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage,
        configuration: job.configuration
      }
    });
  } catch (error) {
    console.error('Error fetching company job status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job status'
    });
  }
});

// POST /api/company/scrape-single - Single company scraping (existing functionality)
router.post('/scrape-single', authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'Company URL is required'
      });
    }
    
    if (!isValidLinkedInCompanyUrl(url)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid LinkedIn company URL'
      });
    }
    
    // Create a single company scraping job
    const job = await Job.create({
      userId: req.user.id,
      type: 'company',
      query: url,
      status: 'queued',
      totalResults: 0,
      processedResults: 0,
      progress: 0
    });
    
    // Start processing
    processSingleCompany(job.id, url);
    
    res.json({
      success: true,
      message: 'Company scraping job created',
      data: {
        jobId: job.id
      }
    });
    
  } catch (error) {
    console.error('Error creating company scraping job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create company scraping job'
    });
  }
});

// Background processing for single company
const processSingleCompany = async (jobId, url) => {
  try {
    const job = await Job.findByPk(jobId);
    if (!job) return;
    
    await job.update({ 
      status: 'running', 
      startedAt: new Date() 
    });
    
    const scrapingService = new ScrapingService();
    const companyData = await scrapingService.scrapeCompanyProfile(url);
    
    // Save result
    await Result.create({
      jobId: job.id,
      data: {
        type: 'company',
        ...companyData,
        sourceUrl: url
      },
      uniqueKey: url,
      quality: companyData.quality || 'medium'
    });
    
    // Complete the job
    await job.update({
      status: 'completed',
      completedAt: new Date(),
      progress: 100,
      totalResults: 1,
      processedResults: 1
    });
    
  } catch (error) {
    console.error(`Error in single company scraping job ${jobId}:`, error);
    
    await Job.update(
      { 
        status: 'failed', 
        errorMessage: error.message,
        completedAt: new Date()
      },
      { where: { id: jobId } }
    );
  }
};

module.exports = router;