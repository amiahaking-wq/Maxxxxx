/**
 * Vault-to-Env Bridge
 *
 * Loads credentials from the encrypted vault and exposes them as
 * process.env.* values IN-MEMORY (not persisted). This means users can save
 * their GitHub token / OpenAI key / Gmail OAuth credentials through the
 * Settings UI, and the agent + connectors will use them at runtime without
 * needing to set Railway env vars.
 *
 * Process:
 *   1. Before any agent task runs, call syncVaultToEnv(userId)
 *   2. This reads all credentials for the user from the vault
 *   3. Unpacks them and sets the corresponding process.env.* keys
 *   4. Connectors and tools that read process.env.GITHUB_TOKEN etc. now work
 *
 * Security: credentials are decrypted in memory only for the duration of the
 * request. They are NEVER written to logs or persisted outside the vault.
 */

import { credentialVault } from '../security/credential-vault.js';
import logger from '../utils/logger.js';

/**
 * Map of vault service_name → process.env key(s) to set.
 * For services with multiple fields (e.g. Gmail: client_id, client_secret, refresh_token),
 * each field maps to a specific env var.
 */
const VAULT_ENV_MAP = {
  github: { token: 'GITHUB_TOKEN' },
  openai: { api_key: 'OPENAI_API_KEY' },
  openrouter: { api_key: 'OPENROUTER_API_KEY' },
  groq: { api_key: 'GROQ_API_KEY' },
  anthropic: { api_key: 'ANTHROPIC_API_KEY' },
  google: { api_key: 'GOOGLE_GEMINI_API_KEY' },
  gmail: {
    client_id: 'GOOGLE_CLIENT_ID',
    client_secret: 'GOOGLE_CLIENT_SECRET',
    refresh_token: 'GOOGLE_REFRESH_TOKEN'
  },
  calendar: {
    client_id: 'GOOGLE_CLIENT_ID',  // shared with Gmail
    client_secret: 'GOOGLE_CLIENT_SECRET',
    refresh_token: 'GOOGLE_REFRESH_TOKEN'
  },
  drive: {
    client_id: 'GOOGLE_CLIENT_ID',  // shared with Gmail
    client_secret: 'GOOGLE_CLIENT_SECRET',
    refresh_token: 'GOOGLE_REFRESH_TOKEN'
  },
  supabase: {
    url: 'SUPABASE_URL',
    service_key: 'SUPABASE_KEY'
  }
};

/**
 * Sync vault credentials to process.env for the given user.
 * Call this before running any agent task that may use connector tools.
 *
 * @param {string} userId - the user whose credentials to load
 */
export function syncVaultToEnv(userId) {
  try {
    const list = credentialVault.list(userId);
    if (!list || list.length === 0) return;

    let synced = 0;
    for (const entry of list) {
      const serviceName = entry.service_name;
      const envMap = VAULT_ENV_MAP[serviceName];
      if (!envMap) continue;

      // Get decrypted credentials
      const creds = credentialVault.get(userId, serviceName);
      if (!creds || !creds.apiKey) continue;

      // Unpack JSON
      let fields = {};
      try {
        fields = JSON.parse(creds.apiKey);
      } catch (e) {
        fields = { api_key: creds.apiKey };
      }

      // Set each env var
      for (const [fieldKey, envKey] of Object.entries(envMap)) {
        if (fields[fieldKey]) {
          process.env[envKey] = fields[fieldKey];
          synced++;
        }
      }
    }

    if (synced > 0) {
      logger.info('Vault credentials synced to env', { userId, count: synced });
    }
  } catch (e) {
    logger.warn('Vault sync failed', { error: e.message, userId });
  }
}

export default { syncVaultToEnv, VAULT_ENV_MAP };
