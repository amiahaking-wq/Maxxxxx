/**
 * Phase 3: Enhanced Obsidian Live Sync
 * Upgrade from fire-and-forget to real-time synchronization
 * Tracks sync status, retries failures, and validates writes
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import logger from '../utils/logger.js';
import { getDatabase } from '../database/db.js';

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || './obsidian-vault';
const DOCS_PATH = join(VAULT_PATH, 'docs');
const LIVE_SYNC_ENABLED = process.env.OBSIDIAN_LIVE_SYNC !== 'false';
const MAX_RETRIES = 3;

/**
 * Sync status tracker
 */
class SyncTracker {
  constructor() {
    this.pendingWrites = new Map();
    this.failedWrites = new Map();
    this.successfulWrites = new Set();
  }

  /**
   * Add pending write
   */
  addPending(id, data) {
    this.pendingWrites.set(id, {
      ...data,
      attempts: 0,
      addedAt: Date.now()
    });
  }

  /**
   * Mark write as successful
   */
  markSuccess(id) {
    this.pendingWrites.delete(id);
    this.failedWrites.delete(id);
    this.successfulWrites.add(id);

    logger.debug('Obsidian write successful', { id });
  }

  /**
   * Mark write as failed
   */
  markFailed(id, error) {
    const pending = this.pendingWrites.get(id);
    if (pending) {
      pending.attempts++;

      if (pending.attempts >= MAX_RETRIES) {
        // Move to failed
        this.failedWrites.set(id, {
          ...pending,
          error: error.message,
          failedAt: Date.now()
        });
        this.pendingWrites.delete(id);

        logger.warn('Obsidian write failed after retries', {
          id,
          attempts: pending.attempts,
          error: error.message
        });
      } else {
        // Keep in pending for retry
        this.pendingWrites.set(id, pending);

        logger.debug('Obsidian write will retry', {
          id,
          attempt: pending.attempts,
          maxRetries: MAX_RETRIES
        });
      }
    }
  }

  /**
   * Get sync stats
   */
  getStats() {
    return {
      pending: this.pendingWrites.size,
      failed: this.failedWrites.size,
      successful: this.successfulWrites.size,
      failedWrites: Array.from(this.failedWrites.values())
    };
  }

  /**
   * Get pending writes for retry
   */
  getPendingWrites() {
    return Array.from(this.pendingWrites.entries());
  }
}

// Global tracker
const syncTracker = new SyncTracker();

/**
 * Initialize Obsidian vault with sync database
 */
export async function initializeVaultWithSync() {
  try {
    // Create vault directories
    await fs.mkdir(DOCS_PATH, { recursive: true });
    await fs.mkdir(join(VAULT_PATH, '.obsidian'), { recursive: true });
    await fs.mkdir(join(VAULT_PATH, 'attachments'), { recursive: true });

    // Create sync metadata file
    const metadataPath = join(VAULT_PATH, '.sync-metadata.json');
    try {
      await fs.access(metadataPath);
    } catch {
      // Create new metadata file
      const metadata = {
        version: 1,
        created: new Date().toISOString(),
        lastSync: null,
        totalWrites: 0
      };
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    logger.info('Obsidian vault initialized with live sync', { path: VAULT_PATH });

    // Start retry worker if live sync is enabled
    if (LIVE_SYNC_ENABLED) {
      startRetryWorker();
    }
  } catch (error) {
    logger.error('Failed to initialize Obsidian vault', { error: error.message });
    throw error;
  }
}

/**
 * Write with live sync validation
 */
export async function writeLiveSync(sessionId, phase, content, timestamp = new Date()) {
  const writeId = `${sessionId}-${phase}-${timestamp.getTime()}`;

  try {
    if (!LIVE_SYNC_ENABLED) {
      // Fallback to fire-and-forget
      await writePhaseNoteInternal(sessionId, phase, content, timestamp);
      return { success: true, mode: 'fire-and-forget' };
    }

    // Add to pending
    syncTracker.addPending(writeId, {
      sessionId,
      phase,
      content,
      timestamp
    });

    // Attempt write
    await writePhaseNoteInternal(sessionId, phase, content, timestamp);

    // Validate write
    const validated = await validateWrite(sessionId, phase, timestamp);

    if (validated) {
      syncTracker.markSuccess(writeId);
      await updateSyncMetadata();
      return { success: true, mode: 'live-sync', validated: true };
    } else {
      throw new Error('Write validation failed');
    }
  } catch (error) {
    syncTracker.markFailed(writeId, error);
    logger.error('Live sync write failed', {
      sessionId,
      phase,
      error: error.message
    });
    return { success: false, error: error.message, willRetry: true };
  }
}

/**
 * Internal write function
 */
async function writePhaseNoteInternal(sessionId, phase, content, timestamp) {
  // Ensure vault exists
  await fs.mkdir(DOCS_PATH, { recursive: true });

  // Validate sessionId
  if (!Number.isInteger(sessionId) || sessionId < 0) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }

  // Format filename
  const dateStr = timestamp.toISOString().split('T')[0];
  const filename = `${dateStr}-session-${sessionId}-${phase}.md`;
  const filepath = join(DOCS_PATH, filename);

  // Format markdown content
  const markdown = formatPhaseNote(sessionId, phase, content, timestamp);

  // Write atomically (write to temp, then rename)
  const tempPath = filepath + '.tmp';
  await fs.writeFile(tempPath, markdown, 'utf-8');
  await fs.rename(tempPath, filepath);

  logger.info('Phase note written', { sessionId, phase, filename });
}

