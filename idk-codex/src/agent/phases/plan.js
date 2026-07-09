import { generatePlan } from '../../groq/client.js';
import { readDirectoryTree, existsSafe, readFileSafe } from '../../utils/filesystem.js';
import { getSessionWorkspace, invalidateSessionWorkspace, getDefaultWorkspacePath } from '../../context/workspace-context-cache.js';
import { resolveModel } from '../../llm/model-registry.js';
import logger from '../../utils/logger.js';

/**
 * Execute PLAN phase
 *
 * For large repos, instead of dumping every file path into the prompt we use
 * the WorkspaceContext indexer (per-session cached) to:
 *   - Walk the workspace
 *   - Score files by task-relevance (keyword match on path)
 *   - Read snippets of the top-N most relevant files
 *   - Cap the total context size to fit the model's input budget
 *
 * The CLAUDE.md / claude.md guidelines file (if present) is still prepended
 * to the prompt so the agent always knows the project rules.
 *
 * @param {string} task - Task description
 * @param {Object} budgetManager - V2/V3: Token budget manager (context-window-aware)
 * @param {Object} context - Session context { sessionId, modelId, workspacePath, ... }
 * @returns {Promise<Object>} Plan result
 */
export async function executePlanPhase(task, budgetManager = null, context = {}) {
  try {
    logger.logPhase('plan', 'started', { task });

    const sessionId = context?.sessionId || null;
    const workspacePath = context?.workspacePath || getDefaultWorkspacePath();

    // Determine the model's context window so we can size the workspace context.
    // Priority: explicit context.modelId -> budgetManager.contextWindow -> default 128k
    let contextWindow = null;
    let maxOutputTokens = null;
    if (context?.modelId) {
      const resolved = resolveModel(context.modelId);
      if (resolved?.contextWindow) contextWindow = resolved.contextWindow;
      if (resolved?.maxOutputTokens) maxOutputTokens = resolved.maxOutputTokens;
    }
    if (!contextWindow && budgetManager?.contextWindow) {
      contextWindow = budgetManager.contextWindow;
      maxOutputTokens = budgetManager.outputReserve;
    }
    if (!contextWindow) {
      contextWindow = parseInt(process.env.DEFAULT_CONTEXT_WINDOW || '128000', 10);
      maxOutputTokens = parseInt(process.env.DEFAULT_MAX_OUTPUT_TOKENS || '4096', 10);
    }

    const inputBudget = Math.max(0, contextWindow - (maxOutputTokens || 4096));
    // Reserve ~30% of the input budget for the plan prompt itself + plan output,
    // the rest can go to repo context.
    const workspaceTokenBudget = Math.floor(inputBudget * 0.7);

    logger.info('Plan phase: building workspace context', {
      sessionId,
      workspacePath,
      contextWindow,
      maxOutputTokens,
      inputBudget,
      workspaceTokenBudget
    });

    // Always check for CLAUDE.md / claude.md first - project rules are critical
    let claudeMdContent = null;
    if (await existsSafe('CLAUDE.md')) {
      logger.info('Found CLAUDE.md file');
      claudeMdContent = await readFileSafe('CLAUDE.md');
    } else if (await existsSafe('claude.md')) {
      logger.info('Found claude.md file');
      claudeMdContent = await readFileSafe('claude.md');
    }

    // Get the per-session WorkspaceContext (cached) and build a task-relevant context
    const wsContext = getSessionWorkspace(sessionId, workspacePath, {
      maxFiles: 20,
      maxSnippetChars: 4000,
      maxTotalTokens: workspaceTokenBudget
    });

    let repoContext = '';
    try {
      repoContext = await wsContext.getContext(task);
    } catch (err) {
      logger.warn('WorkspaceContext failed, falling back to flat directory tree', {
        error: err.message
      });
      const files = await readDirectoryTree(workspacePath, 3);
      repoContext = files.map(f => `- ${f}`).join('\n');
    }

    // Combine project guidelines + workspace context
    const fullContext = claudeMdContent
      ? `${repoContext}\n\nProject Guidelines:\n${claudeMdContent}`
      : repoContext;

    logger.info('Plan phase: generating implementation plan', {
      contextTokens: Math.ceil(fullContext.length / 4),
      hasGuidelines: !!claudeMdContent
    });

    // Generate plan using AI (V2: pass budgetManager)
    const plan = await generatePlan(task, fullContext, budgetManager);

    // Validate plan structure
    if (!plan.steps || !Array.isArray(plan.steps)) {
      throw new Error('Invalid plan structure: missing steps array');
    }

    logger.logPhase('plan', 'completed', {
      steps: plan.steps.length,
      complexity: plan.estimated_complexity
    });

    return {
      success: true,
      plan,
      repositoryFiles: repoContext ? Math.ceil(repoContext.length / 4) : 0,
      hasGuidelines: !!claudeMdContent,
      contextWindow,
      workspaceTokenBudget
    };
  } catch (error) {
    logger.error('Plan phase failed', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Invalidate the cached WorkspaceContext for a session.
 * Call this after files are written/deleted so the next plan/execute phase
 * re-indexes the workspace.
 * @param {string} sessionId
 */
export function invalidateWorkspace(sessionId) {
  invalidateSessionWorkspace(sessionId);
}

export default { executePlanPhase, invalidateWorkspace };
