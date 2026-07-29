/**
 * Configuration API Routes
 * Handles system configuration, repository settings, and model preferences
 */

import express from 'express';
import logger from '../../utils/logger.js';
import { getDatabase } from '../../database/db.js';
import { getModelOptions, getAvailableModels, getModelById, isValidModel } from '../../llm/model-registry.js';
import { setProvider, setModel } from '../../llm/adapter.js';
import phoneBridge from '../../interfaces/phone-bridge.js';

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
      { name: 'Ollama', connected: !!process.env.OLLAMA_HOST, speed: 'slow' },
      { name: 'OpenAI', connected: !!process.env.OPENAI_API_KEY, speed: 'medium' },
      { name: 'OpenAI-compatible', connected: !!process.env.OPENAI_COMPATIBLE_BASE_URL, speed: 'medium' },
      { name: 'Local', connected: !!process.env.LOCAL_API_BASE_URL, speed: 'slow' },
      { name: 'Groq', connected: !!process.env.GROQ_API_KEY, speed: 'fast' },
      { name: 'Anthropic', connected: !!process.env.ANTHROPIC_API_KEY, speed: 'medium' },
      { name: 'Gemini', connected: !!process.env.GOOGLE_GEMINI_API_KEY, speed: 'medium' },
      { name: 'Phone', connected: phoneBridge.isAvailable(), speed: 'slow' }
    ];

    const config = {
      repo: prefs ? {
        owner: prefs.repo_owner,
        repo: prefs.repo_name
      } : null,
      model: prefs?.preferred_model || 'ollama',
      providers,
      telegramConnected: !!process.env.TELEGRAM_BOT_TOKEN,
      phoneConnected: phoneBridge.isAvailable()
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

    // Validate model exists by ID or display name
    const options = getModelOptions();
    const validModel = options.find(m => m.id === model || m.name === model);
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
    `).run(userId, validModel.id, new Date().toISOString());

    // === LIVE MODEL SWITCH (no context loss) ===
    // The conversation history lives in the Supabase messages table, not in
    // the adapter's in-memory state. Switching the provider/model here just
    // changes which API endpoint the NEXT completion call hits. The next
    // /api/conversations/:id/messages call will load the full conversation
    // history from Supabase and pass it to the new model — so context is
    // preserved across model switches.
    try {
      // For openai-compatible models (OpenRouter), set the env var so the
      // react-loop-v2.js direct fetch picks up the new model.
      if (validModel.provider === 'openai-compatible' && validModel.model) {
        process.env.OPENAI_COMPATIBLE_MODEL = validModel.model;
        logger.info('Switched OpenRouter model (no context loss)', {
          model: validModel.model,
          userId
        });
      } else {
        // For other providers (groq, gemini, etc.), use the adapter
        setProvider(validModel.id);
        logger.info('Switched provider (no context loss)', {
          provider: validModel.provider,
          model: validModel.model,
          userId
        });
      }
    } catch (e) {
      logger.warn('Live model switch failed (preference still saved)', { error: e.message });
    }

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
/**
 * GET /api/config/diagnostic
 * Shows which LLM provider env vars are set (for debugging)
 */
router.get('/diagnostic', async (req, res) => {
  try {
    const diagnostic = {
      providers: {
        groq: {
          envVar: 'GROQ_API_KEY',
          set: !!process.env.GROQ_API_KEY,
          keyPrefix: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.substring(0, 10) + '...' : null
        },
        gemini: {
          envVar: 'GOOGLE_GEMINI_API_KEY',
          set: !!(process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY),
          keyPrefix: (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) ? 'set' : null
        },
        anthropic: {
          envVar: 'ANTHROPIC_API_KEY',
          set: !!process.env.ANTHROPIC_API_KEY
        },
        openai: {
          envVar: 'OPENAI_API_KEY',
          set: !!process.env.OPENAI_API_KEY
        },
        openai_compatible: {
          envVars: ['OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_API_KEY', 'OPENAI_COMPATIBLE_MODEL'],
          baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || null,
          apiKeySet: !!process.env.OPENAI_COMPATIBLE_API_KEY,
          apiKeyPrefix: process.env.OPENAI_COMPATIBLE_API_KEY ? process.env.OPENAI_COMPATIBLE_API_KEY.substring(0, 10) + '...' : null,
          model: process.env.OPENAI_COMPATIBLE_MODEL || null
        },
        ollama: {
          envVar: 'OLLAMA_HOST',
          set: !!process.env.OLLAMA_HOST,
          host: process.env.OLLAMA_HOST || null
        },
        phone: {
          envVar: 'PHONE_SECRET',
          set: !!process.env.PHONE_SECRET
        },
        echo: {
          envVar: 'ECHO_PROVIDER_ENABLED',
          set: process.env.ECHO_PROVIDER_ENABLED === 'true'
        }
      },
      priority: process.env.LLM_PROVIDER_PRIORITY || 'openai-compatible,ollama,openai,groq,anthropic,gemini,phone,echo',
      supabase: {
        url: process.env.SUPABASE_URL ? 'set' : null,
        key: process.env.SUPABASE_KEY ? 'set' : null
      }
    };

    res.json({ success: true, diagnostic });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const options = getAvailableModels();

    res.json({
      models: options.map(m => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        speed: m.speed,
        speedLabel: m.speedLabel,
        description: m.description,
        bestFor: m.bestFor,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens
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
