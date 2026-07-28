/**
 * Auth Middleware — Supabase JWT validation
 *
 * requireAuth: blocks request if no valid token
 * optionalAuth: identifies user if token present, otherwise anonymous
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

/**
 * Validate a JWT token against Supabase Auth.
 * Returns { id, email, name } or null.
 */
async function validateToken(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY
      }
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    if (!user || !user.id) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || (user.email ? user.email.split('@')[0] : 'User')
    };
  } catch (e) {
    return null;
  }
}

/**
 * Require authentication — blocks request if no valid token.
 * Falls back to anonymous if Supabase not configured (dev mode).
 */
export async function requireAuth(req, res, next) {
  // If Supabase auth not configured, allow all (dev mode)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    req.user = { id: 'web_user', email: null, name: 'Developer' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated', code: 'NO_TOKEN' });
  }

  const token = authHeader.replace('Bearer ', '');
  const user = await validateToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session', code: 'INVALID_TOKEN' });
  }

  req.user = user;
  next();
}

/**
 * Optional auth — identifies user if token present, otherwise anonymous.
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const user = await validateToken(token);
    if (user) {
      req.user = user;
      return next();
    }
  }
  // Anonymous fallback
  req.user = {
    id: req.headers['x-session-id'] || 'web_user',
    email: null,
    name: 'Guest'
  };
  next();
}

export { validateToken };
export default { requireAuth, optionalAuth, validateToken };
