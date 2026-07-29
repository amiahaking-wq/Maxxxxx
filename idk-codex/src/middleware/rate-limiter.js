/**
 * Rate Limiter Middleware (Phase 4)
 *
 * Uses Upstash Redis (free tier: 10k commands/day) for distributed rate
 * limiting. Falls back gracefully to in-memory tracking if Redis is not
 * configured (so dev environments work without Redis).
 *
 * Tiers:
 *   free:    50 tasks/day, 15 tasks/hour
 *   starter: 200 tasks/day, 50 tasks/hour
 *   pro:     1000 tasks/day, 200 tasks/hour
 *
 * Usage:
 *   import { rateLimiter } from '../middleware/rate-limiter.js';
 *   app.use('/api/conversations/:id/messages', rateLimiter);
 */

import logger from '../utils/logger.js';

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
    logger.info('Upstash Redis rate limiter initialized');
  } else {
    logger.warn('UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiter using in-memory fallback');
  }
} catch (e) {
  logger.warn('Failed to init Upstash Redis, using in-memory fallback', { error: e.message });
}

const LIMITS = {
  free:    { tasks_per_day: 50,  tasks_per_hour: 15  },
  starter: { tasks_per_day: 200, tasks_per_hour: 50  },
  pro:     { tasks_per_day: 1000, tasks_per_hour: 200 }
};

// In-memory fallback (per-instance — not distributed)
const memoryStore = new Map();
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 hour

function incrementMemory(key) {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now - entry.timestamp > MEMORY_TTL_MS) {
    memoryStore.set(key, { count: 1, timestamp: now });
    return 1;
  }
  entry.count++;
  return entry.count;
}

function getMemoryCount(key) {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry) return 0;
  if (now - entry.timestamp > MEMORY_TTL_MS) {
    memoryStore.delete(key);
    return 0;
  }
  return entry.count;
}

/**
 * Rate limiter middleware.
 * Checks daily + hourly limits based on user's tier.
 */
export async function rateLimiter(req, res, next) {
  const userId = req.user?.id;
  if (!userId) return next();

  try {
    const tier = req.user?.tier || 'free';
    const limits = LIMITS[tier] || LIMITS.free;

    const dayKey = `rate:${userId}:${new Date().toISOString().split('T')[0]}`;
    const hourKey = `rate:${userId}:${new Date().toISOString().slice(0, 13)}`;

    let dayCount, hourCount;
    if (redis) {
      [dayCount, hourCount] = await Promise.all([redis.incr(dayKey), redis.incr(hourKey)]);
      if (dayCount === 1) await redis.expire(dayKey, 86400);
      if (hourCount === 1) await redis.expire(hourKey, 3600);
    } else {
      dayCount = incrementMemory(dayKey);
      hourCount = incrementMemory(hourKey);
    }

    if (dayCount > limits.tasks_per_day) {
      return res.status(429).json({
        error: 'Daily limit reached',
        limit: limits.tasks_per_day,
        used: dayCount,
        reset: 'midnight UTC',
        tier,
        upgrade_url: '/settings?tab=agent'
      });
    }

    if (hourCount > limits.tasks_per_hour) {
      return res.status(429).json({
        error: 'Hourly limit reached',
        limit: limits.tasks_per_hour,
        used: hourCount,
        reset: 'next hour',
        tier,
        upgrade_url: '/settings?tab=agent'
      });
    }

    req.usage = { tier, dayCount, hourCount, dayLimit: limits.tasks_per_day, hourLimit: limits.tasks_per_hour };
    next();
  } catch (err) {
    logger.error('Rate limiter error (fail-open)', { error: err.message });
    next();
  }
}

/**
 * Track a usage event for analytics.
 */
export async function trackUsage(userId, taskType, model, success, durationMs) {
  try {
    const day = new Date().toISOString().split('T')[0];
    if (redis) {
      const key = `usage:${userId}:${day}`;
      await redis.hincrby(key, 'total_tasks', 1);
      await redis.hincrby(key, success ? 'success' : 'failed', 1);
      if (model) await redis.hincrby(key, `model:${model}`, 1);
      if (taskType) await redis.hincrby(key, `type:${taskType}`, 1);
      await redis.expire(key, 90 * 86400);
    } else {
      logger.debug('Usage tracked (memory fallback)', { userId, taskType, model, success });
    }
  } catch (e) {
    logger.warn('Usage tracking failed', { error: e.message });
  }
}

/**
 * Get usage stats for a user over the last N days.
 */
export async function getUsageStats(userId, days = 7) {
  const stats = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().split('T')[0];
    if (redis) {
      try {
        const data = await redis.hgetall(`usage:${userId}:${day}`);
        stats.push({ date: day, ...(data || {}) });
      } catch {
        stats.push({ date: day });
      }
    } else {
      stats.push({ date: day, source: 'memory-fallback' });
    }
  }
  return stats;
}

export { LIMITS };
export default { rateLimiter, trackUsage, getUsageStats, LIMITS };
