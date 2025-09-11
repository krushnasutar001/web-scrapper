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

// Validate LinkedIn search URL
const isValidLinkedInSearchUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('linkedin.com') && 
           (urlObj.pathname.includes('/search/') || urlObj.pathname.includes('/in/'));
  } catch {
    return false;
  }
};

// POST /api/search/export-bulk - Bulk search result export
router.post('/export-bulk', 
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
      } else if (firstRow['search url']) {
        urls = data.map(row => row['search url']).filter(url => url && url.trim());
      } else if (firstRow['linkedin url']) {
        urls = data.map(row => row['linkedin url']).filter(url => url && url.trim());
      } else {
        return res.status(400).json({
          success: false,
          message: 'File must contain a column named "url", "urls", "search url", or "linkedin url"'
        });
      }
      
      if (urls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid URLs found in the file'
        });
      }
      
      // Validate URLs
      const validUrls = urls.filter(url => isValidLinkedInSearchUrl(url));
      
      if (validUrls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid LinkedIn search URLs found'
        });
      }
      
      // Create a bulk job
      const job = await Job.create({
        userId: req.user.id,
        type: 'bulk_search',
        query: `Bulk search export (${validUrls.length} URLs)`,
        status: 'queued',
        totalResults: 0,
        processedResults: 0,
        progress: 0,
        configuration: {
          urls: validUrls,
          bulkType: 'search'
        }
      });
      
      // Start processing in background
      processBulkSearch(job.id, validUrls, req.user.id);
      
      res.json({
        success: true,
        message: `Bulk search job created for ${validUrls.length} URLs. Processing started.`,
        data: {
          jobId: job.id,
          totalUrls: validUrls.length,
          invalidUrls: urls.length - validUrls.length
        }
      });
      
    } catch (error) {
      console.error('Error processing bulk search:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process bulk search file'
      });
    }
  }
);

// Background processing function for bulk search
const processBulkSearch = async (jobId, urls, userId) => {
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
        console.log(`Processing URL ${i + 1}/${urls.length}: ${url}`);
        
        // Scrape the search results
        const results = await scrapingService.scrapeSearchResults(url);
        
        // Save results to database
        for (const result of results) {
          const savedResult = await Result.create({
            jobId: job.id,
            data: result,
            uniqueKey: result.url || `${url}_${Date.now()}_${Math.random()}`,
            quality: result.quality || 'medium'
          });
          allResults.push(savedResult);
        }
        
        // Update progress
        const progress = Math.round(((i + 1) / urls.length) * 100);
        await job.update({
          processedResults: i + 1,
          totalResults: allResults.length,
          progress: progress
        });
        
        // Add delay between requests to avoid rate limiting
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`Error processing URL ${urls[i]}:`, error);
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
          totalUrls: urls.length,
          successfulUrls: urls.length - errors.length,
          failedUrls: errors.length,
          totalResults: allResults.length
        }
      }
    });
    
    console.log(`Bulk search job ${jobId} completed. Results: ${allResults.length}, Errors: ${errors.length}`);
    
  } catch (error) {
    console.error(`Error in bulk search job ${jobId}:`, error);
    
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

// GET /api/search/jobs/:id/status - Get bulk search job status
router.get('/jobs/:id/status', authenticate, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
        type: 'bulk_search'
      }
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Bulk search job not found'
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
    console.error('Error fetching job status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job status'
    });
  }
});

module.exports = router;