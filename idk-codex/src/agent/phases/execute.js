import { generateCode, analyzeCode } from '../../groq/client.js';
import { buildSelfReviewContext } from '../../groq/prompts.js';
import { writeFileSafe, readFileSafe, existsSafe } from '../../utils/filesystem.js';
import { generateCompletion } from '../../groq/client.js';
import { invalidateWorkspace } from './plan.js';
import logger from '../../utils/logger.js';

/**
 * Execute EXECUTE phase
 * @param {Object} plan - Plan from plan phase
 * @param {string} task - Original task description
 * @param {Object} context - Session context
 * @returns {Promise<Object>} Execution result
 */
export async function executeExecutePhase(plan, task, context = {}) {
  try {
    logger.logPhase('execute', 'started', { steps: plan.steps?.length });

    const executedSteps = [];
    const filesModified = [];

    // Execute each step in the plan
    for (const step of plan.steps || []) {
      logger.info('Executing step', { file: step.file, action: step.action });

      try {
        let code = '';

        if (step.action === 'create' || step.action === 'modify') {
          // Read existing file if modifying
          let existingCode = '';
          if (step.action === 'modify' && await existsSafe(step.file)) {
            existingCode = await readFileSafe(step.file);
          }

          // Generate code
          const prompt = step.action === 'modify'
            ? `Modify the following file according to the task.\n\nTask: ${step.description}\n\nExisting code:\n\`\`\`\n${existingCode}\n\`\`\`\n\nProvide the complete modified file.`
            : `Create a new file for the following task.\n\nTask: ${step.description}\n\nFile: ${step.file}\n\nProvide the complete file content.`;

          // Check token budget before expensive AI call.
          // We use a generous estimate (1500 tokens) for the output reservation
          // per step so multi-file plans don't fail halfway through. The actual
          // max_tokens sent to the LLM is controlled by the adapter's
          // applyContextBudget() which caps it to the model's maxOutputTokens.
          if (context.budgetManager) {
            const estimatedInputTokens = Math.ceil((prompt.length + JSON.stringify(context.messages || []).length) / 4);
            const estimatedOutputTokens = 1500;
            const budgetCheck = context.budgetManager.checkBudget(estimatedInputTokens, estimatedOutputTokens);
            if (!budgetCheck.allowed) {
              logger.warn('Insufficient token budget in execute phase', {
                ...budgetCheck,
                file: step.file,
                estimatedInputTokens,
                estimatedOutputTokens
              });
              // Don't throw — just log and continue. The budget manager is a
              // soft limit; failing mid-plan leaves the workspace half-written.
              // The adapter will still enforce the real per-request max_tokens.
            }
          }

          code = await generateCode(prompt, context.messages || [], context.budgetManager);

          // Extract code from markdown if present. Match any language tag
          // (html, css, js, python, etc.) or no tag at all.
          const codeMatch = code.match(/```(?:[a-zA-Z0-9_+-]+)?\n?([\s\S]*?)```/);
          if (codeMatch) {
            code = codeMatch[1].trim();
          }

          // Self-review the generated code
          logger.info('Performing self-review', { file: step.file });
          const reviewMessages = buildSelfReviewContext(code, step.description);
          const review = await generateCompletion(reviewMessages, {
            temperature: 0.2,
            maxTokens: 2000
          });

          // Parse review result
          let reviewResult = { approved: true, issues: [], suggestions: [] };
          try {
            const jsonMatch = review.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              reviewResult = JSON.parse(jsonMatch[0]);
            }
          } catch (error) {
            logger.warn('Failed to parse review result', { error: error.message });
          }

          if (!reviewResult.approved) {
            logger.warn('Self-review found issues', {
              file: step.file,
              issues: reviewResult.issues
            });
            // Continue anyway but log the issues
          }

          // Write the file
          await writeFileSafe(step.file, code);
          filesModified.push(step.file);

          // Invalidate the cached WorkspaceContext for this session so the next
          // plan/execute phase re-indexes the workspace (the file we just wrote
          // may have changed the structure / keyword scores).
          if (context?.sessionId) {
            try {
              invalidateWorkspace(context.sessionId);
            } catch (e) {
              logger.warn('Failed to invalidate workspace cache after write', {
                file: step.file,
                error: e.message
              });
            }
          }

          executedSteps.push({
            file: step.file,
            action: step.action,
            success: true,
            review: reviewResult
          });
        } else if (step.action === 'delete') {
          // Skip delete operations for safety
          logger.warn('Skipping delete operation', { file: step.file });
          executedSteps.push({
            file: step.file,
            action: step.action,
            success: false,
            reason: 'Delete operations are not supported for safety'
          });
        }
      } catch (error) {
        logger.error('Step execution failed', {
          file: step.file,
          error: error.message
        });

        executedSteps.push({
          file: step.file,
          action: step.action,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = executedSteps.filter(s => s.success).length;
    const success = successCount > 0 && successCount === executedSteps.length;

    logger.logPhase('execute', success ? 'completed' : 'partial', {
      total: executedSteps.length,
      succeeded: successCount
    });

    return {
      success,
      executedSteps,
      filesModified,
      successCount,
      totalSteps: executedSteps.length
    };
  } catch (error) {
    logger.error('Execute phase failed', { error: error.message });
    return {
      success: false,
      error: error.message,
      executedSteps: [],
      filesModified: []
    };
  }
}

export default { executeExecutePhase };
