/**
 * Rate Limiter Middleware (Phase 4 — FIXED: non-blocking)
 *
 * Uses Upstash Redis (free tier: 10k commands/day) for distributed rate
 * limiting. Falls back gracefully to in-memory tracking if Redis is not
 * configured OR if Redis is unreachable.
 *
 * CRITICAL FIX: If Redis fails even once, we permanently switch to in-memory
 * mode for the rest of the process lifetime. This prevents a single Redis
 * outage from blocking ALL requests for 2.5 minutes each.
 *
 * Tiers:
 *   free:    50 tasks/day, 15 tasks/hour
 *   starter: 200 tasks/day, 50 tasks/hour
 *   pro:     1000 tasks/day, 200 tasks/hour
 */

import logger from '../utils/logger.js';

let redis = null;
let redisDisabled = false;  // If true, skip Redis entirely (use in-memory)

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      // Add a per-request timeout so we don't hang for minutes
      fetch: (input, init) => {
        return fetch(input, {
          ...init,
          signal: AbortSignal.timeout(2000)  // 2 second timeout — fail fast
        });
      }
    });
    logger.info('Upstash Redis rate limiter initialized (2s timeout)');
  } else {
    logger.warn('UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiter using in-memory fallback');
  }
} catch (e) {
  logger.warn('Failed to init Upstash Redis, using in-memory fallback', { error: e.message });
  redis = null;
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

/**
 * Disable Redis permanently for this process (after first failure).
 * All subsequent requests will use in-memory tracking.
 */
function disableRedis(reason) {
  if (!redisDisabled) {
    redisDisabled = true;
    logger.warn('Redis disabled — switching to in-memory rate limiting permanently', { reason });
  }
}

/**
 * Rate limiter middleware.
 * NON-BLOCKING: If Redis is slow/unreachable, immediately falls back to in-memory.
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

    // Use Redis ONLY if it's configured AND hasn't failed before
    if (redis && !redisDisabled) {
      try {
        // Race the Redis calls against a 2.5s timeout — if Redis is slow, fail fast
        const redisPromise = Promise.all([
          redis.incr(dayKey),
          redis.incr(hourKey)
        ]);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout')), 2500)
        );

        [dayCount, hourCount] = await Promise.race([redisPromise, timeoutPromise]);

        // Set expiry on first use (best-effort, don't block)
        if (dayCount === 1) redis.expire(dayKey, 86400).catch(() => {});
        if (hourCount === 1) redis.expire(hourKey, 3600).catch(() => {});
      } catch (redisErr) {
        // Redis failed — disable it permanently and use in-memory for THIS request
        disableRedis(redisErr.message);
        dayCount = incrementMemory(dayKey);
        hourCount = incrementMemory(hourKey);
      }
    } else {
      // Redis not configured or already disabled — use in-memory
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
    // Last-resort fail-open — never block a request due to rate limiter bugs
    logger.error('Rate limiter unexpected error (fail-open)', { error: err.message });
    next();
  }
}

/**
 * Track a usage event for analytics.
 * Non-blocking — errors are swallowed.
 */
export async function trackUsage(userId, taskType, model, success, durationMs) {
  try {
    const day = new Date().toISOString().split('T')[0];
    if (redis && !redisDisabled) {
      try {
        const key = `usage:${userId}:${day}`;
        // Use Promise.all with timeout — don't block
        const ops = [
          redis.hincrby(key, 'total_tasks', 1),
          redis.hincrby(key, success ? 'success' : 'failed', 1)
        ];
        if (model) ops.push(redis.hincrby(key, `model:${model}`, 1));
        if (taskType) ops.push(redis.hincrby(key, `type:${taskType}`, 1));
        ops.push(redis.expire(key, 90 * 86400));

        await Promise.race([
          Promise.all(ops),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
      } catch (e) {
        disableRedis(e.message);
      }
    }
    // In-memory mode: no-op (we don't track in memory for analytics)
  } catch (e) {
    // Swallow — usage tracking must never break requests
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
    if (redis && !redisDisabled) {
      try {
        const data = await Promise.race([
          redis.hgetall(`usage:${userId}:${day}`),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        stats.push({ date: day, ...(data || {}) });
      } catch {
        // Redis failed for this query — push empty + disable
        disableRedis('hgetall timeout');
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
