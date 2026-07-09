import { SpecialistAgent } from './base.js';
import { executePlanPhase } from '../phases/plan.js';
import { getRecentMessages } from '../../database/queries.js';
import { readFileSafe } from '../../utils/filesystem.js';
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Context Specialist
 *
 * Handles context gathering and analysis:
 * - Collecting relevant files
 * - Analyzing codebase
 * - Understanding task requirements
 * - Planning implementation approach
 *
 * Based on Claude Code's context specialist implementation
 */
export class ContextSpecialist extends SpecialistAgent {
  constructor() {
    super(
      'context',
      ['gather', 'analyze', 'understand', 'plan', 'context', 'files', 'research'],
      'Handles context gathering, analysis, and planning'
    );
  }

  /**
   * Execute context task
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, context) {
    try {
      const taskStr = typeof task === 'string' ? task : task.description || '';
      this.log('Executing context task', { task: taskStr });

      // Route to appropriate handler
      if (taskStr.toLowerCase().includes('gather') ||
          taskStr.toLowerCase().includes('collect')) {
        return await this.gatherContext(task, context);
      } else if (taskStr.toLowerCase().includes('analyze')) {
        return await this.analyzeContext(task, context);
      } else if (taskStr.toLowerCase().includes('plan')) {
        return await this.planImplementation(task, context);
      } else {
        // Default to full context gathering
        return await this.gatherContext(task, context);
      }
    } catch (error) {
      this.logError('Context task failed', error, { task });
      return this.failure(error.message, { task });
    }
  }

  /**
   * Gather context from various sources
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Context gathering result
   */
  async gatherContext(task, context) {
    try {
      this.log('Gathering context');

      const gathered = {
        files: [],
        messages: [],
        structure: null,
        summary: ''
      };

      // Get recent messages if session available
      if (context.sessionId) {
        gathered.messages = await getRecentMessages(context.sessionId, 20);
      }

      // Collect relevant files
      if (context.workingDir) {
        gathered.files = await this.collectRelevantFiles(
          context.workingDir,
          task
        );
      }

      // Analyze directory structure
      if (context.workingDir) {
        gathered.structure = await this.analyzeStructure(context.workingDir);
      }

      // Create summary
      gathered.summary = this.createContextSummary(gathered);

      return this.success(
        gathered,
        'Context gathered successfully'
      );
    } catch (error) {
      this.logError('Failed to gather context', error);
      return this.failure(error.message);
    }
  }

  /**
   * Analyze gathered context
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeContext(task, context) {
    try {
      this.log('Analyzing context');

      const analysis = {
        complexity: 'medium',
        relevantFiles: [],
        dependencies: [],
        risks: [],
        recommendations: []
      };

      // Analyze files if provided
      if (context.files && context.files.length > 0) {
        analysis.relevantFiles = context.files;
        analysis.complexity = this.estimateComplexity(context.files);
      }

      // Identify dependencies
      if (context.workingDir) {
        analysis.dependencies = await this.identifyDependencies(
          context.workingDir
        );
      }

      // Identify potential risks
      analysis.risks = this.identifyRisks(task, context);

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis);

      return this.success(
        analysis,
        'Context analysis completed'
      );
    } catch (error) {
      this.logError('Failed to analyze context', error);
      return this.failure(error.message);
    }
  }

  /**
   * Plan implementation approach
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Planning result
   */
  async planImplementation(task, context) {
    try {
      this.log('Planning implementation');

      const taskDescription = typeof task === 'string' ? task : task.description;

      // Use existing plan phase
      const planResult = await executePlanPhase(
        taskDescription,
        context.budgetManager
      );

      if (!planResult.success) {
        return this.failure(planResult.error || 'Planning failed');
      }

      return this.success(
        {
          plan: planResult.plan,
          filesNeeded: planResult.filesNeeded || [],
          steps: this.extractSteps(planResult.plan)
        },
        'Implementation plan created'
      );
    } catch (error) {
      this.logError('Failed to plan implementation', error);
      return this.failure(error.message);
    }
  }

