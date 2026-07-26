/**
 * Connectors API Routes
 * GET    /api/connectors        — list all connectors and their status
 * POST   /api/connectors/test   — test a specific connector by name
 * GET    /api/connectors/:name/tools — list tools exposed by a connector
 */

import express from 'express';
import { listConnectors, initializeConnectors, getConnector } from '../../agent/connectors.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Initialize connectors on first load
try { initializeConnectors(); } catch (e) { logger.warn('Connector init failed', { error: e.message }); }

/**
 * GET /api/connectors — list all connectors with status + available tools
 */
router.get('/', (req, res) => {
  try {
    const connectors = listConnectors();
    res.json({ success: true, connectors });
  } catch (err) {
    logger.error('Failed to list connectors', { error: err.message });
    res.status(500).json({ error: 'Failed to list connectors' });
  }
});

/**
 * GET /api/connectors/details — list with tool definitions + env requirements
 * Used by the frontend Settings drawer to show what each connector needs.
 */
router.get('/details', (req, res) => {
  try {
    const CONNECTOR_INFO = {
      github: {
        name: 'GitHub',
        description: 'Create issues, list PRs, search code, get files from any GitHub repo.',
        icon: 'github',
        requiredEnv: ['GITHUB_TOKEN'],
        envHelp: {
          GITHUB_TOKEN: 'Create at https://github.com/settings/tokens (needs repo + issues scopes)'
        },
        docs: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens'
      },
      supabase: {
        name: 'Supabase',
        description: 'Query, insert, and update rows in your Supabase database. The agent can read/write any table.',
        icon: 'database',
        requiredEnv: ['SUPABASE_URL', 'SUPABASE_KEY'],
        envHelp: {
          SUPABASE_URL: 'Found in your Supabase project settings → API → Project URL',
          SUPABASE_KEY: 'Found in Supabase → Settings → API → service_role key (keep secret!)'
        },
        docs: 'https://supabase.com/dashboard/project/_/settings/api'
      },
      gmail: {
        name: 'Gmail',
        description: 'Search inbox and send emails on your behalf.',
        icon: 'mail',
        requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
        envHelp: {
          GOOGLE_CLIENT_ID: 'Create OAuth2 credentials at https://console.cloud.google.com/apis/credentials',
          GOOGLE_CLIENT_SECRET: 'OAuth2 client secret from Google Cloud Console',
          GOOGLE_REFRESH_TOKEN: 'Get via OAuth2 flow (Gmail scope)'
        },
        docs: 'https://developers.google.com/gmail/api/auth/oauth'
      },
      calendar: {
        name: 'Google Calendar',
        description: 'List upcoming events and create new ones.',
        icon: 'calendar',
        requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
        envHelp: {
          GOOGLE_CLIENT_ID: 'Same OAuth2 credentials as Gmail (Calendar scope)',
          GOOGLE_CLIENT_SECRET: 'Same as Gmail',
          GOOGLE_REFRESH_TOKEN: 'Same as Gmail (with calendar.events scope)'
        },
        docs: 'https://developers.google.com/calendar/api'
      },
      drive: {
        name: 'Google Drive',
        description: 'Search files and create Google Docs.',
        icon: 'folder',
        requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
        envHelp: {
          GOOGLE_CLIENT_ID: 'Same OAuth2 credentials (Drive scope)',
          GOOGLE_CLIENT_SECRET: 'Same as Gmail',
          GOOGLE_REFRESH_TOKEN: 'Same as Gmail (with drive.file scope)'
        },
        docs: 'https://developers.google.com/drive/api'
      }
    };

    const connectors = listConnectors().map(c => ({
      ...c,
      info: CONNECTOR_INFO[c.name] || null,
      // Don't expose actual env values, just whether they're set
      envStatus: (CONNECTOR_INFO[c.name]?.requiredEnv || []).reduce((acc, key) => {
        acc[key] = !!process.env[key];
        return acc;
      }, {})
    }));

    res.json({ success: true, connectors });
  } catch (err) {
    logger.error('Failed to list connector details', { error: err.message });
    res.status(500).json({ error: 'Failed to list connector details' });
  }
});

/**
 * POST /api/connectors/test — test a connector by name
 * Body: { name: 'github' | 'supabase' | ... }
 */
router.post('/test', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const connector = getConnector(name);
    if (!connector) return res.status(404).json({ error: `Connector '${name}' not found` });

    const connected = connector.isConnected();
    const tools = connector.getTools ? connector.getTools().map(t => t.name) : [];

    res.json({
      success: true,
      name,
      connected,
      tools,
      message: connected
        ? `${name} is connected and ready. ${tools.length} tool(s) available.`
        : `${name} is not connected. Set the required environment variables.`
    });
  } catch (err) {
    logger.error('Connector test failed', { error: err.message });
    res.status(500).json({ error: 'Test failed: ' + err.message });
  }
});

/**
 * GET /api/connectors/:name/tools — list tools exposed by a connector
 */
router.get('/:name/tools', (req, res) => {
  try {
    const connector = getConnector(req.params.name);
    if (!connector) return res.status(404).json({ error: 'Connector not found' });

    const tools = connector.getTools ? connector.getTools().map(t => ({
      name: t.name,
      description: t.description,
      params: t.params
    })) : [];

    res.json({ success: true, connected: connector.isConnected(), tools });
  } catch (err) {
    logger.error('Failed to list connector tools', { error: err.message });
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

export default router;
