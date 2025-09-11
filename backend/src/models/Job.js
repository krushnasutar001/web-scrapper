const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Job = sequelize.define('Job', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  type: {
    type: DataTypes.ENUM('profile', 'company', 'search', 'jobPosting'),
    allowNull: false,
    validate: {
      isIn: {
        args: [['profile', 'company', 'search', 'jobPosting']],
        msg: 'Job type must be one of: profile, company, search, jobPosting'
      }
    }
  },
  query: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Query cannot be empty'
      },
      len: {
        args: [1, 1000],
        msg: 'Query must be between 1 and 1000 characters'
      }
    }
  },
  status: {
    type: DataTypes.ENUM('queued', 'running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'queued',
    allowNull: false,
    validate: {
      isIn: {
        args: [['queued', 'running', 'completed', 'failed', 'cancelled']],
        msg: 'Status must be one of: queued, running, completed, failed, cancelled'
      }
    }
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'Progress cannot be negative'
      },
      max: {
        args: [100],
        msg: 'Progress cannot exceed 100'
      }
    }
  },
  totalResults: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'Total results cannot be negative'
      }
    }
  },
  processedResults: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'Processed results cannot be negative'
      }
    }
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  scheduledFor: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cronExpression: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isCronExpression(value) {
        if (value && !/^(\*|[0-5]?\d)\s+(\*|1?\d|2[0-3])\s+(\*|[12]?\d|3[01])\s+(\*|[1-9]|1[0-2])\s+(\*|[0-6])$/.test(value)) {
          throw new Error('Invalid cron expression format');
        }
      }
    }
  },
  isRecurring: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  maxResults: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    allowNull: false,
    validate: {
      min: {
        args: [1],
        msg: 'Max results must be at least 1'
      },
      max: {
        args: [10000],
        msg: 'Max results cannot exceed 10000'
      }
    }
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'Retry count cannot be negative'
      },
      max: {
        args: [3],
        msg: 'Retry count cannot exceed 3'
      }
    }
  },
  configuration: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional job configuration like filters, sorting, etc.'
  }
}, {
  tableName: 'jobs',
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['type']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['scheduled_for']
    },
    {
      fields: ['is_recurring']
    },
    {
      fields: ['user_id', 'status']
    }
  ],
  hooks: {
    beforeUpdate: (job) => {
      // Auto-set timestamps based on status changes
      if (job.changed('status')) {
        const now = new Date();
        
        if (job.status === 'running' && !job.startedAt) {
          job.startedAt = now;
        }
        
        if (['completed', 'failed', 'cancelled'].includes(job.status) && !job.completedAt) {
          job.completedAt = now;
        }
        
        // Calculate progress for completed jobs
        if (job.status === 'completed' && job.progress < 100) {
          job.progress = 100;
        }
      }
    }
  }
});

// Instance methods
Job.prototype.updateProgress = async function(processed, total = null) {
  const updates = { processedResults: processed };
  
  if (total !== null) {
    updates.totalResults = total;
  }
  
  if (this.totalResults > 0) {
    updates.progress = Math.min(100, Math.round((processed / this.totalResults) * 100));
  }
  
  return this.update(updates);
};

Job.prototype.markAsRunning = async function() {
  return this.update({
    status: 'running',
    startedAt: new Date()
  });
};

Job.prototype.markAsCompleted = async function() {
  return this.update({
    status: 'completed',
    completedAt: new Date(),
    progress: 100
  });
};

Job.prototype.markAsFailed = async function(errorMessage) {
  return this.update({
    status: 'failed',
    completedAt: new Date(),
    errorMessage
  });
};

Job.prototype.incrementRetry = async function() {
  return this.update({
    retryCount: this.retryCount + 1
  });
};

Job.prototype.getDuration = function() {
  if (!this.startedAt) return null;
  
  const endTime = this.completedAt || new Date();
  return Math.round((endTime - this.startedAt) / 1000); // Duration in seconds
};

// Class methods
Job.findByUser = function(userId, options = {}) {
  return this.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    ...options
  });
};

Job.findPendingJobs = function() {
  return this.findAll({
    where: {
      status: 'queued',
      scheduledFor: {
        [sequelize.Sequelize.Op.or]: [
          null,
          { [sequelize.Sequelize.Op.lte]: new Date() }
        ]
      }
    },
    order: [['createdAt', 'ASC']]
  });
};

Job.findRunningJobs = function() {
  return this.findAll({
    where: { status: 'running' },
    order: [['startedAt', 'ASC']]
  });
};

Job.getJobStats = async function(userId = null) {
  const whereClause = userId ? { userId } : {};
  
  const stats = await this.findAll({
    where: whereClause,
    attributes: [
      'status',
      [sequelize.fn('COUNT', '*'), 'count']
    ],
    group: ['status'],
    raw: true
  });
  
  const result = {
    total: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  };
  
  stats.forEach(stat => {
    result[stat.status] = parseInt(stat.count);
    result.total += parseInt(stat.count);
  });
  
  return result;
};

module.exports = Job;