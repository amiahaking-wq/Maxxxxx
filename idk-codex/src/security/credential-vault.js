/**
 * Credential Vault — Stage 6D
 *
 * AES-256-GCM encrypted storage for user credentials.
 * MAX never sees raw passwords — they're only decrypted at the moment of use
 * and never written to logs, chat history, or audit trails.
 *
 * The encryption key comes from MAX_VAULT_KEY env var.
 * If not set, a random key is generated at startup (WARNING: credentials
 * won't survive restarts — set MAX_VAULT_KEY in Railway for production).
 */

import crypto from 'crypto';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

// ============================================================================
// ENCRYPTION KEY
// ============================================================================

// Use env var if set. Otherwise generate a random one (with a warning).
const VAULT_KEY_HEX = process.env.MAX_VAULT_KEY;

let _vaultKey = null;
let _keyWarningLogged = false;

function getVaultKey() {
  if (_vaultKey) return _vaultKey;

  if (VAULT_KEY_HEX) {
    // User-provided key — use first 32 bytes (256 bits)
    const keyBytes = Buffer.from(VAULT_KEY_HEX, 'hex');
    if (keyBytes.length < 32) {
      logger.error('MAX_VAULT_KEY must be at least 32 bytes (64 hex chars). Generating random key.');
      _vaultKey = crypto.randomBytes(32);
    } else {
      _vaultKey = keyBytes.slice(0, 32);
    }
  } else {
    // No key set — generate random one (credentials won't survive restart)
    if (!_keyWarningLogged) {
      logger.warn('MAX_VAULT_KEY not set — using random key. Credentials will NOT survive restarts. Set MAX_VAULT_KEY in Railway for production.');
      _keyWarningLogged = true;
    }
    _vaultKey = crypto.randomBytes(32);
  }

  return _vaultKey;
}

// ============================================================================
// ENCRYPT / DECRYPT
// ============================================================================

function encrypt(text) {
  const key = getVaultKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
  const key = getVaultKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================================================
// CREDENTIAL VAULT API
// ============================================================================

export const credentialVault = {
  /**
   * Save credentials for a service. Encrypts password + API key at rest.
   * @param {string} userId
   * @param {string} serviceName - e.g. 'jumia', 'gmail', 'paystack'
   * @param {Object} credentials - { username, password, apiKey, notes }
   * @returns {string} success message
   */
  save(userId, serviceName, credentials = {}) {
    const db = getDatabase();
    const encryptedPassword = credentials.password ? encrypt(credentials.password) : null;
    const encryptedApiKey = credentials.apiKey ? encrypt(credentials.apiKey) : null;

    db.prepare(`
      INSERT INTO max_credentials
      (user_id, service_name, username, encrypted_password, encrypted_api_key, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, service_name)
      DO UPDATE SET
        username = excluded.username,
        encrypted_password = excluded.encrypted_password,
        encrypted_api_key = excluded.encrypted_api_key,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(
      userId,
      serviceName,
      credentials.username || null,
      encryptedPassword,
      encryptedApiKey,
      credentials.notes || null
    );

    logger.info('Credentials saved to vault', { userId, serviceName, hasPassword: !!encryptedPassword, hasApiKey: !!encryptedApiKey });
    return `Credentials saved securely for: ${serviceName}`;
  },

  /**
   * Retrieve decrypted credentials for a service.
   * CRITICAL: caller must NEVER log the returned password/apiKey.
   * @param {string} userId
   * @param {string} serviceName
   * @returns {Object|null} { username, password, apiKey, notes }
   */
  get(userId, serviceName) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM max_credentials
      WHERE user_id = ? AND service_name = ?
    `).get(userId, serviceName);

    if (!row) return null;

    return {
      service_name: row.service_name,
      username: row.username,
      password: row.encrypted_password ? decrypt(row.encrypted_password) : null,
      apiKey: row.encrypted_api_key ? decrypt(row.encrypted_api_key) : null,
      notes: row.notes
    };
  },

  /**
   * List all stored credentials for a user.
   * NEVER returns passwords — only service names and whether passwords exist.
   */
  list(userId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT service_name, username, notes,
             CASE WHEN encrypted_password IS NOT NULL THEN 'saved' ELSE 'none' END as password_status,
             CASE WHEN encrypted_api_key IS NOT NULL THEN 'saved' ELSE 'none' END as api_key_status,
             created_at, updated_at
      FROM max_credentials
      WHERE user_id = ?
      ORDER BY service_name
    `).all(userId);
  },

  /**
   * Delete credentials for a service.
   */
  delete(userId, serviceName) {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM max_credentials
      WHERE user_id = ? AND service_name = ?
    `).run(userId, serviceName);

    if (result.changes > 0) {
      logger.info('Credentials deleted from vault', { userId, serviceName });
      return `Credentials deleted for: ${serviceName}`;
    }
    return `No credentials found for: ${serviceName}`;
  },

  /**
   * Check if the vault key is properly configured.
   */
  isVaultKeyConfigured() {
    return !!VAULT_KEY_HEX;
  }
};

export default credentialVault;
