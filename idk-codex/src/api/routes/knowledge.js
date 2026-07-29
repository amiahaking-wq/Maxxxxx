/**
 * Knowledge Base API Routes
 *
 * GET    /api/knowledge           — list all knowledge docs for the current user
 * POST   /api/knowledge           — add a new knowledge doc
 * DELETE /api/knowledge/:id       — delete a knowledge doc
 * POST   /api/knowledge/search    — search the knowledge base
 *
 * These routes wrap the knowledgeStore RAG module so the frontend Settings
 * panel can manage the knowledge base.
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

/**
 * GET /api/knowledge — list all knowledge docs for the current user.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { knowledgeStore } = await import('../../rag/knowledge-store.js');
    const docs = await knowledgeStore.list(userId);
    res.json({ success: true, docs });
  } catch (e) {
    logger.warn('Knowledge list failed', { error: e.message });
    res.json({ success: true, docs: [], error: e.message });
  }
});

/**
 * POST /api/knowledge — add a knowledge doc.
 * Body: { title, content, type?, source? }
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, type, source } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const { knowledgeStore } = await import('../../rag/knowledge-store.js');
    const result = await knowledgeStore.addDocument(userId, { title, content, type, source });
    res.json({ success: true, result });
  } catch (e) {
    logger.error('Knowledge add failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/knowledge/search — search the knowledge base.
 * Body: { query }
 */
router.post('/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const { knowledgeStore } = await import('../../rag/knowledge-store.js');
    const results = await knowledgeStore.search(userId, query);
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/knowledge/:id — delete a knowledge doc.
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { knowledgeStore } = await import('../../rag/knowledge-store.js');
    const result = await knowledgeStore.delete(userId, req.params.id);
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
