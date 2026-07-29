/**
 * Billing & Subscriptions API (Feature #20)
 *
 * Manages subscription tiers, Stripe integration (mock for now — actual Stripe
 * webhooks can be wired in later), and team seat management.
 *
 * GET    /api/billing/tiers          — list all subscription tiers
 * GET    /api/billing/subscription   — get current user's subscription
 * POST   /api/billing/subscribe      — subscribe to a tier (mock — no payment)
 * POST   /api/billing/cancel         — cancel subscription
 * POST   /api/billing/webhook        — Stripe webhook receiver
 *
 * Tiers: free / pro / team / enterprise
 * Each tier has different rate limits (see usage.js).
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { getDatabase } from '../../database/db.js';
import { TIERS, getUserTier } from './usage.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

export const TIER_PRICING = {
  free:       { name: 'Free',       priceMonthly: 0,    priceYearly: 0,    description: 'For trying out MAX' },
  pro:        { name: 'Pro',        priceMonthly: 20,   priceYearly: 200,  description: 'For individual developers' },
  team:       { name: 'Team',       priceMonthly: 100,  priceYearly: 1000, description: 'For small teams (up to 10 seats)' },
  enterprise: { name: 'Enterprise', priceMonthly: 500,  priceYearly: 5000, description: 'For large teams (unlimited seats)' }
};

function ensureSubscriptionsTable() {
  try {
    const db = getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_subscriptions (
      user_id TEXT PRIMARY KEY,
      tier TEXT DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_end TEXT,
      status TEXT DEFAULT 'active',
      seats INTEGER DEFAULT 1,
      updated_at TEXT
    )`).run();
  } catch (e) { /* ok */ }
}

router.get('/tiers', (req, res) => {
  res.json({
    success: true,
    tiers: Object.entries(TIER_PRICING).map(([key, val]) => ({
      id: key,
      ...val,
      limits: TIERS[key] || {}
    }))
  });
});

// Root handler — returns info so /api/billing doesn't 404
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'MAX Billing',
    description: 'Subscription tiers + Stripe webhook receiver',
    endpoints: {
      tiers: 'GET /api/billing/tiers',
      subscription: 'GET /api/billing/subscription',
      subscribe: 'POST /api/billing/subscribe',
      cancel: 'POST /api/billing/cancel',
      webhook: 'POST /api/billing/webhook'
    }
  });
});

router.get('/subscription', (req, res) => {
  try {
    const userId = req.user.id;
    ensureSubscriptionsTable();
    const db = getDatabase();
    const sub = db.prepare('SELECT * FROM max_subscriptions WHERE user_id = ?').get(userId);
    const tier = sub?.tier || 'free';
    res.json({
      success: true,
      subscription: sub || { user_id: userId, tier: 'free', status: 'active', seats: 1 },
      tier,
      pricing: TIER_PRICING[tier],
      limits: TIERS[tier]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/subscribe', (req, res) => {
  try {
    const userId = req.user.id;
    const { tier, period } = req.body; // period: 'monthly' or 'yearly'
    if (!TIER_PRICING[tier]) {
      return res.status(400).json({ error: `Invalid tier: ${tier}` });
    }

    ensureSubscriptionsTable();
    const db = getDatabase();
    db.prepare(`
      INSERT INTO max_subscriptions (user_id, tier, status, seats, current_period_end, updated_at)
      VALUES (?, ?, 'active', ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        tier = excluded.tier,
        status = 'active',
        current_period_end = excluded.current_period_end,
        updated_at = datetime('now')
    `).run(
      userId,
      tier,
      tier === 'team' ? 10 : tier === 'enterprise' ? 1000 : 1,
      new Date(Date.now() + (period === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString()
    );

    logger.info('Subscription updated', { userId, tier, period });
    res.json({ success: true, tier, message: `Subscribed to ${tier} (${period})` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cancel', (req, res) => {
  try {
    const userId = req.user.id;
    ensureSubscriptionsTable();
    const db = getDatabase();
    db.prepare('UPDATE max_subscriptions SET status = ?, tier = ?, updated_at = datetime(\'now\') WHERE user_id = ?')
      .run('cancelled', 'free', userId);
    res.json({ success: true, message: 'Subscription cancelled. You are now on the Free tier.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe webhook receiver (for when Stripe is wired up)
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // In production: verify Stripe signature, parse event, update subscription
  logger.info('Stripe webhook received (not yet implemented)');
  res.json({ received: true });
});

export default router;
