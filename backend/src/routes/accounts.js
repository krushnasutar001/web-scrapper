const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');
const { Account } = require('../models');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { body } = require('express-validator');

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

// Cookie validation function
const checkCookies = async (cookies) => {
  try {
    const response = await axios.get('https://www.linkedin.com/feed/', {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000,
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    // Check if we're redirected to login page or get a successful response
    return response.status === 200 && !response.data.includes('login-form');
  } catch (error) {
    console.error('Cookie validation error:', error.message);
    return false;
  }
};

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

// GET /api/accounts - Get all accounts for user
router.get('/', authenticate, async (req, res) => {
  try {
    const accounts = await Account.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts'
    });
  }
});

// POST /api/accounts - Create single account
router.post('/', 
  authenticate,
  [
    body('name').notEmpty().withMessage('Account name is required'),
    body('cookies').notEmpty().withMessage('Cookies are required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { name, cookies } = req.body;
      
      // Validate cookies
      const isValid = await checkCookies(cookies);
      
      const account = await Account.create({
        name,
        cookies,
        userId: req.user.id,
        validationStatus: isValid ? 'valid' : 'invalid',
        lastValidated: new Date()
      });
      
      res.status(201).json({
        success: true,
        message: isValid ? 'Account successfully added' : 'Account added but cookies may be invalid',
        data: account
      });
    } catch (error) {
      console.error('Error creating account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create account'
      });
    }
  }
);

// POST /api/accounts/upload - Upload Excel/CSV file with multiple accounts
router.post('/upload', 
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
      
      // Validate required columns
      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File is empty or has no data rows'
        });
      }
      
      const firstRow = data[0];
      if (!firstRow.name || !firstRow.cookies) {
        return res.status(400).json({
          success: false,
          message: 'File must contain "name" and "cookies" columns'
        });
      }
      
      const results = {
        successful: [],
        failed: [],
        total: data.length
      };
      
      // Process each row
      for (const row of data) {
        try {
          if (!row.name || !row.cookies) {
            results.failed.push({
              name: row.name || 'Unknown',
              error: 'Missing name or cookies'
            });
            continue;
          }
          
          // Validate cookies
          const isValid = await checkCookies(row.cookies);
          
          if (!isValid) {
            results.failed.push({
              name: row.name,
              error: 'Invalid cookies. Please add account manually'
            });
            continue;
          }
          
          // Create account
          const account = await Account.create({
            name: row.name,
            cookies: row.cookies,
            userId: req.user.id,
            validationStatus: 'valid',
            lastValidated: new Date()
          });
          
          results.successful.push({
            id: account.id,
            name: account.name
          });
          
        } catch (error) {
          console.error(`Error processing account ${row.name}:`, error);
          results.failed.push({
            name: row.name,
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        message: `Processed ${results.total} accounts. ${results.successful.length} successful, ${results.failed.length} failed.`,
        data: results
      });
      
    } catch (error) {
      console.error('Error uploading accounts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process uploaded file'
      });
    }
  }
);

// DELETE /api/accounts/:id - Delete account
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const account = await Account.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    await account.destroy();
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});

// PUT /api/accounts/:id - Update account
router.put('/:id',
  authenticate,
  [
    body('name').optional().notEmpty().withMessage('Account name cannot be empty'),
    body('cookies').optional().notEmpty().withMessage('Cookies cannot be empty')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const account = await Account.findOne({
        where: {
          id: req.params.id,
          userId: req.user.id
        }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }
      
      const updateData = {};
      if (req.body.name) updateData.name = req.body.name;
      if (req.body.cookies) {
        updateData.cookies = req.body.cookies;
        // Re-validate cookies if they're being updated
        const isValid = await checkCookies(req.body.cookies);
        updateData.validationStatus = isValid ? 'valid' : 'invalid';
        updateData.lastValidated = new Date();
      }
      
      await account.update(updateData);
      
      res.json({
        success: true,
        message: 'Account updated successfully',
        data: account
      });
    } catch (error) {
      console.error('Error updating account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update account'
      });
    }
  }
);

module.exports = router;