const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Result = sequelize.define('Result', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  jobId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'jobs',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  data: {
    type: DataTypes.JSON,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Result data cannot be empty'
      },
      isValidData(value) {
        if (!value || typeof value !== 'object') {
          throw new Error('Result data must be a valid JSON object');
        }
        
        // Validate required fields based on data type
        if (value.type === 'profile') {
          if (!value.name && !value.headline) {
            throw new Error('Profile data must contain at least name or headline');
          }
        } else if (value.type === 'company') {
          if (!value.name) {
            throw new Error('Company data must contain name');
          }
        } else if (value.type === 'jobPosting') {
          if (!value.title || !value.company) {
            throw new Error('Job posting data must contain title and company');
          }
        }
      }
    }
  },
  uniqueKey: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Unique identifier for deduplication (e.g., LinkedIn profile URL)'
  },
  source: {
    type: DataTypes.ENUM('linkedin', 'api', 'manual'),
    defaultValue: 'linkedin',
    allowNull: false
  },
  quality: {
    type: DataTypes.ENUM('high', 'medium', 'low'),
    defaultValue: 'medium',
    allowNull: false,
    comment: 'Data quality score based on completeness and accuracy'
  },
  isProcessed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    comment: 'Whether this result has been processed/enriched'
  },
  processingNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notes about data processing, validation, or enrichment'
  },
  scrapedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  lastValidatedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'results',
  timestamps: true,
  indexes: [
    {
      fields: ['job_id']
    },
    {
      fields: ['unique_key']
    },
    {
      fields: ['source']
    },
    {
      fields: ['quality']
    },
    {
      fields: ['is_processed']
    },
    {
      fields: ['scraped_at']
    },
    {
      fields: ['created_at']
    },
    {
      unique: true,
      fields: ['job_id', 'unique_key'],
      name: 'unique_job_result'
    }
  ],
  hooks: {
    beforeCreate: (result) => {
      // Auto-generate unique key if not provided
      if (!result.uniqueKey && result.data) {
        if (result.data.url) {
          result.uniqueKey = result.data.url;
        } else if (result.data.profileUrl) {
          result.uniqueKey = result.data.profileUrl;
        } else if (result.data.linkedinUrl) {
          result.uniqueKey = result.data.linkedinUrl;
        } else if (result.data.name && result.data.company) {
          result.uniqueKey = `${result.data.name}-${result.data.company}`.toLowerCase().replace(/\s+/g, '-');
        }
      }
      
      // Auto-assess data quality
      if (result.data) {
        result.quality = assessDataQuality(result.data);
      }
    },
    beforeUpdate: (result) => {
      // Update quality assessment if data changed
      if (result.changed('data')) {
        result.quality = assessDataQuality(result.data);
      }
    }
  }
});

// Helper function to assess data quality
function assessDataQuality(data) {
  let score = 0;
  let maxScore = 0;
  
  // Profile data quality assessment
  if (data.type === 'profile' || (!data.type && data.name)) {
    const profileFields = [
      'name', 'headline', 'company', 'location', 'experience', 
      'education', 'skills', 'connections', 'url', 'profileUrl'
    ];
    
    profileFields.forEach(field => {
      maxScore++;
      if (data[field] && data[field].toString().trim().length > 0) {
        score++;
      }
    });
  }
  
  // Company data quality assessment
  else if (data.type === 'company' || data.companyName) {
    const companyFields = [
      'name', 'size', 'industry', 'website', 'employees', 
      'location', 'description', 'founded', 'url'
    ];
    
    companyFields.forEach(field => {
      maxScore++;
      if (data[field] && data[field].toString().trim().length > 0) {
        score++;
      }
    });
  }
  
  // Job posting data quality assessment
  else if (data.type === 'jobPosting' || data.jobTitle) {
    const jobFields = [
      'title', 'company', 'location', 'postedDate', 'applicants', 
      'description', 'requirements', 'salary', 'url'
    ];
    
    jobFields.forEach(field => {
      maxScore++;
      if (data[field] && data[field].toString().trim().length > 0) {
        score++;
      }
    });
  }
  
  if (maxScore === 0) return 'medium';
  
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 80) return 'high';
  if (percentage >= 50) return 'medium';
  return 'low';
}

// Instance methods
Result.prototype.markAsProcessed = async function(notes = null) {
  return this.update({
    isProcessed: true,
    processingNotes: notes,
    lastValidatedAt: new Date()
  });
};

Result.prototype.updateData = async function(newData, merge = true) {
  const updatedData = merge ? { ...this.data, ...newData } : newData;
  
  return this.update({
    data: updatedData,
    lastValidatedAt: new Date()
  });
};

Result.prototype.getDisplayName = function() {
  const data = this.data;
  
  if (data.name) return data.name;
  if (data.title && data.company) return `${data.title} at ${data.company}`;
  if (data.companyName) return data.companyName;
  if (data.headline) return data.headline;
  
  return 'Unknown';
};

Result.prototype.getContactInfo = function() {
  const data = this.data;
  
  return {
    email: data.email || null,
    phone: data.phone || null,
    linkedin: data.url || data.profileUrl || data.linkedinUrl || null,
    website: data.website || null,
    location: data.location || null
  };
};

// Class methods
Result.findByJob = function(jobId, options = {}) {
  return this.findAll({
    where: { jobId },
    order: [['createdAt', 'DESC']],
    ...options
  });
};

Result.findDuplicates = function(jobId, uniqueKey) {
  return this.findAll({
    where: {
      jobId,
      uniqueKey
    }
  });
};

Result.getResultStats = async function(jobId) {
  const stats = await this.findAll({
    where: { jobId },
    attributes: [
      'quality',
      [sequelize.fn('COUNT', '*'), 'count']
    ],
    group: ['quality'],
    raw: true
  });
  
  const result = {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
    processed: 0,
    unprocessed: 0
  };
  
  stats.forEach(stat => {
    result[stat.quality] = parseInt(stat.count);
    result.total += parseInt(stat.count);
  });
  
  // Get processed count
  const processedCount = await this.count({
    where: { jobId, isProcessed: true }
  });
  
  result.processed = processedCount;
  result.unprocessed = result.total - processedCount;
  
  return result;
};

Result.bulkCreateWithDeduplication = async function(jobId, dataArray) {
  const results = [];
  const errors = [];
  
  for (const data of dataArray) {
    try {
      // Generate unique key for deduplication
      let uniqueKey = null;
      if (data.url) {
        uniqueKey = data.url;
      } else if (data.profileUrl) {
        uniqueKey = data.profileUrl;
      } else if (data.name && data.company) {
        uniqueKey = `${data.name}-${data.company}`.toLowerCase().replace(/\s+/g, '-');
      }
      
      // Check for existing result
      if (uniqueKey) {
        const existing = await this.findOne({
          where: { jobId, uniqueKey }
        });
        
        if (existing) {
          continue; // Skip duplicate
        }
      }
      
      // Create new result
      const result = await this.create({
        jobId,
        data,
        uniqueKey
      });
      
      results.push(result);
    } catch (error) {
      errors.push({ data, error: error.message });
    }
  }
  
  return { results, errors };
};

module.exports = Result;