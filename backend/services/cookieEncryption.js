const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Generate or retrieve encryption key from environment
 */
function getEncryptionKey() {
  if (process.env.COOKIE_ENCRYPTION_KEY) {
    // Use provided key, ensure it's the right length
    const key = Buffer.from(process.env.COOKIE_ENCRYPTION_KEY, 'hex');
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
    }
    return key;
  }
  
  // Generate a new key (should be stored securely in production)
  console.warn('⚠️  No COOKIE_ENCRYPTION_KEY found, generating temporary key. This should be set in production!');
  return crypto.randomBytes(KEY_LENGTH);
}

const ENCRYPTION_KEY = getEncryptionKey();

/**
 * Encrypt cookie data with AES-256-GCM
 * @param {Object|Array} cookieData - Cookie data to encrypt
 * @returns {Object} Encrypted data with IV and auth tag
 */
function encryptCookies(cookieData) {
  try {
    if (!cookieData) {
      throw new Error('Cookie data is required');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);

    const jsonString = JSON.stringify(cookieData);
    let encrypted = cipher.update(jsonString, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      algorithm: 'aes-256-cbc',
      version: '1.0'
    };
  } catch (error) {
    console.error('❌ Cookie encryption failed:', error);
    throw new Error('Failed to encrypt cookies: ' + error.message);
  }
}

/**
 * Decrypt cookie data
 * @param {Object} encryptedData - Encrypted cookie data
 * @returns {Object|Array} Decrypted cookie data
 */
function decryptCookies(encryptedData) {
  try {
    if (!encryptedData || !encryptedData.encrypted) {
      throw new Error('Invalid encrypted data format');
    }

    const { encrypted, iv, algorithm = 'aes-256-cbc' } = encryptedData;

    if (algorithm !== 'aes-256-cbc') {
      throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
    }

    const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, Buffer.from(iv, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('❌ Cookie decryption failed:', error);
    throw new Error('Failed to decrypt cookies: ' + error.message);
  }
}

/**
 * Validate cookie data structure
 * @param {Array} cookies - Array of cookie objects
 * @returns {boolean} True if valid
 */
function validateCookieStructure(cookies) {
  if (!Array.isArray(cookies)) {
    return false;
  }

  return cookies.every(cookie => {
    return (
      typeof cookie === 'object' &&
      typeof cookie.name === 'string' &&
      typeof cookie.value === 'string' &&
      typeof cookie.domain === 'string'
    );
  });
}

/**
 * Extract LinkedIn-specific cookies
 * @param {Array} cookies - All cookies
 * @returns {Array} LinkedIn cookies only
 */
function extractLinkedInCookies(cookies) {
  if (!Array.isArray(cookies)) {
    return [];
  }

  return cookies.filter(cookie => {
    return cookie.domain && (
      cookie.domain.includes('linkedin.com') ||
      cookie.domain.includes('.linkedin.com')
    );
  });
}

/**
 * Get essential LinkedIn cookies for authentication
 * @param {Array} cookies - LinkedIn cookies
 * @returns {Object} Essential cookies object
 */
function getEssentialCookies(cookies) {
  const essential = {};
  const essentialNames = ['li_at', 'JSESSIONID', 'li_rm', 'liap', 'li_mc'];

  cookies.forEach(cookie => {
    if (essentialNames.includes(cookie.name)) {
      essential[cookie.name] = cookie.value;
    }
  });

  return essential;
}

/**
 * Check if cookies are expired or about to expire
 * @param {Array} cookies - Cookie array
 * @returns {Object} Expiration status
 */
function checkCookieExpiration(cookies) {
  const now = Date.now() / 1000; // Convert to seconds
  const warningThreshold = 24 * 60 * 60; // 24 hours in seconds

  let expired = 0;
  let expiringSoon = 0;
  let total = 0;

  cookies.forEach(cookie => {
    if (cookie.expirationDate) {
      total++;
      if (cookie.expirationDate <= now) {
        expired++;
      } else if (cookie.expirationDate <= now + warningThreshold) {
        expiringSoon++;
      }
    }
  });

  return {
    total,
    expired,
    expiringSoon,
    hasExpired: expired > 0,
    needsRefresh: expired > 0 || expiringSoon > 0
  };
}

/**
 * Generate cookie fingerprint for change detection
 * @param {Array} cookies - Cookie array
 * @returns {string} SHA-256 hash of essential cookie values
 */
function generateCookieFingerprint(cookies) {
  const essential = getEssentialCookies(cookies);
  const sortedKeys = Object.keys(essential).sort();
  const fingerprintData = sortedKeys.map(key => `${key}=${essential[key]}`).join('|');
  
  return crypto.createHash('sha256').update(fingerprintData).digest('hex');
}

module.exports = {
  encryptCookies,
  decryptCookies,
  validateCookieStructure,
  extractLinkedInCookies,
  getEssentialCookies,
  checkCookieExpiration,
  generateCookieFingerprint,
  ALGORITHM,
  KEY_LENGTH
};