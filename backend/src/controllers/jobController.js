const { Job, Result, sequelize } = require('../models');
const { asyncHandler, createValidationError } = require('../utils/errorHandler');
const { body, validationResult } = require('express-validator');

/**
 * Create a new scraping job
 */
const createJob = asyncHandler(async (req, res) => {
  const { type, query, maxResults, configuration } = req.body;
  
  // Basic validation
  if (!type || !query) {
    return res.status(400).json({
      success: false,
      message: 'Job type and query are required'
    });
  }
  
  try {
    const job = await Job.create({
      userId: req.user.id,
      type,
      query,
      maxResults: maxResults || 100,
      configuration: configuration || {},
      status: 'queued'
    });
    
    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create job',
      error: error.message
    });
  }
});

/**
 * Get all jobs for the authenticated user
 */
const getJobs = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 DEBUG getJobs: req.user =', req.user ? {
      id: req.user.id,
      email: req.user.email
    } : 'undefined');
    
    if (!req.user || !req.user.id) {
      console.error('❌ DEBUG getJobs: req.user or req.user.id is missing');
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }
    
    console.log('🔍 DEBUG getJobs: Querying jobs for userId:', req.user.id);
    
    const jobs = await Job.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{
        model: Result,
        as: 'results',
        attributes: ['id', 'createdAt']
      }]
    });
    
    console.log('✅ DEBUG getJobs: Successfully fetched', jobs.length, 'jobs');
    
    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('❌ DEBUG getJobs ERROR:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch jobs',
      error: error.message
    });
  }
});

/**
 * Get a specific job by ID
 */
const getJobById = asyncHandler(async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { 
        id: req.params.id,
        userId: req.user.id 
      },
      include: [{
        model: Result,
        as: 'results'
      }]
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job',
      error: error.message
    });
  }
});

/**
 * Update a job
 */
const updateJob = asyncHandler(async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { 
        id: req.params.id,
        userId: req.user.id 
      }
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    await job.update(req.body);
    
    res.json({
      success: true,
      message: 'Job updated successfully',
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update job',
      error: error.message
    });
  }
});

/**
 * Delete a job
 */
const deleteJob = asyncHandler(async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { 
        id: req.params.id,
        userId: req.user.id 
      }
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    await job.destroy();
    
    res.json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete job',
      error: error.message
    });
  }
});

/**
 * Start/execute a job
 */
const executeJob = asyncHandler(async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { 
        id: req.params.id,
        userId: req.user.id 
      }
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    // Update job status to running
    await job.update({ 
      status: 'running',
      startedAt: new Date()
    });
    
    // TODO: Implement actual scraping logic here
    // For now, just simulate job execution
    
    res.json({
      success: true,
      message: 'Job execution started',
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to execute job',
      error: error.message
    });
  }
});

/**
 * Cancel a running job
 */
const cancelJob = asyncHandler(async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { 
        id: req.params.id,
        userId: req.user.id 
      }
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    await job.update({ status: 'cancelled' });
    
    res.json({
      success: true,
      message: 'Job cancelled successfully',
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel job',
      error: error.message
    });
  }
});

/**
 * Get job statistics for the authenticated user
 */
const getJobStats = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get job counts by status
    const stats = await Job.findAll({
      where: { userId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });
    
    // Get total results count
    const totalResults = await Result.count({
      include: [{
        model: Job,
        as: 'job',
        where: { userId },
        attributes: []
      }]
    });
    
    // Format stats
    const formattedStats = {
      totalJobs: 0,
      activeJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalResults,
      successRate: 0
    };
    
    stats.forEach(stat => {
      const count = parseInt(stat.count);
      formattedStats.totalJobs += count;
      
      switch (stat.status) {
        case 'running':
        case 'queued':
          formattedStats.activeJobs += count;
          break;
        case 'completed':
          formattedStats.completedJobs += count;
          break;
        case 'failed':
          formattedStats.failedJobs += count;
          break;
      }
    });
    
    // Calculate success rate
    if (formattedStats.totalJobs > 0) {
      formattedStats.successRate = Math.round(
        (formattedStats.completedJobs / formattedStats.totalJobs) * 100
      );
    }
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job statistics',
      error: error.message
    });
  }
});

/**
 * Retry a failed job
 */
const retryJob = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const job = await Job.findOne({
      where: { 
        id,
        userId: req.user.id 
      }
    });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    if (job.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Only failed jobs can be retried'
      });
    }
    
    if (job.retryCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum retry attempts reached'
      });
    }
    
    // Reset job for retry
    await job.update({
      status: 'queued',
      retryCount: job.retryCount + 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null
    });
    
    res.json({
      success: true,
      message: 'Job retry initiated',
      data: { job }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retry job',
      error: error.message
    });
  }
});

module.exports = {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
  executeJob,
  cancelJob,
  getJobStats,
  retryJob
};