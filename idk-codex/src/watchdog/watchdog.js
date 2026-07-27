/**
 * Watchdog — Autonomous monitoring and auto-fix system
 */

import { getDatabase } from '../database/db.js';
import { executeReActLoop } from '../agent/react-loop-v2.js';
import logger from '../utils/logger.js';

class Watchdog {
  constructor() { this.db = null; this.running = false; }

  start() {
    try {
      this.db = getDatabase();
      this.db.exec(`CREATE TABLE IF NOT EXISTS max_watchdog_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default-user',
        name TEXT NOT NULL, url TEXT, repo_url TEXT,
        watch_type TEXT NOT NULL DEFAULT 'api_change',
        check_interval_hours INTEGER DEFAULT 24,
        last_checked_at TEXT, is_active INTEGER DEFAULT 1,
        config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')))`);
      setInterval(() => this.checkAllRules(), 3600000);
      logger.info('Watchdog started');
      this.running = true;
    } catch (e) { logger.warn('Watchdog failed to start', { error: e.message }); }
  }

  async checkAllRules() {
    if (!this.db) return;
    try {
      const rules = this.db.prepare('SELECT * FROM max_watchdog_rules WHERE is_active = 1').all();
      for (const r of rules) {
        const hrs = r.last_checked_at ? (Date.now() - new Date(r.last_checked_at + 'Z').getTime()) / 3600000 : 999;
        if (hrs >= r.check_interval_hours) await this.runRule(r);
      }
    } catch (e) { logger.error('Watchdog check failed', { error: e.message }); }
  }

  async runRule(rule) {
    const cfg = JSON.parse(rule.config || '{}');
    let task = '';
    if (rule.watch_type === 'api_change') {
      task = 'Fetch ' + (rule.url || cfg.api_url) + ' and compare with memory_get("watchdog_' + rule.id + '_last"). If changed, save new with memory_save and report.';
    } else if (rule.watch_type === 'repo_health') {
      task = 'Clone ' + rule.repo_url + ', run tests. If failing, analyze and fix.';
    }
    if (!task) return;
    logger.info('Watchdog running', { ruleId: rule.id });
    try { await executeReActLoop(task, 'watchdog-' + rule.id, rule.user_id, { workspacePath: './sandbox-workspace' }); }
    catch (e) { logger.error('Watchdog rule failed', { ruleId: rule.id, error: e.message }); }
    this.db.prepare('UPDATE max_watchdog_rules SET last_checked_at = datetime(\'now\') WHERE id = ?').run(rule.id);
  }

  addRule(rule) {
    if (!this.db) return null;
    return this.db.prepare('INSERT INTO max_watchdog_rules (user_id, name, url, repo_url, watch_type, check_interval_hours, config) VALUES (?,?,?,?,?,?,?)')
      .run(rule.user_id || 'default-user', rule.name, rule.url, rule.repo_url, rule.watch_type || 'api_change', rule.check_interval_hours || 24, JSON.stringify(rule.config || {})).lastInsertRowid;
  }

  listRules() { return this.db ? this.db.prepare('SELECT * FROM max_watchdog_rules ORDER BY created_at DESC').all() : []; }
  deleteRule(id) { return this.db ? this.db.prepare('DELETE FROM max_watchdog_rules WHERE id = ?').run(id).changes > 0 : false; }
}

const watchdog = new Watchdog();
export default watchdog;
