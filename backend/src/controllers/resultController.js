const { param, query, validationResult } = require('express-validator');
const { Job, Result, User } = require('../models');
const { asyncHandler, createValidationError, NotFoundError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const csv = require('fast-csv');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

/**
 * Validation rules for job ID parameter
 */
const jobIdValidation = [
  param('jobId')
    .isUUID()
    .withMessage('Job ID must be a valid UUID')
];

/**
 * @desc    Get results for a specific job
 * @route   GET /api/results/:jobId
 * @access  Private
 */
const getResults = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array());
  }

  const {
    page = 1,
    limit = 50,
    quality,
    sortBy = 'createdAt',
    sortOrder = 'DESC',
    search
  } = req.query;

  // Verify job belongs to user
  const job = await Job.findOne({
    where: {
      id: req.params.jobId,
      userId: req.user.id
    }
  });

  if (!job) {
    throw new NotFoundError('Job');
  }

  const offset = (page - 1) * limit;
  const whereClause = { jobId: req.params.jobId };

  // Add filters
  if (quality) {
    whereClause.quality = quality;
  }

  // Add search functionality
  if (search) {
    whereClause[Result.sequelize.Sequelize.Op.or] = [
      {
        data: {
          [Result.sequelize.Sequelize.Op.like]: `%${search}%`
        }
      }
    ];
  }

  // Get results with pagination
  const { count, rows: results } = await Result.findAndCountAll({
    where: whereClause,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[sortBy, sortOrder.toUpperCase()]]
  });

  // Get result statistics
  const stats = await Result.getResultStats(req.params.jobId);

  res.json({
    success: true,
    data: {
      results: results.map(result => ({
        id: result.id,
        data: result.data,
        quality: result.quality,
        uniqueKey: result.uniqueKey,
        isProcessed: result.isProcessed,
        scrapedAt: result.scrapedAt,
        createdAt: result.createdAt
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalResults: count,
        hasNextPage: page * limit < count,
        hasPrevPage: page > 1
      },
      stats,
      job: {
        id: job.id,
        type: job.type,
        query: job.query,
        status: job.status
      }
    }
  });
});

/**
 * @desc    Export results in various formats
 * @route   GET /api/results/:jobId/export
 * @access  Private
 */
const exportResults = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createValidationError(errors.array());
  }

  const { format = 'csv', quality } = req.query;

  // Verify job belongs to user
  const job = await Job.findOne({
    where: {
      id: req.params.jobId,
      userId: req.user.id
    }
  });

  if (!job) {
    throw new NotFoundError('Job');
  }

  const whereClause = { jobId: req.params.jobId };
  if (quality) {
    whereClause.quality = quality;
  }

  // Get all results for export
  const results = await Result.findAll({
    where: whereClause,
    order: [['createdAt', 'DESC']]
  });

  if (results.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No results found for export'
    });
  }

  // Prepare data for export
  const exportData = results.map(result => {
    const data = result.data;
    return {
      id: result.id,
      name: data.name || '',
      title: data.title || data.headline || '',
      company: data.company || data.companyName || '',
      location: data.location || '',
      email: data.email || '',
      phone: data.phone || '',
      linkedin_url: data.url || data.profileUrl || data.linkedinUrl || '',
      website: data.website || '',
      industry: data.industry || '',
      experience: data.experience || '',
      education: data.education || '',
      skills: Array.isArray(data.skills) ? data.skills.join(', ') : (data.skills || ''),
      connections: data.connections || '',
      quality: result.quality,
      scraped_at: result.scrapedAt,
      created_at: result.createdAt
    };
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `linkedin-results-${job.type}-${timestamp}`;

  try {
    if (format === 'csv') {
      // Export as CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      
      const csvStream = csv.format({ headers: true });
      csvStream.pipe(res);
      
      exportData.forEach(row => csvStream.write(row));
      csvStream.end();
      
    } else if (format === 'excel') {
      // Export as Excel
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Auto-size columns
      const colWidths = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.max(key.length, 15)
      }));
      worksheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'LinkedIn Results');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.send(buffer);
      
    } else if (format === 'json') {
      // Export as JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json({
        job: {
          id: job.id,
          type: job.type,
          query: job.query,
          status: job.status,
          createdAt: job.createdAt
        },
        results: exportData,
        exportedAt: new Date().toISOString(),
        totalResults: exportData.length
      });
      
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid export format. Supported formats: csv, excel, json'
      });
    }

    logger.info('Results exported', {
      jobId: job.id,
      userId: req.user.id,
      format,
      resultCount: exportData.length
    });

  } catch (error) {
    logger.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export results'
    });
  }
});

/**
 * @desc    Get a single result by ID
 * @route   GET /api/results/:jobId/:resultId
 * @access  Private
 */