  /**
   * Collect relevant files for the task
   *
   * @param {string} workingDir - Working directory
   * @param {Object} task - Task details
   * @returns {Promise<Array<string>>} List of relevant files
   */
  async collectRelevantFiles(workingDir, task) {
    try {
      const files = [];
      const taskStr = typeof task === 'string' ? task.toLowerCase() : task.description?.toLowerCase() || '';

      // Always include key project files
      const keyFiles = [
        'package.json',
        'README.md',
        'CLAUDE.md',
        '.env.example'
      ];

      for (const file of keyFiles) {
        const filepath = path.join(workingDir, file);
        if (fs.existsSync(filepath)) {
          files.push(filepath);
        }
      }

      // Search for files mentioned in task
      const words = taskStr.split(/\s+/);
      for (const word of words) {
        if (word.includes('.js') || word.includes('.ts') || word.includes('.json')) {
          const filepath = path.join(workingDir, word);
          if (fs.existsSync(filepath)) {
            files.push(filepath);
          }
        }
      }

      return [...new Set(files)]; // Remove duplicates
    } catch (error) {
      logger.error('Failed to collect relevant files', { error: error.message });
      return [];
    }
  }

  /**
   * Analyze directory structure
   *
   * @param {string} workingDir - Working directory
   * @returns {Promise<Object>} Structure analysis
   */
  async analyzeStructure(workingDir) {
    try {
      const structure = {
        type: 'unknown',
        framework: null,
        testFramework: null,
        hasTests: false,
        hasDocker: false
      };

      // Check for package.json
      const packagePath = path.join(workingDir, 'package.json');
      if (fs.existsSync(packagePath)) {
        structure.type = 'nodejs';
        const pkg = JSON.parse(await fs.promises.readFile(packagePath, 'utf-8'));

        // Detect framework
        if (pkg.dependencies?.express) structure.framework = 'express';
        if (pkg.dependencies?.react) structure.framework = 'react';
        if (pkg.dependencies?.vue) structure.framework = 'vue';

        // Detect test framework
        if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
          structure.testFramework = 'jest';
        }
        if (pkg.devDependencies?.mocha || pkg.dependencies?.mocha) {
          structure.testFramework = 'mocha';
        }

        structure.hasTests = !!structure.testFramework;
      }

      // Check for Docker
      structure.hasDocker = fs.existsSync(path.join(workingDir, 'Dockerfile'));

      return structure;
    } catch (error) {
      logger.error('Failed to analyze structure', { error: error.message });
      return { type: 'unknown' };
    }
  }

  /**
   * Create context summary
   *
   * @param {Object} gathered - Gathered context
   * @returns {string} Context summary
   */
  createContextSummary(gathered) {
    const parts = [];

    parts.push(`Files: ${gathered.files.length} relevant files found`);

    if (gathered.structure) {
      parts.push(`Project type: ${gathered.structure.type}`);
      if (gathered.structure.framework) {
        parts.push(`Framework: ${gathered.structure.framework}`);
      }
    }

    parts.push(`Messages: ${gathered.messages.length} recent messages analyzed`);

    return parts.join(', ');
  }

  /**
   * Estimate task complexity
   *
   * @param {Array<string>} files - Files to analyze
   * @returns {string} Complexity level (low, medium, high)
   */
  estimateComplexity(files) {
    if (files.length === 0) return 'low';
    if (files.length <= 3) return 'medium';
    return 'high';
  }

  /**
   * Identify project dependencies
   *
   * @param {string} workingDir - Working directory
   * @returns {Promise<Array<string>>} List of dependencies
   */
  async identifyDependencies(workingDir) {
    try {
      const packagePath = path.join(workingDir, 'package.json');
      if (!fs.existsSync(packagePath)) {
        return [];
      }

      const pkg = JSON.parse(await fs.promises.readFile(packagePath, 'utf-8'));
      return Object.keys(pkg.dependencies || {});
    } catch (error) {
      return [];
    }
  }

  /**
   * Identify potential risks
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Array<string>} List of risks
   */
  identifyRisks(task, context) {
    const risks = [];

    if (!context.workingDir) {
      risks.push('No working directory specified');
    }

    if (!context.budgetManager) {
      risks.push('No token budget manager available');
    }

    return risks;
  }

  /**
   * Generate recommendations
   *
   * @param {Object} analysis - Analysis result
   * @returns {Array<string>} List of recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.complexity === 'high') {
      recommendations.push('Consider breaking task into smaller subtasks');
    }

    if (analysis.risks.length > 0) {
      recommendations.push('Address identified risks before proceeding');
    }

    return recommendations;
  }

  /**
   * Extract steps from plan
   *
   * @param {string} plan - Plan text
   * @returns {Array<string>} List of steps
   */
  extractSteps(plan) {
    // Simple step extraction - look for numbered or bulleted lists
    const lines = plan.split('\n');
    const steps = [];

    for (const line of lines) {
      if (/^\d+\./.test(line.trim()) || /^[-*]/.test(line.trim())) {
        steps.push(line.trim());
      }
    }

    return steps;
  }
}
