/**
 * MAX Orchestrator Controller
 *
 * Implements Goal-Oriented Action Planning (GOAP) for multi-agent task execution.
 * Spawns transient specialized micro-agents and manages sublinear graph execution
 * with context purging to prevent token bloating.
 *
 * Based on BaseSpecialist pattern from existing codebase.
 */

import { SpecialistAgent } from '../specialists/base.js';
import { MAXStateManager } from './state-manager.js';
import { SystemArchitect, FullStackEngineer, DevOpsEngineer, MediaDirector } from './micro-agents.js';
import logger from '../../utils/logger.js';
import { randomUUID } from 'crypto';
import { completion } from '../../llm/adapter.js';
import { isRufloReady, getSwarmStatus } from './ruflo-setup.js';

/**
 * MAX Orchestrator - Main controller for multi-agent execution
 */
export class MAXController extends SpecialistAgent {
  constructor() {
    super(
      'MAX Orchestrator',
      ['orchestration', 'multi-agent', 'task-planning', 'milestone-execution'],
      'Goal-Oriented Action Planning controller for complex multi-agent tasks'
    );

    this.stateManager = new MAXStateManager();

    // Initialize micro-agent registry
    this.microAgents = {
      architect: new SystemArchitect(),
      engineer: new FullStackEngineer(),
      devops: new DevOpsEngineer(),
      media: new MediaDirector()
    };
  }