const getResult = asyncHandler(async (req, res) => {
  const { jobId, resultId } = req.params;

  // Verify job belongs to user
  const job = await Job.findOne({
    where: {
      id: jobId,
      userId: req.user.id
    }
  });

  if (!job) {
    throw new NotFoundError('Job');
  }

  // Get specific result
  const result = await Result.findOne({
    where: {
      id: resultId,
      jobId: jobId
    }
  });

  if (!result) {
    throw new NotFoundError('Result');
  }

  res.json({
    success: true,
    data: {
      result: {
        id: result.id,
        data: result.data,
        quality: result.quality,
        uniqueKey: result.uniqueKey,
        isProcessed: result.isProcessed,
        processingNotes: result.processingNotes,
        scrapedAt: result.scrapedAt,
        lastValidatedAt: result.lastValidatedAt,
        createdAt: result.createdAt
      },
      job: {
        id: job.id,
        type: job.type,
        query: job.query,
        status: job.status
      }
    }
  });
});

/**
 * @desc    Update result data
 * @route   PUT /api/results/:jobId/:resultId
 * @access  Private
 */
const updateResult = asyncHandler(async (req, res) => {
  const { jobId, resultId } = req.params;
  const { data, processingNotes } = req.body;

  // Verify job belongs to user
  const job = await Job.findOne({
    where: {
      id: jobId,
      userId: req.user.id
    }
  });

  if (!job) {
    throw new NotFoundError('Job');
  }

  // Get and update result
  const result = await Result.findOne({
    where: {
      id: resultId,
      jobId: jobId
    }
  });

  if (!result) {
    throw new NotFoundError('Result');
  }

  const updates = {};
  if (data) {
    updates.data = { ...result.data, ...data };
  }
  if (processingNotes !== undefined) {
    updates.processingNotes = processingNotes;
    updates.isProcessed = true;
    updates.lastValidatedAt = new Date();
  }

  await result.update(updates);

  logger.info('Result updated', {
    resultId: result.id,
    jobId: job.id,
    userId: req.user.id,
    updates: Object.keys(updates)
  });

  res.json({
    success: true,
    message: 'Result updated successfully',
    data: {
      result: result.toJSON()
    }
  });
});

/**
 * @desc    Delete a result
 * @route   DELETE /api/results/:jobId/:resultId
 * @access  Private
 */
const deleteResult = asyncHandler(async (req, res) => {
  const { jobId, resultId } = req.params;

  // Verify job belongs to user
  const job = await Job.findOne({
    where: {
      id: jobId,
      userId: req.user.id
    }
  });

  if (!job) {
    throw new NotFoundError('Job');
  }

  // Get and delete result
  const result = await Result.findOne({
    where: {
      id: resultId,
      jobId: jobId
    }
  });

  if (!result) {
    throw new NotFoundError('Result');
  }

  await result.destroy();

  // Update job processed results count
  const remainingResults = await Result.count({ where: { jobId } });
  await job.update({ processedResults: remainingResults });

  logger.info('Result deleted', {
    resultId: result.id,
    jobId: job.id,
    userId: req.user.id
  });

  res.json({
    success: true,
    message: 'Result deleted successfully'
  });
});

/**
 * @desc    Bulk delete results
 * @route   DELETE /api/results/:jobId/bulk
 * @access  Private
 */
const bulkDeleteResults = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { resultIds, quality } = req.body;

  // Verify job belongs to user
  const job = await Job.findOne({
    where: {
      id: jobId,
      userId: req.user.id
    }
  });

  if (!job) {
    throw new NotFoundError('Job');
  }

  const whereClause = { jobId };

  if (resultIds && Array.isArray(resultIds)) {
    whereClause.id = { [Result.sequelize.Sequelize.Op.in]: resultIds };
  } else if (quality) {
    whereClause.quality = quality;
  } else {
    return res.status(400).json({
      success: false,
      message: 'Either resultIds array or quality filter is required'
    });
  }

  const deletedCount = await Result.destroy({ where: whereClause });

  // Update job processed results count
  const remainingResults = await Result.count({ where: { jobId } });
  await job.update({ processedResults: remainingResults });

  logger.info('Bulk delete results', {
    jobId: job.id,
    userId: req.user.id,
    deletedCount,
    criteria: resultIds ? 'resultIds' : 'quality'
  });

  res.json({
    success: true,
    message: `${deletedCount} results deleted successfully`,
    data: {
      deletedCount,
      remainingResults
    }
  });
});

module.exports = {
  getResults: [jobIdValidation, getResults],
  exportResults: [jobIdValidation, exportResults],
  getResult,
  updateResult,
  deleteResult,
  bulkDeleteResults
};}