/**
 * Crypto utilities for secure cookie transmission
 * Uses Web Crypto API for client-side encryption
 */

class CookieEncryption {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
  }

  /**
   * Generate a random encryption key
   */
  async generateKey() {
    return await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Export key to raw format
   */
  async exportKey(key) {
    const exported = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(exported));
  }

  /**
   * Import key from raw format
   */
  async importKey(keyData) {
    return await crypto.subtle.importKey(
      'raw',
      new Uint8Array(keyData),
      { name: this.algorithm },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt cookie data
   */
  async encryptCookies(cookieString, key) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(cookieString);
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv,
        },
        key,
        data
      );

      return {
        encrypted: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
        algorithm: this.algorithm
      };
    } catch (error) {
      console.error('❌ Cookie encryption error:', error);
      throw new Error('Failed to encrypt cookies');
    }
  }

  /**
   * Decrypt cookie data
   */
  async decryptCookies(encryptedData, key) {
    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: new Uint8Array(encryptedData.iv),
        },
        key,
        new Uint8Array(encryptedData.encrypted)
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('❌ Cookie decryption error:', error);
      throw new Error('Failed to decrypt cookies');
    }
  }

  /**
   * Generate session-specific encryption key
   */
  async generateSessionKey() {
    const key = await this.generateKey();
    const keyData = await this.exportKey(key);
    
    // Store key in session storage (cleared when browser closes)
    await chrome.storage.session.set({
      encryptionKey: keyData,
      keyGenerated: Date.now()
    });
    
    return key;
  }

  /**
   * Get or create session encryption key
   */
  async getSessionKey() {
    try {
      const stored = await chrome.storage.session.get(['encryptionKey', 'keyGenerated']);
      
      if (stored.encryptionKey && stored.keyGenerated) {
        // Check if key is less than 24 hours old
        const keyAge = Date.now() - stored.keyGenerated;
        if (keyAge < 24 * 60 * 60 * 1000) {
          return await this.importKey(stored.encryptionKey);
        }
      }
      
      // Generate new key if none exists or expired
      return await this.generateSessionKey();
    } catch (error) {
      console.error('❌ Error getting session key:', error);
      return await this.generateSessionKey();
    }
  }

  /**
   * Encrypt cookies for secure transmission
   */
  async encryptForTransmission(cookieString) {
    const key = await this.getSessionKey();
    const encrypted = await this.encryptCookies(cookieString, key);
    
    return {
      ...encrypted,
      timestamp: Date.now(),
      version: '1.0'
    };
  }
}

// Export singleton instance
const cookieEncryption = new CookieEncryption();

// Make available globally in extension context
if (typeof window !== 'undefined') {
  window.CookieEncryption = cookieEncryption;
} else if (typeof self !== 'undefined') {
  self.CookieEncryption = cookieEncryption;
}