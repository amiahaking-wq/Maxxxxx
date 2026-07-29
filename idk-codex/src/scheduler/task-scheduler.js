/**
 * Task Scheduler (Phase 5)
 *
 * Uses node-cron to run scheduled agent tasks.
 * Tasks are stored in SQLite (max_scheduled_tasks table) and synced to
 * active cron jobs every minute.
 */

import cron from 'node-cron';
import { getDatabase } from '../database/db.js';
import { executeReActLoop } from '../agent/react-loop-v2.js';
import logger from '../utils/logger.js';

class TaskScheduler {
  constructor() {
    this.jobs = new Map();
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;

    try {
      const db = getDatabase();
      db.prepare(`CREATE TABLE IF NOT EXISTS max_scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        task_prompt TEXT NOT NULL,
        schedule TEXT NOT NULL,
        schedule_human TEXT,
        is_active INTEGER DEFAULT 1,
        last_run_at TEXT,
        last_run_result TEXT,
        next_run_at TEXT,
        run_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();

      const tasks = db.prepare('SELECT * FROM max_scheduled_tasks WHERE is_active = 1').all();
      for (const task of tasks) { this.scheduleTask(task); }
      logger.info(`Task scheduler started with ${tasks.length} active tasks`);

      cron.schedule('* * * * *', () => this.syncTasks());
    } catch (e) {
      logger.error('Failed to start task scheduler', { error: e.message });
    }
  }

  scheduleTask(task) {
    if (!cron.validate(task.schedule)) {
      logger.error(`Invalid cron expression for task ${task.id}: ${task.schedule}`);
      return;
    }
    try {
      const job = cron.schedule(task.schedule, async () => {
        logger.info(`Running scheduled task: ${task.name} (${task.id})`);
        await this.runTask(task);
      });
      this.jobs.set(task.id, job);
    } catch (e) {
      logger.error(`Failed to schedule task ${task.id}`, { error: e.message });
    }
  }

  async runTask(task) {
    const db = getDatabase();
    const startTime = Date.now();
    try {
      const sessionId = `scheduled_${task.id}_${Date.now()}`;
      const result = await executeReActLoop(task.task_prompt, sessionId, task.user_id, {
        workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
      });
      const duration = Date.now() - startTime;
      const resultText = (result.summary || 'Completed').substring(0, 500);

      db.prepare(`UPDATE max_scheduled_tasks
        SET last_run_at = datetime('now'),
            last_run_result = ?,
            run_count = run_count + 1
        WHERE id = ?`).run(resultText, task.id);

      logger.info('Scheduled task completed', { taskId: task.id, duration });

      try {
        const prefs = db.prepare('SELECT telegram_notify_id FROM user_preferences WHERE user_id = ?').get(task.user_id);
        if (prefs?.telegram_notify_id && process.env.TELEGRAM_BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: prefs.telegram_notify_id,
              text: `⏰ Scheduled task complete: ${task.name}\n\n${resultText}`
            })
          });
        }
      } catch (e) {}
    } catch (err) {
      logger.error(`Scheduled task ${task.id} failed`, { error: err.message });
      db.prepare(`UPDATE max_scheduled_tasks
        SET last_run_at = datetime('now'), last_run_result = ?
        WHERE id = ?`).run(`ERROR: ${err.message}`.substring(0, 500), task.id);
    }
  }

  syncTasks() {
    try {
      const db = getDatabase();
      const activeTasks = db.prepare('SELECT * FROM max_scheduled_tasks WHERE is_active = 1').all();
      for (const task of activeTasks) {
        if (!this.jobs.has(task.id)) this.scheduleTask(task);
      }
      for (const [id, job] of this.jobs) {
        if (!activeTasks.find(t => t.id === id)) {
          try { job.stop(); } catch (e) {}
          this.jobs.delete(id);
        }
      }
    } catch (e) {
      logger.warn('Task sync failed', { error: e.message });
    }
  }

  addTask(userId, name, prompt, schedule, scheduleHuman) {
    if (!cron.validate(schedule)) throw new Error(`Invalid schedule: ${schedule}`);
    const db = getDatabase();
    const result = db.prepare(`INSERT INTO max_scheduled_tasks
      (user_id, name, task_prompt, schedule, schedule_human)
      VALUES (?, ?, ?, ?, ?)`).run(userId, name, prompt, schedule, scheduleHuman || schedule);
    const task = db.prepare('SELECT * FROM max_scheduled_tasks WHERE id = ?').get(result.lastInsertRowid);
    if (task) this.scheduleTask(task);
    return task;
  }

  toggleTask(taskId, userId, active) {
    const db = getDatabase();
    db.prepare(`UPDATE max_scheduled_tasks SET is_active = ? WHERE id = ? AND user_id = ?`)
      .run(active ? 1 : 0, taskId, userId);
    const job = this.jobs.get(taskId);
    if (job) {
      if (active) { try { job.start(); } catch (e) {} }
      else { try { job.stop(); } catch (e) {} }
    } else if (active) {
      const task = db.prepare('SELECT * FROM max_scheduled_tasks WHERE id = ?').get(taskId);
      if (task) this.scheduleTask(task);
    }
  }

  deleteTask(taskId, userId) {
    const db = getDatabase();
    db.prepare('DELETE FROM max_scheduled_tasks WHERE id = ? AND user_id = ?').run(taskId, userId);
    const job = this.jobs.get(taskId);
    if (job) { try { job.stop(); } catch (e) {} this.jobs.delete(taskId); }
  }

  listTasks(userId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM max_scheduled_tasks WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  }
}

export const taskScheduler = new TaskScheduler();
export default taskScheduler;