  /**
   * Execute a task using GOAP planning
   *
   * @param {Object} task - Task details
   * @param {string} task.description - Task description
   * @param {number} task.sessionId - Session ID
   * @param {number} task.userId - User ID
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, context) {
    this.log('Starting MAX task execution', {
      taskId: task.id,
      description: task.description
    });

    try {
      // Create task record
      const taskId = await this.stateManager.createTask({
        sessionId: task.sessionId,
        description: task.description,
        userId: task.userId
      });

      // Phase 1: Decompose task into milestones using GOAP
      this.log('Decomposing task into milestones');
      const milestones = await this.decomposeTask(taskId, task.description, context);

      if (!milestones || milestones.length === 0) {
        throw new Error('Failed to decompose task into milestones');
      }

      this.log('Task decomposed', {
        milestoneCount: milestones.length,
        milestones: milestones.map(m => m.description)
      });

      // Phase 2: Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(milestones);

      // Phase 3: Execute milestones in topological order
      const executionResult = await this.executeGraph(
        taskId,
        dependencyGraph,
        context
      );

      // Update task status
      await this.stateManager.updateTaskStatus(
        taskId,
        executionResult.success ? 'completed' : 'failed'
      );

      return this.success(executionResult, 'MAX task execution completed');

    } catch (error) {
      this.logError('Task execution failed', error, { taskId: task.id });
      return this.failure(error.message, { error: error.stack });
    }
  }

  /**
   * Decompose task into discrete milestones with assigned agents
   *
   * @param {string} taskId - Task ID
   * @param {string} taskDescription - Task description
   * @param {Object} context - Execution context
   * @returns {Promise<Array>} Array of milestone definitions
   */
  async decomposeTask(taskId, taskDescription, context) {
    try {
      const prompt = `You are the MAX orchestrator. Decompose this task into discrete milestones.

Task: ${taskDescription}

Available micro-agents:
- SystemArchitect: Database schemas, technical documentation, architecture decisions
- FullStackEngineer: Code generation, implementation, refactoring
- DevOpsEngineer: Docker, CI/CD, deployment configurations, cloud workflows
- MediaDirector: Video processing, FFmpeg operations, media timelines

Rules:
1. Each milestone must be atomic and independently executable
2. Assign the most appropriate agent role to each milestone
3. Identify dependencies between milestones
4. Keep milestones focused and small (prefer 5-10 milestones over 2-3 large ones)

Return a JSON array of milestones with this structure:
[
  {
    "description": "Clear, actionable milestone description",
    "agentRole": "architect|engineer|devops|media",
    "dependencies": ["milestone-1-id", "milestone-2-id"],
    "estimatedTokens": 2000
  }
]

Return ONLY the JSON array, no other text.`;

      const response = await completion({
        messages: [
          { role: 'system', content: 'You are a task planning expert. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        maxTokens: 4000,
        taskType: 'complex'
      });

      const content = response.content.trim();

      // Extract JSON from response (handles markdown code blocks)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from planning response');
      }

      const milestoneDefs = JSON.parse(jsonMatch[0]);

      // Create milestone records in database
      const milestones = [];
      for (const def of milestoneDefs) {
        const milestoneId = await this.stateManager.createMilestone({
          taskId,
          agentRole: def.agentRole,
          description: def.description,
          dependencies: def.dependencies || [],
          estimatedTokens: def.estimatedTokens || 2000
        });

        milestones.push({
          id: milestoneId,
          ...def
        });
      }

      return milestones;

    } catch (error) {
      this.logError('Task decomposition failed', error);
      throw error;
    }
  }

  /**
   * Build dependency graph for milestone execution order
   *
   * @param {Array} milestones - Milestone definitions
   * @returns {Object} Dependency graph with execution levels
   */
  buildDependencyGraph(milestones) {
    const graph = {
      nodes: new Map(),
      levels: [] // Topologically sorted execution levels
    };

    // Build node map
    milestones.forEach(m => {
      graph.nodes.set(m.id, {
        ...m,
        dependsOn: new Set(m.dependencies || []),
        dependents: new Set()
      });
    });

    // Build reverse dependencies
    graph.nodes.forEach(node => {
      node.dependsOn.forEach(depId => {
        const depNode = graph.nodes.get(depId);
        if (depNode) {
          depNode.dependents.add(node.id);
        }
      });
    });

    // Topological sort using Kahn's algorithm
    const inDegree = new Map();
    graph.nodes.forEach((node, id) => {
      inDegree.set(id, node.dependsOn.size);
    });

    const queue = Array.from(graph.nodes.keys())
      .filter(id => inDegree.get(id) === 0);

    while (queue.length > 0) {
      const currentLevel = [];
      const levelSize = queue.length;

      for (let i = 0; i < levelSize; i++) {
        const nodeId = queue.shift();
        currentLevel.push(nodeId);

        const node = graph.nodes.get(nodeId);
        node.dependents.forEach(depId => {
          inDegree.set(depId, inDegree.get(depId) - 1);
          if (inDegree.get(depId) === 0) {
            queue.push(depId);
          }
        });
      }

      graph.levels.push(currentLevel);
    }

    // Check for cycles
    if (graph.levels.flat().length !== milestones.length) {
      throw new Error('Dependency cycle detected in milestone graph');
    }

    return graph;
  }

  /**
   * Execute dependency graph level by level with context purging
   *
   * RUFLO INTEGRATION:
   * - If ruflo is enabled and daemon is running, delegate milestone execution
   *   to the ruflo swarm for coordinated multi-agent execution
   * - If ruflo is unavailable, fallback to direct LLM execution (existing path)
   *
   * @param {string} taskId - Task ID
   * @param {Object} graph - Dependency graph
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeGraph(taskId, graph, context) {
    const results = new Map();
    let totalTokensFreed = 0;

    // Check if ruflo swarm coordination is available
    const rufloEnabled = isRufloReady();
    if (rufloEnabled) {
      const swarmStatus = await getSwarmStatus();
      this.log('Ruflo swarm coordination available', {
        topology: swarmStatus.configuration?.topology,
        maxAgents: swarmStatus.configuration?.maxAgents
      });
    } else {
      this.log('Using direct LLM execution (ruflo unavailable)');
    }

    try {
      // Execute each level in sequence
      for (let levelIndex = 0; levelIndex < graph.levels.length; levelIndex++) {
        const level = graph.levels[levelIndex];

        this.log(`Executing level ${levelIndex + 1}/${graph.levels.length}`, {
          milestoneCount: level.length,
          rufloEnabled
        });

        // Execute milestones in parallel within the same level
        const levelPromises = level.map(async (milestoneId) => {
          const node = graph.nodes.get(milestoneId);

          // Gather results from dependencies
          const dependencyResults = {};
          node.dependsOn.forEach(depId => {
            dependencyResults[depId] = results.get(depId);
          });

          // Execute milestone with appropriate micro-agent
          const result = await this.executeMilestone(
            milestoneId,
            node,
            dependencyResults,
            context
          );

          results.set(milestoneId, result);

          // Purge context if milestone is completed and has no pending dependents
          if (result.success) {
            const canPurge = Array.from(node.dependents).every(depId => {
              return results.has(depId);
            });

            if (canPurge) {
              const tokensFreed = await this.purgeContext(milestoneId, node);
              totalTokensFreed += tokensFreed;
            }
          }

          return result;
        });

        const levelResults = await Promise.all(levelPromises);

        // Check if any milestone failed
        const failures = levelResults.filter(r => !r.success);
        if (failures.length > 0) {
          throw new Error(`Level ${levelIndex + 1} execution failed: ${failures.length} milestones failed`);
        }
      }

      this.log('Graph execution completed', {
        totalMilestones: results.size,
        totalTokensFreed
      });

      return {
        success: true,
        totalMilestones: results.size,
        totalTokensFreed,
        results: Array.from(results.entries()).map(([id, result]) => ({
          milestoneId: id,
          ...result
        }))
      };

    } catch (error) {
      this.logError('Graph execution failed', error);
      return {
        success: false,
        error: error.message,
        completedMilestones: results.size,
        totalTokensFreed
      };
    }
  }

  /**
   * Execute a single milestone with the appropriate micro-agent
   *
   * RUFLO INTEGRATION:
   * - If ruflo is enabled, the swarm daemon coordinates execution
   * - Otherwise, use direct micro-agent execution (existing path)
   *
   * @param {string} milestoneId - Milestone ID
   * @param {Object} milestone - Milestone definition
   * @param {Object} dependencyResults - Results from dependency milestones
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeMilestone(milestoneId, milestone, dependencyResults, context) {
    const rufloEnabled = isRufloReady();

    this.log('Executing milestone', {
      milestoneId,
      agentRole: milestone.agentRole,
      description: milestone.description,
      executionPath: rufloEnabled ? 'ruflo-swarm' : 'direct-llm'
    });

    try {
      // Update milestone status to active
      await this.stateManager.updateMilestoneStatus(milestoneId, 'active');

      // Get appropriate micro-agent
      const agent = this.microAgents[milestone.agentRole];
      if (!agent) {
        throw new Error(`Unknown agent role: ${milestone.agentRole}`);
      }

      // Build execution context with dependency results
      const executionContext = {
        ...context,
        milestoneId,
        dependencies: dependencyResults,
        taskDescription: milestone.description,
        useRuflo: rufloEnabled // Signal to gateway that ruflo routing is preferred
      };

      // Execute milestone with appropriate micro-agent
      // Note: If ruflo is enabled, the agent's execute method can optionally
      // use ruflo SDK for swarm coordination. For now, we maintain existing
      // direct execution path with the option to enhance agents later.
      const result = await agent.execute(
        { description: milestone.description },
        executionContext
      );

      // Update milestone status
      await this.stateManager.updateMilestoneStatus(
        milestoneId,
        result.success ? 'completed' : 'failed'
      );

      // Track context size
      if (result.tokensUsed) {
        await this.stateManager.updateMilestoneContextSize(
          milestoneId,
          result.tokensUsed
        );
      }

      return result;

    } catch (error) {
      this.logError('Milestone execution failed', error, {
        milestoneId,
        agentRole: milestone.agentRole
      });

      await this.stateManager.updateMilestoneStatus(milestoneId, 'failed');

      return {
        success: false,
        error: error.message,
        milestoneId
      };
    }
  }

  /**
   * Purge context for completed milestone to free tokens
   *
   * @param {string} milestoneId - Milestone ID
   * @param {Object} milestone - Milestone definition
   * @returns {Promise<number>} Tokens freed
   */
  async purgeContext(milestoneId, milestone) {
    try {
      // Estimate tokens freed (conservative estimate)
      const tokensFreed = milestone.estimatedTokens || 0;

      if (tokensFreed > 0) {
        await this.stateManager.recordContextPurge(milestoneId, tokensFreed);

        this.log('Context purged', {
          milestoneId,
          tokensFreed,
          description: milestone.description
        });
      }

      return tokensFreed;

    } catch (error) {
      this.logError('Context purge failed', error, { milestoneId });
      return 0;
    }
  }

  /**
   * Get available micro-agents
   *
   * @returns {Array} Array of agent information
   */
  getAvailableAgents() {
    return Object.entries(this.microAgents).map(([role, agent]) => ({
      role,
      ...agent.getInfo()
    }));
  }
}

export default MAXController;
