/**
 * Scheduled Tasks API (Phase 5)
 *
 * GET    /api/scheduled       — list user's scheduled tasks
 * POST   /api/scheduled       — create a new scheduled task
 * PATCH  /api/scheduled/:id   — toggle active/inactive
 * DELETE /api/scheduled/:id   — delete a task
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { taskScheduler } from '../../scheduler/task-scheduler.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

const SCHEDULE_PRESETS = {
  every_morning: '0 8 * * *',
  every_evening: '0 20 * * *',
  every_hour: '0 * * * *',
  every_monday: '0 9 * * 1',
  every_day: '0 9 * * *'
};

router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const tasks = taskScheduler.listTasks(userId);
    res.json({ success: true, tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, prompt, schedule, scheduleHuman } = req.body;
    if (!name || !prompt || !schedule) {
      return res.status(400).json({ error: 'name, prompt, schedule required' });
    }
    const cronExpr = SCHEDULE_PRESETS[schedule] || schedule;
    const task = taskScheduler.addTask(userId, name, prompt, cronExpr, scheduleHuman || schedule);
    logger.info('Scheduled task created', { userId, taskId: task.id, name });
    res.json({ success: true, task });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const { active } = req.body;
    taskScheduler.toggleTask(parseInt(req.params.id, 10), userId, !!active);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    taskScheduler.deleteTask(parseInt(req.params.id, 10), userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
export { SCHEDULE_PRESETS };
