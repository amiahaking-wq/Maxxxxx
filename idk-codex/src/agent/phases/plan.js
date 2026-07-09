import { generatePlan } from '../../groq/client.js';
import { buildRepositoryContext, SYSTEM_PROMPTS } from '../../groq/prompts.js';
import { readDirectoryTree, existsSafe, readFileSafe } from '../../utils/filesystem.js';
import logger from '../../utils/logger.js';

/**
 * Execute PLAN phase
 * @param {string} task - Task description
 * @param {Object} budgetManager - V2: Token budget manager
 * @param {Object} context - Session context
 * @returns {Promise<Object>} Plan result
 */
export async function executePlanPhase(task, budgetManager = null, context = {}) {
  try {
    logger.logPhase('plan', 'started', { task });

    // Index repository structure
    logger.info('Indexing repository structure');
    const files = await readDirectoryTree('.', 3);

    // Check for claude.md or CLAUDE.md
    let claudeMdContent = null;
    if (await existsSafe('CLAUDE.md')) {
      logger.info('Found CLAUDE.md file');
      claudeMdContent = await readFileSafe('CLAUDE.md');
    } else if (await existsSafe('claude.md')) {
      logger.info('Found claude.md file');
      claudeMdContent = await readFileSafe('claude.md');
    }

    // Build repository context
    const repoContext = files.map(f => `- ${f}`).join('\n');
    const fullContext = claudeMdContent
      ? `${repoContext}\n\nProject Guidelines:\n${claudeMdContent}`
      : repoContext;

    // Generate plan using AI (V2: pass budgetManager)
    logger.info('Generating implementation plan');
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
      repositoryFiles: files.length,
      hasGuidelines: !!claudeMdContent
    };
  } catch (error) {
    logger.error('Plan phase failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

export default { executePlanPhase };
