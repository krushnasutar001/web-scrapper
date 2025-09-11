const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: {
        msg: 'Must be a valid email address'
      },
      notEmpty: {
        msg: 'Email cannot be empty'
      }
    }
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Password hash cannot be empty'
      },
      len: {
        args: [60, 60],
        msg: 'Password hash must be exactly 60 characters (bcrypt)'
      }
    }
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: {
        args: [1, 50],
        msg: 'First name must be between 1 and 50 characters'
      }
    }
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: {
        args: [1, 50],
        msg: 'Last name must be between 1 and 50 characters'
      }
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  emailVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resetPasswordToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resetPasswordExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['created_at']
    }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.passwordHash = await bcrypt.hash(user.password, 12);
        delete user.password;
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.passwordHash = await bcrypt.hash(user.password, 12);
        delete user.password;
      }
    }
  }
});

// Instance methods
User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.passwordHash;
  delete values.resetPasswordToken;
  delete values.resetPasswordExpiresAt;
  return values;
};

User.prototype.getFullName = function() {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim() || this.email;
};

// Class methods
User.findByEmail = function(email) {
  return this.findOne({
    where: { email: email.toLowerCase() }
  });
};

User.createUser = async function(userData) {
  const { email, password, firstName, lastName } = userData;
  
  // Check if user already exists
  const existingUser = await this.findByEmail(email);
  if (existingUser) {
    throw new Error('User with this email already exists');
  }
  
  // Create new user
  return this.create({
    email: email.toLowerCase(),
    password, // Will be hashed by beforeCreate hook
    firstName,
    lastName
  });
};

User.authenticate = async function(email, password) {
  const user = await this.findByEmail(email);
  if (!user || !user.isActive) {
    return null;
  }
  
  const isValid = await user.validatePassword(password);
  if (!isValid) {
    return null;
  }
  
  // Update last login
  await user.update({ lastLoginAt: new Date() });
  
  return user;
};

module.exports = User;