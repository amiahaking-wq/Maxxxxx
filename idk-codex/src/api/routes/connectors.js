/**
 * Connectors API Routes
 * GET /api/connectors — list all connectors and their status
 */

import express from 'express';
import { listConnectors, initializeConnectors } from '../../agent/connectors.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Initialize connectors on first load
try { initializeConnectors(); } catch (e) { logger.warn('Connector init failed', { error: e.message }); }

router.get('/', (req, res) => {
  try {
    const connectors = listConnectors();
    res.json({ success: true, connectors });
  } catch (err) {
    logger.error('Failed to list connectors', { error: err.message });
    res.status(500).json({ error: 'Failed to list connectors' });
  }
});

export default router;
