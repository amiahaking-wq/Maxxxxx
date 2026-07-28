/**
 * Auth API Routes
 * POST /api/auth/signup   — create account
 * POST /api/auth/login    — sign in with password
 * POST /api/auth/magic    — send magic link
 * GET  /api/auth/validate — validate current token
 * POST /api/auth/logout   — sign out
 * POST /api/auth/link-telegram   — generate linking code
 * GET  /api/auth/telegram-status — check link status
 * POST /api/auth/unlink-telegram — remove link
 */

import express from 'express';
import { validateToken } from '../../auth/middleware.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

/**
 * Call Supabase REST API (with service role key for admin access).
 */
async function supabaseAdmin(path, method = 'GET', body = null) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
  if (method === 'POST') headers['Prefer'] = 'return=representation';

  const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!resp.ok) {
    const text = await resp.text();
    logger.warn('Supabase admin call failed', { path, status: resp.status, error: text.substring(0, 200) });
    return null;
  }
  if (resp.status === 204) return [];
  return resp.json();
}

/**
 * POST /api/auth/signup
 */
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  logger.info('AUTH_SIGNUP_ATTEMPT', { email, hasName: !!name });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    logger.error('AUTH_SIGNUP_NO_SUPABASE', { hasUrl: !!SUPABASE_URL, hasAnonKey: !!SUPABASE_ANON_KEY });
    return res.status(500).json({ error: 'Auth not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Railway.' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password, data: { name: name || email.split('@')[0] } })
    });
    const data = await resp.json();
    if (!resp.ok) {
      logger.error('AUTH_SIGNUP_FAILED', { status: resp.status, error: data.message || data.msg || data.error || 'Unknown error', raw: JSON.stringify(data).substring(0, 500) });
      return res.status(400).json({ error: data.message || data.msg || data.error_description || 'Signup failed' });
    }
    logger.info('AUTH_SIGNUP_SUCCESS', { email, userId: data.user?.id });
    res.json({ user: data.user, session: data.session, message: 'Check your email to confirm your account' });
  } catch (e) {
    logger.error('AUTH_SIGNUP_ERROR', { error: e.message, stack: e.stack?.substring(0, 300) });
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  logger.info('AUTH_LOGIN_ATTEMPT', { email });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Auth not configured' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok) {
      logger.error('AUTH_LOGIN_FAILED', { status: resp.status, error: data.message || data.msg || data.error || 'Unknown error' });
      return res.status(401).json({ error: data.message || data.msg || data.error_description || 'Login failed' });
    }
    logger.info('AUTH_LOGIN_SUCCESS', { email, userId: data.user?.id });
    res.json({ user: data.user, token: data.access_token, session: data });
  } catch (e) {
    logger.error('AUTH_LOGIN_ERROR', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/magic
 */
router.post('/magic', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  logger.info('AUTH_MAGIC_ATTEMPT', { email });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Auth not configured' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, create_user: true, options: { emailRedirectTo: process.env.FRONTEND_URL || 'https://maxxxxx-production.up.railway.app' } })
    });
    const data = await resp.json();
    if (!resp.ok) {
      logger.error('AUTH_MAGIC_FAILED', { status: resp.status, error: data.message || data.msg || 'Unknown error' });
      return res.status(400).json({ error: data.message || data.msg || 'Magic link failed' });
    }
    logger.info('AUTH_MAGIC_SUCCESS', { email });
    res.json({ message: 'Magic link sent to ' + email });
  } catch (e) {
    logger.error('AUTH_MAGIC_ERROR', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/auth/validate
 */
router.get('/validate', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.json({ valid: true, user: { id: 'web_user', email: null, name: 'Developer' } });
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ valid: false });
  }
  const token = authHeader.replace('Bearer ', '');
  const user = await validateToken(token);
  if (!user) return res.json({ valid: false });
  res.json({ valid: true, user });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  logger.info('AUTH_LOGOUT');
  res.json({ success: true, message: 'Logged out' });
});

// ============================================================================
// TELEGRAM ACCOUNT LINKING — STORED IN SUPABASE (persists across deploys)
// ============================================================================

/**
 * POST /api/auth/link-telegram
 * Generates a linking code stored in Supabase.
 */
router.post('/link-telegram', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });

    const token = authHeader.replace('Bearer ', '');
    const user = await validateToken(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Delete old codes for this user, then insert new one (in Supabase)
    await supabaseAdmin(`/max_telegram_codes?user_id=eq.${encodeURIComponent(user.id)}`, 'DELETE');
    await supabaseAdmin('/max_telegram_codes', 'POST', {
      code, user_id: user.id, expires_at: expiresAt, used: false
    });

    logger.info('TELEGRAM_LINK_CODE_GENERATED', { userId: user.id, code });
    res.json({ code, instructions: `Send this code to @Maxxxxclaww_bot on Telegram: ${code}`, expiresAt });
  } catch (e) {
    logger.error('TELEGRAM_LINK_CODE_ERROR', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/auth/telegram-status
 * Check if the user's Telegram account is linked (from Supabase).
 */
router.get('/telegram-status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });

    const token = authHeader.replace('Bearer ', '');
    const user = await validateToken(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    // Query Supabase for the link
    const links = await supabaseAdmin(`/max_telegram_links?user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const link = links && links.length > 0 ? links[0] : null;

    res.json({
      linked: !!link,
      telegramUsername: link?.telegram_username || null,
      linkedAt: link?.linked_at || null
    });
  } catch (e) {
    res.json({ linked: false });
  }
});

/**
 * POST /api/auth/unlink-telegram
 */
router.post('/unlink-telegram', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });

    const token = authHeader.replace('Bearer ', '');
    const user = await validateToken(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    await supabaseAdmin(`/max_telegram_links?user_id=eq.${encodeURIComponent(user.id)}`, 'DELETE');
    logger.info('TELEGRAM_UNLINKED', { userId: user.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Export supabaseAdmin for use in telegram-handler.js
 */
export { supabaseAdmin };

export default router;
