import { generateCode, analyzeCode } from '../../groq/client.js';
import { buildSelfReviewContext } from '../../groq/prompts.js';
import { writeFileSafe, readFileSafe, existsSafe } from '../../utils/filesystem.js';
import { generateCompletion } from '../../groq/client.js';
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

          // Check token budget before expensive AI call
          if (context.budgetManager) {
            const estimatedInputTokens = Math.ceil((prompt.length + JSON.stringify(context.messages || []).length) / 4);
            const budgetCheck = context.budgetManager.checkBudget(estimatedInputTokens, 2000);
            if (!budgetCheck.allowed) {
              logger.warn('Insufficient token budget in execute phase', budgetCheck);
              throw new Error(`Token budget exceeded: ${budgetCheck.reason}`);
            }
          }

          code = await generateCode(prompt, context.messages || [], context.budgetManager);

          // Extract code from markdown if present
          const codeMatch = code.match(/```(?:javascript|js|typescript|ts|jsx|tsx)?\n?([\s\S]*?)```/);
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
