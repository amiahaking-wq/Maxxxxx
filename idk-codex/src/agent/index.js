// Agent entry point — Hermes Harness wrapper
// Replaces the broken ReAct loop (idk-codex/src/agent/react-loop.js, deleted in Phase 0).
// Adapted to ESM.
import { Harness } from '../engine/harness.js';
import adapter from '../llm/adapter.js';

/**
 * Process a user message via the Hermes Harness.
 * @param {string} sessionId - Session ID for streaming/broadcasting
 * @param {string} content - User message content
 * @param {Object} [options] - Optional Harness config (profile, maxIterations, approval, model)
 * @returns {Promise<string>} - Final assistant content
 */
export async function processMessage(sessionId, content, options = {}) {
  const harness = new Harness(adapter, options);
  return harness.run(sessionId, content, options);
}

export { Harness, adapter };
export default { processMessage, Harness, adapter };
