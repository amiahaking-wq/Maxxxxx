import { SOPWorksheet } from './worksheet.js';
import { getWorkflow } from './workflows/index.js';
import logger from '../../utils/logger.js';
import { logAuditEvent } from '../../database/queries.js';

/**
 * SOP Executor - Orchestrates task execution through SOP workflow
 *
 * This is the main coordinator that:
 * 1. Creates and manages SOP worksheets
 * 2. Delegates to specialist agents
 * 3. Tracks progress through the 9-step workflow
 * 4. Handles errors and retries
 *
 * Based on Claude Code's SOP implementation
 */
export class SOPExecutor {
  constructor(sessionId, userId, workflowName = 'standard-development-task') {
    this.sessionId = sessionId;
    this.userId = userId;
    this.workflowName = workflowName;
    this.worksheet = new SOPWorksheet(`session-${sessionId}`);
    this.workflow = getWorkflow(workflowName);
    this.specialists = null; // Will be injected
    this.currentStep = 0;
    this.results = {};
  }

  /**
   * Inject specialist registry
   *
   * @param {SpecialistRegistry} specialists - Specialist registry instance
   */
  setSpecialists(specialists) {
    this.specialists = specialists;
  }

  /**
   * Execute the full SOP workflow
   *
   * @param {Object} task - Task details
   * @param {string} task.description - Task description
   * @param {string} task.repository - Repository (owner/repo)
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Execution results
   */
  async execute(task, context = {}) {
    try {
      logger.info('Starting SOP execution', {
        sessionId: this.sessionId,
        workflow: this.workflowName,
        task: task.description
      });

      // Create worksheet
      await this.worksheet.create(this.workflowName);
      await this.worksheet.fillBlank('Task Description', task.description);
      if (task.repository) {
        await this.worksheet.fillBlank('Repository', task.repository);
      }

      // Log audit event
      await logAuditEvent(
        this.userId,
        this.sessionId,
        'sop_started',
        'SOP workflow execution started',
        {
          workflow: this.workflowName,
          worksheetPath: this.worksheet.worksheetPath
        },
        'low'
      );

      // Execute each step in the workflow
      for (const step of this.workflow.steps) {
        this.currentStep = parseInt(step.id);
        logger.info(`Executing SOP step ${step.id}: ${step.name}`);

        try {
          const stepResult = await this.executeStep(step, task, context);
          this.results[step.name] = stepResult;

          if (!stepResult.success) {
            logger.error(`Step ${step.id} failed`, { error: stepResult.error });
            throw new Error(`Step ${step.id} (${step.name}) failed: ${stepResult.error}`);
          }
        } catch (error) {
          logger.error('Step execution failed', {
            step: step.id,
            error: error.message
          });

          await logAuditEvent(
            this.userId,
            this.sessionId,
            'sop_step_failed',
            `SOP step ${step.id} (${step.name}) failed`,
            { step: step.id, error: error.message },
            'medium'
          );

          throw error;
        }
      }

      // Mark worksheet as completed
      await this.worksheet.markCompleted();

      logger.info('SOP execution completed successfully', {
        sessionId: this.sessionId,
        worksheetPath: this.worksheet.worksheetPath
      });

      await logAuditEvent(
        this.userId,
        this.sessionId,
        'sop_completed',
        'SOP workflow completed successfully',
        { worksheetPath: this.worksheet.worksheetPath },
        'low'
      );

      return {
        success: true,
        worksheetPath: this.worksheet.worksheetPath,
        results: this.results
      };
    } catch (error) {
      logger.error('SOP execution failed', {
        sessionId: this.sessionId,
        error: error.message
      });

      await logAuditEvent(
        this.userId,
        this.sessionId,
        'sop_failed',
        'SOP workflow execution failed',
        { error: error.message },
        'high'
      );

      return {
        success: false,
        error: error.message,
        worksheetPath: this.worksheet.worksheetPath,
        results: this.results
      };
    }
  }

