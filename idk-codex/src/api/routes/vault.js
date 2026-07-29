/**
 * Vault API Routes
 *
 * Lets users save connector credentials (API keys, OAuth tokens) through the
 * web UI — encrypted at rest with AES-256-GCM, no Railway env vars needed.
 *
 * GET    /api/vault                  — list all saved services (no secrets returned)
 * POST   /api/vault                  — save a service's credentials
 * GET    /api/vault/:serviceName     — get credentials for a service (DECRYPTED — internal use only)
 * DELETE /api/vault/:serviceName     — delete a service's credentials
 *
 * Supported services (registered in CONNECTOR_INFO):
 *   - github:           { token }
 *   - openai:           { api_key }
 *   - openrouter:       { api_key }
 *   - groq:             { api_key }
 *   - anthropic:        { api_key }
 *   - google:           { api_key }
 *   - gmail:            { client_id, client_secret, refresh_token }
 *   - calendar:         { client_id, client_secret, refresh_token }
 *   - drive:            { client_id, client_secret, refresh_token }
 *   - supabase:         { url, service_key }
 *   - custom:           { name, api_key, base_url }
 *
 * After saving, these credentials become available to the agent via
 * credential_get and to connector tools that read from the vault.
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { credentialVault } from '../../security/credential-vault.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

/**
 * Map of known service definitions.
 * Each service has a list of fields (with labels + whether required)
 * that the UI renders as input fields.
 */
export const VAULT_SERVICES = {
  github: {
    name: 'GitHub',
    description: 'Personal access token for GitHub API (repo, issues, PRs).',
    docs: 'https://github.com/settings/tokens',
    fields: [
      { key: 'token', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_xxxxxxxx' }
    ]
  },
  openai: {
    name: 'OpenAI',
    description: 'OpenAI API key for GPT models.',
    docs: 'https://platform.openai.com/api-keys',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'sk-xxxx' }
    ]
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'OpenRouter API key — gives access to many free models including the default "auto" router.',
    docs: 'https://openrouter.ai/keys',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'sk-or-xxxx' }
    ]
  },
  groq: {
    name: 'Groq',
    description: 'Groq API key for ultra-fast Llama/Mixtral inference.',
    docs: 'https://console.groq.com/keys',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'gsk_xxxx' }
    ]
  },
  anthropic: {
    name: 'Anthropic',
    description: 'Anthropic API key for Claude models.',
    docs: 'https://console.anthropic.com/settings/keys',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'sk-ant-xxxx' }
    ]
  },
  google: {
    name: 'Google AI',
    description: 'Google AI Studio API key for Gemini models.',
    docs: 'https://aistudio.google.com/apikey',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'AIzaxxxx' }
    ]
  },
  gmail: {
    name: 'Gmail',
    description: 'OAuth2 credentials for Gmail API. Create at Google Cloud Console.',
    docs: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'client_id', label: 'OAuth Client ID', type: 'text', required: true, placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'OAuth Client Secret', type: 'password', required: true, placeholder: 'GOCSPX-xxxx' },
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true, placeholder: '1//xxxx' }
    ]
  },
  calendar: {
    name: 'Google Calendar',
    description: 'OAuth2 credentials for Google Calendar API (same as Gmail, with calendar scope).',
    docs: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'client_id', label: 'OAuth Client ID', type: 'text', required: true, placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'OAuth Client Secret', type: 'password', required: true, placeholder: 'GOCSPX-xxxx' },
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true, placeholder: '1//xxxx' }
    ]
  },
  drive: {
    name: 'Google Drive',
    description: 'OAuth2 credentials for Google Drive API (same as Gmail, with drive scope).',
    docs: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'client_id', label: 'OAuth Client ID', type: 'text', required: true, placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'client_secret', label: 'OAuth Client Secret', type: 'password', required: true, placeholder: 'GOCSPX-xxxx' },
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true, placeholder: '1//xxxx' }
    ]
  },
  supabase: {
    name: 'Supabase',
    description: 'Supabase project URL + service_role key for database access.',
    docs: 'https://supabase.com/dashboard/project/_/settings/api',
    fields: [
      { key: 'url', label: 'Project URL', type: 'text', required: true, placeholder: 'https://xxxx.supabase.co' },
      { key: 'service_key', label: 'Service Role Key', type: 'password', required: true, placeholder: 'eyJxxxx' }
    ]
  }
};

