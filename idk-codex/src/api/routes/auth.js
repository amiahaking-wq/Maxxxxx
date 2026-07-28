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
    if (!resp.ok) return res.status(400).json({ error: data.message || data.msg || 'Signup failed' });
    res.json({ user: data.user, session: data.session, message: 'Check your email to confirm your account' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(401).json({ error: data.message || data.msg || 'Login failed' });
    res.json({
      user: data.user,
      token: data.access_token,
      session: data
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/magic — send magic link
 */
router.post('/magic', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

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
    if (!resp.ok) {
      const data = await resp.json();
      return res.status(400).json({ error: data.message || 'Magic link failed' });
    }
    res.json({ message: 'Magic link sent to ' + email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/auth/validate — validate current token
 */
router.get('/validate', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // If Supabase not configured, allow as dev user
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.json({ valid: true, user: { id: 'web_user', email: null, name: 'Developer' } });
    }
    return res.json({ valid: false });
  }

  const token = authHeader.replace('Bearer ', '');
  const user = await validateToken(token);

  if (!user) {
    // If Supabase not configured, allow as dev user
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.json({ valid: true, user: { id: 'web_user', email: null, name: 'Developer' } });
    }
    return res.json({ valid: false });
  }

  res.json({ valid: true, user });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  // Client-side just clears the token — Supabase JWTs are stateless
  res.json({ success: true, message: 'Logged out' });
});

export default router;
