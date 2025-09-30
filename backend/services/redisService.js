// Redis Connection Service
const Redis = require('ioredis');
const config = require('../config');

// Redis connection configuration
const redisConfig = {
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
};

// Create Redis connection
const redis = new Redis(config.REDIS_URL, redisConfig);

// Connection event handlers
redis.on('connect', () => {
  console.log('✅ Redis connecting...');
});

redis.on('ready', () => {
  console.log('✅ Redis connected and ready');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redis.on('close', () => {
  console.log('⚠️ Redis connection closed');
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

// Test Redis connection
async function testRedisConnection() {
  try {
    await redis.ping();
    console.log('✅ Redis ping successful');
    return true;
  } catch (error) {
    console.error('❌ Redis ping failed:', error.message);
    return false;
  }
}

// Initialize Redis connection
async function initializeRedis() {
  try {
    await redis.connect();
    const isConnected = await testRedisConnection();
    
    if (!isConnected) {
      console.warn('⚠️ Redis not available, job queue may not work');
    }
    
    return redis;
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error.message);
    throw error;
  }
}

// Redis utility functions
const redisUtils = {
  // Set key with expiration
  async setWithExpiry(key, value, expirySeconds = 3600) {
    try {
      return await redis.setex(key, expirySeconds, JSON.stringify(value));
    } catch (error) {
      console.error('Redis setWithExpiry error:', error);
      throw error;
    }
  },

  // Get and parse JSON value
  async getJSON(key) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis getJSON error:', error);
      return null;
    }
  },

  // Delete key
  async delete(key) {
    try {
      return await redis.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
      throw error;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      return await redis.exists(key);
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  },

  // Increment counter
  async increment(key, amount = 1) {
    try {
      return await redis.incrby(key, amount);
    } catch (error) {
      console.error('Redis increment error:', error);
      throw error;
    }
  },

  // Add to set
  async addToSet(key, ...members) {
    try {
      return await redis.sadd(key, ...members);
    } catch (error) {
      console.error('Redis addToSet error:', error);
      throw error;
    }
  },

  // Get set members
  async getSetMembers(key) {
    try {
      return await redis.smembers(key);
    } catch (error) {
      console.error('Redis getSetMembers error:', error);
      return [];
    }
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing Redis connection...');
  await redis.quit();
  process.exit(0);
});

module.exports = {
  redis,
  redisUtils,
  testRedisConnection,
  initializeRedis
};

// Initialize on module load
if (require.main === module) {
  initializeRedis().catch(console.error);
}