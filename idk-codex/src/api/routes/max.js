/**
 * MAX API Routes
 *
 * REST API endpoints for MAX orchestration:
 * - POST /api/max/task - Submit task to MAX orchestrator
 * - GET /api/max/status/:taskId - Get execution status
 * - GET /api/max/milestones/:taskId - Get milestone graph
 * - POST /api/max/routing - Set routing mode
 */

import express from 'express';
import { MAXController } from '../../agent/max/controller.js';
import { MAXStateManager } from '../../agent/max/state-manager.js';
import { getGateway } from '../../llm/gateway.js';
import logger from '../../utils/logger.js';
import { logAuditEvent } from '../../database/queries.js';

const router = express.Router();
const maxController = new MAXController();
const stateManager = new MAXStateManager();
const gateway = getGateway();

/**
 * POST /api/max/task
 * Submit a task to MAX orchestrator
 */
router.post('/task', async (req, res) => {
  try {
    const { description, sessionId, userId } = req.body;

    if (!description) {
      return res.status(400).json({
        success: false,
        error: 'Task description is required'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    logger.info('MAX task submitted', {
      description: description.substring(0, 100),
      sessionId,
      userId
    });

    // Log audit event
    await logAuditEvent(
      userId,
      sessionId,
      'max_task_submit',
      'Submitted task to MAX orchestrator',
      { description: description.substring(0, 200) },
      'medium'
    );

    // Create task ID
    const taskId = await stateManager.createTask({
      sessionId,
      description,
      userId
    });

    // Execute task asynchronously (don't block response)
    maxController.execute(
      { id: taskId, description, sessionId, userId },
      { sessionId, userId }
    ).then(result => {
      logger.info('MAX task completed', {
        taskId,
        success: result.success
      });

      // Emit WebSocket event (handled by web-gateway)
      if (req.app.locals.io) {
        req.app.locals.io.to(`session-${sessionId}`).emit('max:task:complete', {
          taskId,
          success: result.success,
          data: result.data
        });
      }
    }).catch(error => {
      logger.error('MAX task execution failed', {
        taskId,
        error: error.message
      });

      if (req.app.locals.io) {
        req.app.locals.io.to(`session-${sessionId}`).emit('max:task:failed', {
          taskId,
          error: error.message
        });
      }
    });

    res.json({
      success: true,
      taskId,
      message: 'Task submitted successfully'
    });

  } catch (error) {
    logger.error('Failed to submit MAX task', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/max/status/:taskId
 * Get task execution status
 */
router.get('/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await stateManager.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const stats = await stateManager.getTaskStats(taskId);

    res.json({
      success: true,
      task,
      stats
    });

  } catch (error) {
    logger.error('Failed to get MAX task status', {
      error: error.message,
      taskId: req.params.taskId
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/max/milestones/:taskId
 * Get milestone graph for a task
 */
router.get('/milestones/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.query;

    const milestones = await stateManager.getMilestones(taskId, status || null);

    res.json({
      success: true,
      taskId,
      milestones
    });

  } catch (error) {
    logger.error('Failed to get MAX milestones', {
      error: error.message,
      taskId: req.params.taskId
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/max/routing
 * Set routing mode for LLM gateway
 */
router.post('/routing', async (req, res) => {
  try {
    const { mode, userId, sessionId } = req.body;

    if (!mode) {
      return res.status(400).json({
        success: false,
        error: 'Routing mode is required'
      });
    }

    const validModes = ['autonomous', 'force-gemini', 'force-mobile'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid routing mode. Valid modes: ${validModes.join(', ')}`
      });
    }

    gateway.setRoutingMode(mode);

    logger.info('MAX routing mode changed', {
      mode,
      userId,
      sessionId
    });

    // Log audit event
    if (userId && sessionId) {
      await logAuditEvent(
        userId,
        sessionId,
        'max_routing_change',
        `Changed routing mode to ${mode}`,
        { mode },
        'low'
      );
    }

    res.json({
      success: true,
      mode,
      message: 'Routing mode updated'
    });

  } catch (error) {
    logger.error('Failed to set routing mode', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/max/gateway/status
 * Get gateway status and routing info
 */
router.get('/gateway/status', async (req, res) => {
  try {
    const status = gateway.getStatus();
    const routingMatrix = gateway.getRoutingMatrix();

    res.json({
      success: true,
      status,
      routingMatrix
    });

  } catch (error) {
    logger.error('Failed to get gateway status', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/max/agents
 * Get available micro-agents
 */
router.get('/agents', async (req, res) => {
  try {
    const agents = maxController.getAvailableAgents();

    res.json({
      success: true,
      agents
    });

  } catch (error) {
    logger.error('Failed to get MAX agents', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
