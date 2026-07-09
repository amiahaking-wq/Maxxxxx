/**
 * Phase 3: Memory Snapshot Manager
 * Periodic state snapshots for recovery and analysis
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import logger from '../utils/logger.js';
import { getDatabase } from '../database/db.js';

const SNAPSHOT_DIR = './snapshots';
const SNAPSHOT_INTERVAL = parseInt(process.env.SNAPSHOT_INTERVAL_MINUTES || '30', 10) * 60 * 1000;

/**
 * Create memory snapshot
 */
export async function createSnapshot(sessionId, state = {}) {
  try {
    // Ensure snapshot directory exists
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

    const timestamp = new Date();
    const snapshot = {
      version: 1,
      sessionId,
      timestamp: timestamp.toISOString(),
      state: {
        ...state,
        database: await getDatabaseSnapshot(sessionId),
        environment: getEnvironmentSnapshot(),
        performance: getPerformanceSnapshot()
      }
    };

    // Save snapshot
    const filename = `snapshot-${sessionId}-${timestamp.getTime()}.json`;
    const filepath = join(SNAPSHOT_DIR, filename);

    await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');

    logger.info('Memory snapshot created', { sessionId, filename });

    // Cleanup old snapshots (keep last 10)
    await cleanupOldSnapshots(sessionId);

    return {
      success: true,
      filepath,
      filename
    };
  } catch (error) {
    logger.error('Failed to create snapshot', { sessionId, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Get database snapshot
 */
async function getDatabaseSnapshot(sessionId) {
  const db = getDatabase();

  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    const messageCount = db
      .prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?')
      .get(sessionId)?.count || 0;

    const agentRuns = db
      .prepare('SELECT phase, status, created_at FROM agent_runs WHERE session_id = ? ORDER BY created_at DESC LIMIT 5')
      .all(sessionId);

    return {
      session: {
        id: session?.id,
        user_id: session?.user_id,
        created_at: session?.created_at,
        updated_at: session?.updated_at
      },
      messageCount,
      recentRuns: agentRuns
    };
  } catch (error) {
    logger.warn('Failed to get database snapshot', { error: error.message });
    return null;
  }
}

/**
 * Get environment snapshot
 */
function getEnvironmentSnapshot() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
    cwd: process.cwd(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      AGENT_MODE: process.env.AGENT_MODE,
      OBSIDIAN_LIVE_SYNC: process.env.OBSIDIAN_LIVE_SYNC
    }
  };
}

/**
 * Get performance snapshot
 */
function getPerformanceSnapshot() {
  const mem = process.memoryUsage();

  return {
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
      external: Math.round(mem.external / 1024 / 1024) + ' MB'
    },
    uptime: Math.round(process.uptime()) + ' seconds',
    cpu: process.cpuUsage()
  };
}

/**
 * Cleanup old snapshots (keep last N)
 */
async function cleanupOldSnapshots(sessionId, keepCount = 10) {
  try {
    const files = await fs.readdir(SNAPSHOT_DIR);

    // Filter snapshots for this session
    const sessionSnapshots = files
      .filter(f => f.startsWith(`snapshot-${sessionId}-`) && f.endsWith('.json'))
      .sort()
      .reverse(); // Newest first

    // Delete old snapshots
    if (sessionSnapshots.length > keepCount) {
      const toDelete = sessionSnapshots.slice(keepCount);

      for (const file of toDelete) {
        const filepath = join(SNAPSHOT_DIR, file);
        await fs.unlink(filepath);
        logger.debug('Deleted old snapshot', { file });
      }

      logger.info('Cleaned up old snapshots', {
        sessionId,
        deleted: toDelete.length
      });
    }
  } catch (error) {
    logger.warn('Failed to cleanup old snapshots', { error: error.message });
  }
}

/**
 * Load snapshot
 */
export async function loadSnapshot(sessionId, snapshotId = null) {
  try {
    let filename;

    if (snapshotId) {
      // Load specific snapshot
      filename = `snapshot-${sessionId}-${snapshotId}.json`;
    } else {
      // Load most recent snapshot
      const files = await fs.readdir(SNAPSHOT_DIR);
      const sessionSnapshots = files
        .filter(f => f.startsWith(`snapshot-${sessionId}-`) && f.endsWith('.json'))
        .sort()
        .reverse();

      if (sessionSnapshots.length === 0) {
        throw new Error('No snapshots found');
      }

      filename = sessionSnapshots[0];
    }

    const filepath = join(SNAPSHOT_DIR, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    const snapshot = JSON.parse(content);

    logger.info('Snapshot loaded', { sessionId, filename });

    return {
      success: true,
      snapshot,
      filename
    };
  } catch (error) {
    logger.error('Failed to load snapshot', { sessionId, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Get all snapshots for session
 */
export async function listSnapshots(sessionId) {
  try {
    const files = await fs.readdir(SNAPSHOT_DIR);

    const snapshots = files
      .filter(f => f.startsWith(`snapshot-${sessionId}-`) && f.endsWith('.json'))
      .map(filename => {
        const match = filename.match(/snapshot-(\d+)-(\d+)\.json/);
        return {
          filename,
          sessionId: parseInt(match[1]),
          timestamp: parseInt(match[2]),
          created: new Date(parseInt(match[2])).toISOString()
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    return {
      success: true,
      snapshots
    };
  } catch (error) {
    logger.error('Failed to list snapshots', { sessionId, error: error.message });
    return { success: false, error: error.message, snapshots: [] };
  }
}

/**
 * Start periodic snapshot worker
 */
export function startSnapshotWorker(sessionId) {
  const intervalId = setInterval(async () => {
    logger.debug('Creating periodic snapshot', { sessionId });
    await createSnapshot(sessionId, {
      type: 'periodic',
      interval: SNAPSHOT_INTERVAL
    });
  }, SNAPSHOT_INTERVAL);

  logger.info('Snapshot worker started', {
    sessionId,
    intervalMinutes: SNAPSHOT_INTERVAL / 60 / 1000
  });

  return intervalId;
}

/**
 * Stop snapshot worker
 */
export function stopSnapshotWorker(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    logger.info('Snapshot worker stopped');
  }
}

export default {
  createSnapshot,
  loadSnapshot,
  listSnapshots,
  startSnapshotWorker,
  stopSnapshotWorker
};
