/**
 * Repository API Routes
 * Handles fetching repos from GitHub and selecting active repo
 */

import express from 'express';
import logger from '../../utils/logger.js';
import { getDatabase } from '../../database/db.js';
import { Octokit } from '@octokit/rest';

const router = express.Router();

/**
 * GET /api/repos/list
 * Fetch repositories from GitHub
 */
router.get('/list', async (req, res) => {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    logger.info('API', {
      method: 'GET',
      path: '/api/repos/list'
    });

    // Fetch user's repos
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 50
    });

    // Get current selection from database (use default user for web)
    const db = getDatabase();
    const userPref = db.prepare(`
      SELECT repo_owner, repo_name
      FROM user_preferences
      WHERE user_id = ?
    `).get('web_user');

    const currentRepo = userPref ? {
      owner: userPref.repo_owner,
      name: userPref.repo_name
    } : null;

    logger.info('API', {
      method: 'GET',
      path: '/api/repos/list',
      status: 200,
      count: repos.length
    });

    res.json({
      repos,
      currentRepo
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'GET',
      path: '/api/repos/list',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to fetch repositories',
      code: 'REPOS_FETCH_ERROR'
    });
  }
});

/**
 * POST /api/repos/select
 * Select a repository to work on
 */
router.post('/select', async (req, res) => {
  try {
    const { owner, repo } = req.body;

    logger.info('API', {
      method: 'POST',
      path: '/api/repos/select',
      body: { owner, repo }
    });

    if (!owner || !repo) {
      return res.status(400).json({
        error: 'owner and repo are required',
        code: 'MISSING_PARAMS'
      });
    }

    const db = getDatabase();

    // Save selection (use default user for web)
    db.prepare(`
      INSERT INTO user_preferences (user_id, repo_owner, repo_name, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        repo_owner = excluded.repo_owner,
        repo_name = excluded.repo_name,
        updated_at = excluded.updated_at
    `).run('web_user', owner, repo, new Date().toISOString());

    logger.info('REPO_SELECTED', { owner, repo });

    logger.info('API', {
      method: 'POST',
      path: '/api/repos/select',
      status: 200
    });

    res.json({
      success: true,
      repo: { owner, repo }
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'POST',
      path: '/api/repos/select',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to select repository',
      code: 'REPO_SELECT_ERROR'
    });
  }
});

export default router;
