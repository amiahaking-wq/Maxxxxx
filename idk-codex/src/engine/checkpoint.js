// Checkpoint Manager — saves/restores agent state mid-run
// Adapted to ESM + better-sqlite3 (synchronous API)
import { getDatabase } from '../database/db.js';

export class CheckpointManager {
  constructor() { this.ensureTable(); }
  ensureTable() {
    try {
      const db = getDatabase();
      db.exec(`CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (e) {
      // Database may not be initialized in some contexts — fail soft
      console.warn('CheckpointManager: ensureTable failed:', e.message);
    }
  }
  async save(sessionId, stepNumber, state) {
    try {
      const db = getDatabase();
      db.prepare('INSERT INTO checkpoints (session_id, step_number, state) VALUES (?, ?, ?)')
        .run(sessionId, stepNumber, JSON.stringify(state));
    } catch (e) { console.warn('CheckpointManager.save failed:', e.message); }
  }
  async getLast(sessionId) {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT * FROM checkpoints WHERE session_id = ? ORDER BY step_number DESC LIMIT 1').get(sessionId);
      return row ? { ...row, state: JSON.parse(row.state) } : null;
    } catch (e) { return null; }
  }
  async resume(sessionId) {
    const checkpoint = await this.getLast(sessionId);
    if (!checkpoint) return null;
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM checkpoints WHERE session_id = ? AND step_number < ?')
        .run(sessionId, checkpoint.step_number);
    } catch (e) { /* ignore */ }
    return checkpoint.state;
  }
  async clear(sessionId) {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM checkpoints WHERE session_id = ?').run(sessionId);
    } catch (e) { /* ignore */ }
  }
}
