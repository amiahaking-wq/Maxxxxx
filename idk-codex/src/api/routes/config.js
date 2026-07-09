/**
 * Configuration API Routes
 * Handles system configuration, repository settings, and model preferences
 */

import express from 'express';
import logger from '../../utils/logger.js';
import { getDatabase } from '../../database/db.js';
import { MODEL_OPTIONS } from '../../llm/model-registry.js';

const router = express.Router();

/**
 * GET /api/config
 * Get current system configuration
 */
router.get('/', async (req, res) => {
  try {
    const { userId = 'default-user' } = req.query;

    logger.info('API', {
      method: 'GET',
      path: '/api/config',
      userId
    });

    const db = getDatabase();

    // Get user preferences
    const prefs = db.prepare(`
      SELECT repo_owner, repo_name, preferred_model
      FROM user_preferences
      WHERE user_id = ?
    `).get(userId);

    // Get provider status from environment
    const providers = [
      {
        name: 'Groq',
        connected: !!process.env.GROQ_API_KEY,
        speed: 'fast'
      },
      {
        name: 'Anthropic',
        connected: !!process.env.ANTHROPIC_API_KEY,
        speed: 'medium'
      },
      {
        name: 'Phone',
        connected: !!process.env.PHONE_BRIDGE_ENABLED,
        speed: 'slow'
      }
    ];

    const config = {
      repo: prefs ? {
        owner: prefs.repo_owner,
        repo: prefs.repo_name
      } : null,
      model: prefs?.preferred_model || 'groq-llama-70b',
      providers,
      telegramConnected: !!process.env.TELEGRAM_BOT_TOKEN,
      phoneConnected: !!process.env.PHONE_BRIDGE_ENABLED
    };

    logger.info('API', {
      method: 'GET',
      path: '/api/config',
      status: 200
    });

    res.json(config);

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'GET',
      path: '/api/config',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to retrieve configuration',
      code: 'CONFIG_FETCH_ERROR'
    });
  }
});

/**
 * POST /api/config/repo
 * Update repository configuration
 */
router.post('/repo', async (req, res) => {
  try {
    const { owner, repo, userId = 'default-user' } = req.body;

    logger.info('API', {
      method: 'POST',
      path: '/api/config/repo',
      body: { owner, repo, userId }
    });

    // Validate required fields
    if (!owner || !repo) {
      return res.status(400).json({
        error: 'owner and repo are required',
        code: 'MISSING_FIELDS'
      });
    }

    const db = getDatabase();

    // Upsert user preferences
    db.prepare(`
      INSERT INTO user_preferences (user_id, repo_owner, repo_name, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        repo_owner = excluded.repo_owner,
        repo_name = excluded.repo_name,
        updated_at = excluded.updated_at
    `).run(userId, owner, repo, new Date().toISOString());

    logger.info('API', {
      method: 'POST',
      path: '/api/config/repo',
      status: 200
    });

    res.json({
      success: true,
      repo: { owner, repo }
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'POST',
      path: '/api/config/repo',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to update repository configuration',
      code: 'CONFIG_UPDATE_ERROR'
    });
  }
});

/**
 * POST /api/config/model
 * Update preferred model
 */
router.post('/model', async (req, res) => {
  try {
    const { model, provider, userId = 'default-user' } = req.body;

    logger.info('API', {
      method: 'POST',
      path: '/api/config/model',
      body: { model, provider, userId }
    });

    // Validate model exists
    const validModel = MODEL_OPTIONS.find(m => m.id === model);
    if (!validModel) {
      return res.status(400).json({
        error: 'Invalid model ID',
        code: 'INVALID_MODEL'
      });
    }

    const db = getDatabase();

    // Upsert user preferences
    db.prepare(`
      INSERT INTO user_preferences (user_id, preferred_model, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        preferred_model = excluded.preferred_model,
        updated_at = excluded.updated_at
    `).run(userId, model, new Date().toISOString());

    logger.info('API', {
      method: 'POST',
      path: '/api/config/model',
      status: 200,
      model: validModel.name
    });

    res.json({
      success: true,
      model: {
        id: validModel.id,
        name: validModel.name,
        provider: validModel.provider
      }
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'POST',
      path: '/api/config/model',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to update model preference',
      code: 'MODEL_UPDATE_ERROR'
    });
  }
});

/**
 * GET /api/config/models
 * List all available models
 */
router.get('/models', async (req, res) => {
  try {
    logger.info('API', {
      method: 'GET',
      path: '/api/config/models'
    });

    res.json({
      models: MODEL_OPTIONS.map(m => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        speed: m.speed,
        speedLabel: m.speedLabel,
        description: m.description,
        bestFor: m.bestFor
      }))
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'GET',
      path: '/api/config/models',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to retrieve models',
      code: 'MODELS_FETCH_ERROR'
    });
  }
});

export default router;
