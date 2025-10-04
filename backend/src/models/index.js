const { sequelize } = require('../config/database');
const User = require('./User');
const Job = require('./Job');
const Result = require('./Result');
const Account = require('./Account');

// Define associations

// User has many Accounts
User.hasMany(Account, {
  foreignKey: 'userId',
  as: 'accounts',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Account belongs to User
Account.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// User has many Jobs
User.hasMany(Job, {
  foreignKey: 'userId',
  as: 'jobs',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Job belongs to User
Job.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Job has many Results
Job.hasMany(Result, {
  foreignKey: 'jobId',
  as: 'results',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Result belongs to Job
Result.belongsTo(Job, {
  foreignKey: 'jobId',
  as: 'job',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Many-to-Many: Jobs assigned to multiple Accounts and vice versa
// Fixes: "N:M associations are not supported with hasMany. Use belongsToMany instead"
Job.belongsToMany(Account, {
  through: 'job_account_assignments',
  as: 'accounts',
  foreignKey: 'jobId',
  otherKey: 'accountId',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

Account.belongsToMany(Job, {
  through: 'job_account_assignments',
  as: 'jobsAssigned',
  foreignKey: 'accountId',
  otherKey: 'jobId',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// User can access Results through Jobs (no direct association needed)
// Results are accessible via: user.getJobs({ include: [Result] })

// Sync all models
const syncModels = async (options = {}) => {
  try {
    // Sync in order to respect foreign key constraints
    await User.sync(options);
    await Account.sync(options);
    await Job.sync(options);
    await Result.sync(options);
    
    console.log('All models synchronized successfully');
    return true;
  } catch (error) {
    console.error('Error synchronizing models:', error);
    throw error;
  }
};

// Drop all tables (use with caution)
const dropAllTables = async () => {
  try {
    await sequelize.drop();
    console.log('All tables dropped successfully');
    return true;
  } catch (error) {
    console.error('Error dropping tables:', error);
    throw error;
  }
};

// Create sample data for development
const createSampleData = async () => {
  try {
    // Create sample user
    const sampleUser = await User.create({
      email: 'demo@example.com',
      password: 'password123',
      firstName: 'Demo',
      lastName: 'User',
      emailVerifiedAt: new Date()
    });
    
    // Create sample jobs
    const profileJob = await Job.create({
      userId: sampleUser.id,
      type: 'profile',
      query: 'software engineer',
      status: 'completed',
      totalResults: 5,
      processedResults: 5,
      progress: 100,
      startedAt: new Date(Date.now() - 3600000), // 1 hour ago
      completedAt: new Date(Date.now() - 1800000) // 30 minutes ago
    });
    
    const companyJob = await Job.create({
      userId: sampleUser.id,
      type: 'company',
      query: 'tech companies',
      status: 'running',
      totalResults: 10,
      processedResults: 3,
      progress: 30,
      startedAt: new Date(Date.now() - 600000) // 10 minutes ago
    });
    
    // Create sample results for profile job
    const sampleResults = [
      {
        jobId: profileJob.id,
        data: {
          type: 'profile',
          name: 'John Doe',
          headline: 'Senior Software Engineer at Tech Corp',
          company: 'Tech Corp',
          location: 'San Francisco, CA',
          experience: '5+ years',
          skills: ['JavaScript', 'React', 'Node.js'],
          connections: '500+',
          url: 'https://linkedin.com/in/johndoe'
        },
        uniqueKey: 'https://linkedin.com/in/johndoe',
        quality: 'high'
      },
      {
        jobId: profileJob.id,
        data: {
          type: 'profile',
          name: 'Jane Smith',
          headline: 'Full Stack Developer',
          company: 'StartupXYZ',
          location: 'New York, NY',
          experience: '3 years',
          skills: ['Python', 'Django', 'PostgreSQL'],
          url: 'https://linkedin.com/in/janesmith'
        },
        uniqueKey: 'https://linkedin.com/in/janesmith',
        quality: 'medium'
      },
      {
        jobId: profileJob.id,
        data: {
          type: 'profile',
          name: 'Mike Johnson',
          headline: 'DevOps Engineer',
          company: 'CloudTech Inc',
          location: 'Austin, TX',
          skills: ['AWS', 'Docker', 'Kubernetes'],
          url: 'https://linkedin.com/in/mikejohnson'
        },
        uniqueKey: 'https://linkedin.com/in/mikejohnson',
        quality: 'medium'
      }
    ];
    
    await Result.bulkCreate(sampleResults);
    
    // Create sample results for company job
    const companySampleResults = [
      {
        jobId: companyJob.id,
        data: {
          type: 'company',
          name: 'Tech Innovations Ltd',
          size: '201-500 employees',
          industry: 'Software Development',
          location: 'Silicon Valley, CA',
          website: 'https://techinnovations.com',
          url: 'https://linkedin.com/company/tech-innovations'
        },
        uniqueKey: 'https://linkedin.com/company/tech-innovations',
        quality: 'high'
      },
      {
        jobId: companyJob.id,
        data: {
          type: 'company',
          name: 'Digital Solutions Corp',
          size: '51-200 employees',
          industry: 'Information Technology',
          location: 'Boston, MA',
          url: 'https://linkedin.com/company/digital-solutions'
        },
        uniqueKey: 'https://linkedin.com/company/digital-solutions',
        quality: 'medium'
      }
    ];
    
    await Result.bulkCreate(companySampleResults);
    
    console.log('Sample data created successfully');
    return {
      user: sampleUser,
      jobs: [profileJob, companyJob],
      resultsCount: sampleResults.length + companySampleResults.length
    };
  } catch (error) {
    console.error('Error creating sample data:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  User,
  Job,
  Result,
  Account,
  syncModels,
  dropAllTables,
  createSampleData
};