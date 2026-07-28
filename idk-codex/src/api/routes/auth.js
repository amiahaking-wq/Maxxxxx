/**
 * Auth API Routes
 * POST /api/auth/signup   — create account
 * POST /api/auth/login    — sign in with password
 * POST /api/auth/magic    — send magic link
 * GET  /api/auth/validate — validate current token
 * POST /api/auth/logout   — sign out
 */

import express from 'express';
import { validateToken } from '../../auth/middleware.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

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
      body: JSON.stringify({
        email, password,
        data: { name: name || email.split('@')[0] }
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      logger.error('AUTH_SIGNUP_FAILED', {
        status: resp.status,
        error: data.message || data.msg || data.error || 'Unknown error',
        raw: JSON.stringify(data).substring(0, 500)
      });
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
    logger.error('AUTH_LOGIN_NO_SUPABASE', { hasUrl: !!SUPABASE_URL, hasAnonKey: !!SUPABASE_ANON_KEY });
    return res.status(500).json({ error: 'Auth not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Railway.' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();

    if (!resp.ok) {
      logger.error('AUTH_LOGIN_FAILED', {
        status: resp.status,
        error: data.message || data.msg || data.error || 'Unknown error',
        raw: JSON.stringify(data).substring(0, 500)
      });
      return res.status(401).json({ error: data.message || data.msg || data.error_description || 'Login failed' });
    }

    logger.info('AUTH_LOGIN_SUCCESS', { email, userId: data.user?.id });
    res.json({
      user: data.user,
      token: data.access_token,
      session: data
    });
  } catch (e) {
    logger.error('AUTH_LOGIN_ERROR', { error: e.message, stack: e.stack?.substring(0, 300) });
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/magic — send magic link
 */
router.post('/magic', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  logger.info('AUTH_MAGIC_ATTEMPT', { email });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    logger.error('AUTH_MAGIC_NO_SUPABASE', { hasUrl: !!SUPABASE_URL, hasAnonKey: !!SUPABASE_ANON_KEY });
    return res.status(500).json({ error: 'Auth not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Railway.' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        email,
        create_user: true,
        options: {
          emailRedirectTo: process.env.FRONTEND_URL || 'https://maxxxxx-production.up.railway.app'
        }
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      logger.error('AUTH_MAGIC_FAILED', {
        status: resp.status,
        error: data.message || data.msg || data.error || 'Unknown error',
        raw: JSON.stringify(data).substring(0, 500)
      });
      return res.status(400).json({ error: data.message || data.msg || data.error_description || 'Magic link failed' });
    }

    logger.info('AUTH_MAGIC_SUCCESS', { email });
    res.json({ message: 'Magic link sent to ' + email });
  } catch (e) {
    logger.error('AUTH_MAGIC_ERROR', { error: e.message, stack: e.stack?.substring(0, 300) });
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/auth/validate — validate current token
 */
router.get('/validate', async (req, res) => {
  const authHeader = req.headers.authorization;

  // If no Supabase configured, allow as dev user
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.json({ valid: true, user: { id: 'web_user', email: null, name: 'Developer' } });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ valid: false });
  }

  const token = authHeader.replace('Bearer ', '');
  const user = await validateToken(token);

  if (!user) {
    return res.json({ valid: false });
  }

  res.json({ valid: true, user });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  logger.info('AUTH_LOGOUT');
  res.json({ success: true, message: 'Logged out' });
});

export default router;