/**
 * GET /api/vault/services — list all known service definitions (no secrets)
 * Used by the frontend Settings panel to render the connector config UI.
 */
router.get('/services', (req, res) => {
  res.json({ success: true, services: VAULT_SERVICES });
});

/**
 * GET /api/vault — list all saved credentials for the current user (no secrets).
 */
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const list = credentialVault.list(userId);
    res.json({ success: true, credentials: list });
  } catch (e) {
    logger.error('Vault list failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vault — save credentials for a service.
 * Body: { service_name, ...fields }
 * e.g. { service_name: 'github', token: 'ghp_xxxx' }
 *
 * We accept arbitrary fields and store them as encrypted JSON inside the vault.
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { service_name, ...fields } = req.body;

    if (!service_name) {
      return res.status(400).json({ error: 'service_name is required' });
    }

    // Validate: must be a known service OR allow custom names
    const knownService = VAULT_SERVICES[service_name];
    if (!knownService && !service_name.startsWith('custom_')) {
      return res.status(400).json({
        error: `Unknown service: ${service_name}. Use a known service or prefix custom ones with "custom_".`,
        knownServices: Object.keys(VAULT_SERVICES)
      });
    }

    // Validate required fields for known services
    if (knownService) {
      for (const field of knownService.fields) {
        if (field.required && !fields[field.key]) {
          return res.status(400).json({ error: `${field.label} is required` });
        }
      }
    }

    // Save with vault. We pack all fields into a single credential entry.
    // The vault stores password + api_key separately, but we want multiple
    // fields (client_id, refresh_token, etc.). So we JSON-pack everything
    // into the 'api_key' field (encrypted) and use 'username' for the service URL/identifier.
    const packedSecrets = JSON.stringify(fields);
    const username = knownService?.fields?.find(f => f.key === 'url' || f.key === 'client_id') ? fields[knownService.fields.find(f => f.key === 'url' || f.key === 'client_id').key] : null;

    credentialVault.save(userId, service_name, {
      username,
      apiKey: packedSecrets,
      notes: knownService?.description || 'Custom connector'
    });

    logger.info('Vault credentials saved', { userId, service_name });
    res.json({ success: true, message: `Credentials saved for ${service_name}` });
  } catch (e) {
    logger.error('Vault save failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vault/:serviceName — get credentials for a service (decrypted).
 * NOTE: This is for INTERNAL use only (e.g. when the agent runs a tool).
 * The frontend should never expose the secrets — only the existence of them.
 */
router.get('/:serviceName', (req, res) => {
  try {
    const userId = req.user.id;
    const creds = credentialVault.get(userId, req.params.serviceName);

    if (!creds) {
      return res.status(404).json({ error: 'No credentials saved for this service' });
    }

    // Unpack the JSON
    let fields = {};
    try {
      fields = JSON.parse(creds.apiKey || '{}');
    } catch (e) {
      fields = { api_key: creds.apiKey };
    }

    res.json({
      success: true,
      service_name: creds.service_name,
      username: creds.username,
      fields,
      notes: creds.notes
    });
  } catch (e) {
    logger.error('Vault get failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/vault/:serviceName — delete credentials for a service.
 */
router.delete('/:serviceName', (req, res) => {
  try {
    const userId = req.user.id;
    const result = credentialVault.delete(userId, req.params.serviceName);
    res.json({ success: true, message: result });
  } catch (e) {
    logger.error('Vault delete failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

export default router;