/**
 * Validate that write was successful
 */
async function validateWrite(sessionId, phase, timestamp) {
  try {
    const dateStr = timestamp.toISOString().split('T')[0];
    const filename = `${dateStr}-session-${sessionId}-${phase}.md`;
    const filepath = join(DOCS_PATH, filename);

    // Check file exists
    await fs.access(filepath);

    // Check file is readable
    const content = await fs.readFile(filepath, 'utf-8');

    // Basic validation: check frontmatter exists
    if (!content.includes('---') || !content.includes(`sessionId: ${sessionId}`)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Update sync metadata
 */
async function updateSyncMetadata() {
  try {
    const metadataPath = join(VAULT_PATH, '.sync-metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

    metadata.lastSync = new Date().toISOString();
    metadata.totalWrites = (metadata.totalWrites || 0) + 1;

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  } catch (error) {
    logger.warn('Failed to update sync metadata', { error: error.message });
  }
}

/**
 * Start background retry worker
 */
function startRetryWorker() {
  setInterval(async () => {
    const pending = syncTracker.getPendingWrites();

    if (pending.length === 0) {
      return;
    }

    logger.info('Retrying pending Obsidian writes', { count: pending.length });

    for (const [id, data] of pending) {
      try {
        await writePhaseNoteInternal(
          data.sessionId,
          data.phase,
          data.content,
          data.timestamp
        );

        const validated = await validateWrite(
          data.sessionId,
          data.phase,
          data.timestamp
        );

        if (validated) {
          syncTracker.markSuccess(id);
          await updateSyncMetadata();
        } else {
          throw new Error('Validation failed');
        }
      } catch (error) {
        syncTracker.markFailed(id, error);
      }
    }
  }, 30000); // Retry every 30 seconds

  logger.info('Obsidian retry worker started');
}

/**
 * Get sync status
 */
export function getSyncStatus() {
  return {
    enabled: LIVE_SYNC_ENABLED,
    vaultPath: VAULT_PATH,
    ...syncTracker.getStats()
  };
}

/**
 * Format phase note (same as original)
 */
function formatPhaseNote(sessionId, phase, content, timestamp) {
  const sections = [];

  // Frontmatter
  sections.push('---');
  sections.push(`sessionId: ${sessionId}`);
  sections.push(`phase: ${phase}`);
  sections.push(`timestamp: ${timestamp.toISOString()}`);
  sections.push(`date: ${timestamp.toISOString().split('T')[0]}`);
  sections.push(`synced: ${LIVE_SYNC_ENABLED}`);
  sections.push(`tags: [agent, ${phase}, session-${sessionId}, live-sync]`);
  sections.push('---');
  sections.push('');

  // Title
  sections.push(`# ${capitalize(phase)} Phase - Session ${sessionId}`);
  sections.push('');
  sections.push(`**Date**: ${timestamp.toLocaleString()}`);
  sections.push(`**Sync Mode**: ${LIVE_SYNC_ENABLED ? 'Live Sync ✅' : 'Fire-and-Forget'}`);
  sections.push('');

  // Content
  sections.push('## Results');
  sections.push('');

  if (typeof content === 'string') {
    sections.push(content);
  } else if (content && typeof content === 'object') {
    sections.push(JSON.stringify(content, null, 2));
  } else {
    sections.push('_No content available_');
  }

  // Status
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push('## Status');
  sections.push('');
  const status = content?.success ? '✅ Success' : '❌ Failed';
  sections.push(status);

  // Links
  sections.push('');
  sections.push('## Related Notes');
  sections.push('');
  sections.push(`- [[session-${sessionId}]]`);
  sections.push(`- [[${phase}-phase]]`);

  return sections.join('\n');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default {
  initializeVaultWithSync,
  writeLiveSync,
  getSyncStatus
};
