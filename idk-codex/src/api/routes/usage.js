/**
 * Usage Tracking & Rate Limiting (Feature #19)
 *
 * Tracks per-user API usage (LLM calls, tokens, tool calls, files created).
 * Enforces rate limits based on subscription tier.
 *
 * GET  /api/usage                — get current usage stats
 * GET  /api/usage/limits         — get rate limits for current tier
 * POST /api/usage/reset          — reset usage (admin only)
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

// Rate limit tiers (requests per hour / day)
export const TIERS = {
  free: { requestsPerHour: 30, requestsPerDay: 200, maxIterations: 8, maxFilesPerDay: 20 },
  pro: { requestsPerHour: 200, requestsPerDay: 2000, maxIterations: 20, maxFilesPerDay: 200 },
  team: { requestsPerHour: 1000, requestsPerDay: 10000, maxIterations: 30, maxFilesPerDay: 1000 },
  enterprise: { requestsPerHour: 10000, requestsPerDay: 100000, maxIterations: 50, maxFilesPerDay: 10000 }
};

/**
 * Get user's current tier (default: free)
 */
function getUserTier(userId) {
  try {
    const db = getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_subscriptions (
      user_id TEXT PRIMARY KEY,
      tier TEXT DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_end TEXT,
      status TEXT DEFAULT 'active',
      updated_at TEXT
    )`).run();
    const row = db.prepare('SELECT tier FROM max_subscriptions WHERE user_id = ?').get(userId);
    return row?.tier || 'free';
  } catch (e) {
    return 'free';
  }
}

/**
 * Track a usage event (LLM call, tool call, file write, etc.)
 */
export function trackUsage(userId, eventType, metadata = {}) {
  try {
    const db = getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event_type TEXT,
      metadata TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('INSERT INTO max_usage_events (user_id, event_type, metadata) VALUES (?, ?, ?)').run(
      userId, eventType, JSON.stringify(metadata)
    );
  } catch (e) {
    logger.warn('Usage tracking failed', { error: e.message });
  }
}

/**
 * Get usage stats for the current period (hour, day, month).
 */
export function getUsageStats(userId) {
  try {
    const db = getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event_type TEXT,
      metadata TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )`).run();

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const hourlyCount = db.prepare('SELECT COUNT(*) as n FROM max_usage_events WHERE user_id = ? AND timestamp >= ?').get(userId, hourAgo)?.n || 0;
    const dailyCount = db.prepare('SELECT COUNT(*) as n FROM max_usage_events WHERE user_id = ? AND timestamp >= ?').get(userId, dayAgo)?.n || 0;
    const monthlyCount = db.prepare('SELECT COUNT(*) as n FROM max_usage_events WHERE user_id = ? AND timestamp >= ?').get(userId, monthAgo)?.n || 0;

    // Breakdown by event type
    const breakdown = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM max_usage_events
      WHERE user_id = ? AND timestamp >= ?
      GROUP BY event_type
    `).all(userId, dayAgo);

    return {
      hourlyCount,
      dailyCount,
      monthlyCount,
      breakdown: breakdown.reduce((acc, r) => ({ ...acc, [r.event_type]: r.count }), {})
    };
  } catch (e) {
    return { hourlyCount: 0, dailyCount: 0, monthlyCount: 0, breakdown: {} };
  }
}

/**
 * Check if user has hit their rate limit.
 * Returns { allowed, reason, tier, used, limit }
 */
export function checkRateLimit(userId) {
  const tier = getUserTier(userId);
  const limits = TIERS[tier] || TIERS.free;
  const stats = getUsageStats(userId);

  if (stats.hourlyCount >= limits.requestsPerHour) {
    return { allowed: false, reason: `Hourly limit reached (${stats.hourlyCount}/${limits.requestsPerHour})`, tier, used: stats.hourlyCount, limit: limits.requestsPerHour, period: 'hour' };
  }
  if (stats.dailyCount >= limits.requestsPerDay) {
    return { allowed: false, reason: `Daily limit reached (${stats.dailyCount}/${limits.requestsPerDay})`, tier, used: stats.dailyCount, limit: limits.requestsPerDay, period: 'day' };
  }
  return { allowed: true, tier, used: stats.dailyCount, limit: limits.requestsPerDay };
}

// ============================================================================
// ROUTES
// ============================================================================

router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const stats = getUsageStats(userId);
    const tier = getUserTier(userId);
    const limits = TIERS[tier] || TIERS.free;
    res.json({ success: true, stats, tier, limits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/limits', (req, res) => {
  try {
    const userId = req.user.id;
    const tier = getUserTier(userId);
    res.json({ success: true, tier, limits: TIERS[tier] || TIERS.free, allTiers: TIERS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
export { getUserTier };
