/**
 * Repair Engine
 * Applies targeted patches and auto-commits fixes
 */

import { executeCommandSafely } from '../security/sandbox.js';
import { completion } from '../llm/adapter.js';
import { readFileSafe, writeFileSafe } from '../utils/filesystem.js';
import { learnFromSuccess } from '../agent/error-learning.js';
import logger from '../utils/logger.js';
import path from 'path';

export class RepairEngine {
  constructor(workspacePath = process.env.SANDBOX_WORKSPACE || './sandbox-workspace') {
    this.workspacePath = workspacePath;
    this.maxRetries = parseInt(process.env.ERROR_RESOLUTION_MAX_RETRIES || '5', 10);
    this.autoCommit = process.env.AUTO_COMMIT_FIXES === 'true';
  }

  /**
   * Attempt to repair error based on diagnostics
   */
  async repairError(errorInfo, diagnostics, budgetManager = null) {
    logger.info('Attempting error repair', {
      errorType: errorInfo.type,
      recommendationCount: diagnostics.recommendations.length
    });

    const repairSteps = [];

    // Execute recommended fixes
    for (const recommendation of diagnostics.recommendations) {
      try {
        const result = await this.executeRecommendation(recommendation);
        repairSteps.push({
          recommendation,
          success: result.success,
          output: result.output
        });

        if (!result.success) {
          logger.warn('Recommendation failed', {
            action: recommendation.action,
            error: result.error
          });
        }
      } catch (error) {
        logger.error('Failed to execute recommendation', {
          action: recommendation.action,
          error: error.message
        });
        repairSteps.push({
          recommendation,
          success: false,
          error: error.message
        });
      }
    }

    // If automatic recommendations didn't work, use AI to generate fix
    if (repairSteps.every(step => !step.success) && diagnostics.configIssues.length > 0) {
      logger.info('Automatic fixes failed, trying AI-generated fix');
      const aiFix = await this.generateAIFix(errorInfo, diagnostics, budgetManager);
      if (aiFix) {
        repairSteps.push(aiFix);
      }
    }

    // Verify fix worked
    const fixWorked = repairSteps.some(step => step.success);

    if (fixWorked) {
      logger.info('Error repair successful');

      // Learn from this success
      const fixDescription = repairSteps
        .filter(s => s.success)
        .map(s => s.recommendation.description || s.recommendation.action)
        .join('; ');

      await learnFromSuccess(errorInfo.message, fixDescription);

      // Auto-commit if enabled
      if (this.autoCommit) {
        await this.commitFix(errorInfo, repairSteps);
      }
    }

    return {
      success: fixWorked,
      repairSteps,
      message: fixWorked
        ? 'Error successfully repaired'
        : 'Unable to repair error automatically'
    };
  }

  /**
   * Execute a recommendation
   */
  async executeRecommendation(recommendation) {
    logger.debug('Executing recommendation', { action: recommendation.action });

    switch (recommendation.action) {
      case 'install_dependency':
      case 'reinstall_dependencies':
      case 'clean_build':
        return await this.executeCommand(recommendation.command);

      case 'kill_port':
        return await this.executeCommand(recommendation.command);

      case 'add_build_tools':
        return await this.applyPatch(recommendation);

      default:
        logger.warn('Unknown recommendation action', { action: recommendation.action });
        return { success: false, error: 'Unknown action' };
    }
  }

  /**
   * Execute command safely
   */
  async executeCommand(command) {
    try {
      logger.info('Executing repair command', { command });

      const [cmd, ...args] = command.split(' ');
      const result = await executeCommandSafely(cmd, args, {
        cwd: this.workspacePath,
        timeout: 300000 // 5 minutes
      });

      return {
        success: result.success,
        output: result.output || result.error,
        command
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        command
      };
    }
  }

  /**
   * Apply a code patch
   */
  async applyPatch(recommendation) {
    try {
      if (!recommendation.patch || !recommendation.file) {
        return { success: false, error: 'Invalid patch recommendation' };
      }

      const filePath = path.join(this.workspacePath, recommendation.file);
      const content = await readFileSafe(filePath);

      if (!content) {
        return { success: false, error: 'File not found' };
      }

      // Simple patch application (add line if not present)
      if (!content.includes(recommendation.patch)) {
        const updatedContent = content + '\n' + recommendation.patch + '\n';
        await writeFileSafe(filePath, updatedContent);

        logger.info('Patch applied', { file: recommendation.file });
        return { success: true, file: recommendation.file };
      }

      return { success: true, message: 'Patch already applied' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate AI-based fix
   */
  async generateAIFix(errorInfo, diagnostics, budgetManager) {
    try {
      logger.info('Generating AI fix for error');

      const prompt = `You are an expert software engineer fixing a production error.

Error Details:
${JSON.stringify(errorInfo, null, 2)}

Diagnostic Results:
${JSON.stringify(diagnostics, null, 2)}

Provide a step-by-step fix in JSON format:
{
  "diagnosis": "Root cause explanation",
  "fixSteps": [
    { "action": "command or edit", "description": "what to do", "command": "if applicable" }
  ],
  "verification": "How to verify the fix worked"
}`;

      const result = await completion({
        messages: [
          { role: 'system', content: 'You are an expert debugging assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        budgetManager
      });

      const fixPlan = JSON.parse(result.content);

      logger.info('AI fix generated', { stepCount: fixPlan.fixSteps?.length });

      return {
        success: false, // Will be updated if fix works
        aiFix: fixPlan,
        recommendation: { action: 'ai_generated_fix', description: fixPlan.diagnosis }
      };
    } catch (error) {
      logger.error('Failed to generate AI fix', { error: error.message });
      return null;
    }
  }

  /**
   * Commit fix to git
   */
  async commitFix(errorInfo, repairSteps) {
    try {
      logger.info('Auto-committing error fix');

      const successfulSteps = repairSteps.filter(s => s.success);
      const fixDescription = successfulSteps
        .map(s => s.recommendation.description || s.recommendation.action)
        .join(', ');

      const commitMessage = `fix: auto-resolve ${errorInfo.type}

${errorInfo.message}

Applied fixes:
${successfulSteps.map((s, i) => `${i + 1}. ${s.recommendation.description}`).join('\n')}

Co-Authored-By: Error Resolution Engine <noreply@agent.com>`;

      // Stage all changes
      await executeCommandSafely('git', ['add', '.'], { cwd: this.workspacePath });

      // Commit
      await executeCommandSafely('git', ['commit', '-m', commitMessage], {
        cwd: this.workspacePath
      });

      logger.info('Fix committed successfully');
      return true;
    } catch (error) {
      logger.error('Failed to commit fix', { error: error.message });
      return false;
    }
  }
}

export default RepairEngine;