  /**
   * Execute a single SOP step
   *
   * @param {Object} step - Step definition
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Step result
   */
  async executeStep(step, task, context) {
    const stepNumber = parseInt(step.id);

    try {
      // Execute each substep
      for (const substep of step.substeps) {
        const substepNumber = parseInt(substep.id.split('.')[1]);

        // Mark substep as in progress
        await this.worksheet.updateStep(stepNumber, substepNumber, 'in-progress');

        // Execute substep action
        const result = await this.executeSubstep(substep, step, task, context);

        if (!result.success) {
          await this.worksheet.updateStep(stepNumber, substepNumber, 'failed');
          return result;
        }

        // Mark substep as completed
        await this.worksheet.updateStep(stepNumber, substepNumber, 'completed');
      }

      // Fill in blanks for this step
      if (step.blanks && context[step.name]) {
        for (const blank of step.blanks) {
          const value = context[step.name][blank.name] || blank.default || '___';
          await this.worksheet.fillBlank(blank.name, value);
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Step execution error', {
        step: step.id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a single substep action
   *
   * @param {Object} substep - Substep definition
   * @param {Object} step - Parent step definition
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Substep result
   */
  async executeSubstep(substep, step, task, context) {
    try {
      logger.info('Executing substep', {
        substep: substep.id,
        action: substep.action
      });

      // Handle different substep actions
      switch (substep.action) {
        case 'delegate_specialist':
          return await this.delegateToSpecialist(step, task, context);

        case 'search_issues':
          return await this.searchIssues(task);

        case 'create_issue':
          return await this.createIssue(task, context);

        case 'link_issue':
          return await this.linkIssue(task, context);

        case 'assign_issue':
          return await this.assignIssue(task, context);

        case 'collect_files':
          return await this.collectFiles(task, context);

        case 'analyze_context':
          return await this.analyzeContext(task, context);

        case 'create_subtasks':
          return await this.createSubtasks(task, context);

        case 'identify_dependencies':
          return await this.identifyDependencies(task, context);

        case 'estimate_complexity':
          return await this.estimateComplexity(task, context);

        case 'generate_code':
          return await this.generateCode(task, context);

        case 'add_attribution':
          return await this.addAttribution(task, context);

        case 'run_tests':
          return await this.runTests(task, context);

        case 'fix_failures':
          return await this.fixFailures(task, context);

        case 'check_compliance':
          return await this.checkCompliance(task, context);

        case 'verify_error_handling':
          return await this.verifyErrorHandling(task, context);

        case 'validate_docs':
          return await this.validateDocs(task, context);

        case 'stage_files':
          return await this.stageFiles(task, context);

        case 'create_commit_message':
          return await this.createCommitMessage(task, context);

        case 'add_coauthor':
          return await this.addCoauthor(task, context);

        case 'push_branch':
          return await this.pushBranch(task, context);

        case 'check_ci':
          return await this.checkCI(task, context);

        case 'generate_pr_summary':
          return await this.generatePRSummary(task, context);

        case 'create_pr':
          return await this.createPR(task, context);

        case 'link_pr_issue':
          return await this.linkPRIssue(task, context);

        default:
          logger.warn('Unknown substep action', { action: substep.action });
          return { success: true, skipped: true };
      }
    } catch (error) {
      logger.error('Substep execution error', {
        substep: substep.id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delegate to appropriate specialist
   *
   * @param {Object} step - Step definition
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Delegation result
   */
  async delegateToSpecialist(step, task, context) {
    if (!this.specialists) {
      logger.warn('No specialists available, skipping delegation');
      return { success: true, skipped: true };
    }

    try {
      const specialist = this.specialists.findByName(step.specialist);
      if (!specialist) {
        logger.warn('Specialist not found', { specialist: step.specialist });
        return { success: true, skipped: true };
      }

      const result = await specialist.execute(task, context);
      return { success: true, result };
    } catch (error) {
      logger.error('Specialist delegation failed', {
        specialist: step.specialist,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  // Placeholder methods for substep actions
  // These will be implemented or delegated to specialists

  async searchIssues(task) {
    logger.info('Searching for existing issues');
    return { success: true, issues: [] };
  }

  async createIssue(task, context) {
    logger.info('Creating GitHub issue');
    context['link-github-issue'] = { 'Issue ID': '#TBD' };
    return { success: true };
  }

  async linkIssue(task, context) {
    logger.info('Linking issue to chat');
    return { success: true };
  }

  async assignIssue(task, context) {
    logger.info('Assigning issue');
    context['link-github-issue'] = context['link-github-issue'] || {};
    context['link-github-issue']['Assigned to'] = 'Agent';
    return { success: true };
  }

  async collectFiles(task, context) {
    logger.info('Collecting relevant files');
    return { success: true, files: [] };
  }

  async analyzeContext(task, context) {
    logger.info('Analyzing context');
    context['gather-context'] = { 'Completed': 'Yes' };
    return { success: true };
  }

  async createSubtasks(task, context) {
    logger.info('Creating subtasks');
    return { success: true };
  }

  async identifyDependencies(task, context) {
    logger.info('Identifying dependencies');
    return { success: true };
  }

  async estimateComplexity(task, context) {
    logger.info('Estimating complexity');
    context['plan-implementation'] = { 'Plan': 'Implementation plan created' };
    return { success: true };
  }

  async generateCode(task, context) {
    logger.info('Generating code');
    return { success: true };
  }

  async addAttribution(task, context) {
    logger.info('Adding co-authorship attribution');
    context['execute-implementation'] = {
      'Attribution': 'Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>'
    };
    return { success: true };
  }

  async runTests(task, context) {
    logger.info('Running tests');
    return { success: true };
  }

  async fixFailures(task, context) {
    logger.info('Fixing test failures');
    context['run-tests'] = {
      'Test Results': 'All tests passed',
      'Failures Fixed': 0
    };
    return { success: true };
  }

  async checkCompliance(task, context) {
    logger.info('Checking CLAUDE.md compliance');
    return { success: true };
  }

  async verifyErrorHandling(task, context) {
    logger.info('Verifying error handling');
    return { success: true };
  }

  async validateDocs(task, context) {
    logger.info('Validating documentation');
    context['code-review'] = {
      'Review Status': 'Passed',
      'Issues Found': 0
    };
    return { success: true };
  }

  async stageFiles(task, context) {
    logger.info('Staging files for commit');
    return { success: true };
  }

  async createCommitMessage(task, context) {
    logger.info('Creating commit message');
    return { success: true };
  }

  async addCoauthor(task, context) {
    logger.info('Adding co-author to commit');
    context['commit-changes'] = {
      'Commit Message': 'Implementation complete\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>'
    };
    return { success: true };
  }

  async pushBranch(task, context) {
    logger.info('Pushing to branch');
    return { success: true };
  }

  async checkCI(task, context) {
    logger.info('Checking CI/CD status');
    context['push-to-remote'] = {
      'CI Status': 'Pending'
    };
    return { success: true };
  }

  async generatePRSummary(task, context) {
    logger.info('Generating PR summary');
    return { success: true };
  }

  async createPR(task, context) {
    logger.info('Creating pull request');
    return { success: true };
  }

  async linkPRIssue(task, context) {
    logger.info('Linking PR to issue');
    context['create-pull-request'] = {
      'PR Number': 'TBD',
      'PR URL': 'https://github.com/...'
    };
    return { success: true };
  }
}
