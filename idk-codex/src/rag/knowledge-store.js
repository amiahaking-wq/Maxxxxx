/**
 * Knowledge Store — Stage 7C
 *
 * Stores and retrieves documents from Supabase pgvector.
 * Each document is chunked, embedded with all-MiniLM-L6-v2 (384 dims),
 * and stored with its embedding for semantic similarity search.
 *
 * PREREQUISITE: Run sql/pgvector-setup.sql in your Supabase SQL Editor.
 *
 * If Supabase pgvector is not configured, all operations return empty
 * results and the agent falls back to memory_save/memory_get.
 */

import { generateEmbedding, chunkText } from './embedder.js';
import logger from '../utils/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Call Supabase REST API directly (no SDK needed).
 */
async function supabaseFetch(path, method = 'GET', body = null) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
  if (method === 'POST') headers['Prefer'] = 'return=representation';

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${resp.status}: ${text.substring(0, 200)}`);
  }

  if (resp.status === 204) return null;
  return resp.json();
}

/**
 * Convert a JS array to a Postgres vector string: '[0.1,0.2,...]'
 */
function toPgVector(arr) {
  return '[' + arr.join(',') + ']';
}

export const knowledgeStore = {
  /**
   * Add a document to the knowledge base. Auto-chunks long documents.
   * @param {string} userId
   * @param {Object} doc - { title, content, type, source, businessId }
   * @returns {Promise<string>} success message
   */
  async addDocument(userId, doc = {}) {
    if (!isConfigured()) {
      throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_KEY, and run sql/pgvector-setup.sql.');
    }
    if (!doc.title || !doc.content) {
      throw new Error('title and content are required');
    }

    const chunks = chunkText(doc.content);
    let inserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);
      if (!embedding) {
        // Embedder unavailable — skip this chunk but continue
        logger.warn('Embedding failed for chunk, skipping', { chunk: i });
        continue;
      }

      try {
        await supabaseFetch('/max_knowledge_base', 'POST', {
          user_id: userId,
          business_id: doc.businessId || null,
          title: chunks.length > 1 ? `${doc.title} (part ${i + 1}/${chunks.length})` : doc.title,
          content: chunk,
          content_type: doc.type || 'document',
          embedding: toPgVector(embedding),
          source: doc.source || null,
          metadata: { chunk_index: i, total_chunks: chunks.length }
        });
        inserted++;
      } catch (err) {
        logger.error('Knowledge insert failed for chunk', { chunk: i, error: err.message });
      }
    }

    logger.info('Document added to knowledge base', { userId, title: doc.title, chunks: inserted });
    return `Added "${doc.title}" to knowledge base (${inserted} chunk(s) embedded and stored).`;
  },

  /**
   * Search the knowledge base by semantic similarity.
   * @param {string} userId
   * @param {string} query - natural language query
   * @param {number} limit - max results (default 5)
   * @returns {Promise<Array>} matching documents
   */
  async search(userId, query, limit = 5) {
    if (!isConfigured()) return [];

    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];

    try {
      // Call the search_knowledge RPC function
      const url = `${SUPABASE_URL}/rest/v1/rpc/search_knowledge`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query_embedding: toPgVector(queryEmbedding),
          match_user_id: userId,
          match_count: limit,
          match_threshold: 0.6
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        logger.warn('Knowledge search RPC failed, falling back to local search', { status: resp.status, error: text.substring(0, 200) });
        // Fallback: simple text search in Supabase (no vector similarity)
        try {
          const fallbackUrl = `${SUPABASE_URL}/rest/v1/max_knowledge_base?user_id=eq.${encodeURIComponent(userId)}&limit=${limit}&order=created_at.desc`;
          const fallbackResp = await fetch(fallbackUrl, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });
          if (fallbackResp.ok) {
            const allDocs = await fallbackResp.json();
            // Simple text matching: filter by keyword overlap
            const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const matched = (allDocs || []).filter(doc => {
              const content = (doc.content || '').toLowerCase();
              return queryWords.some(w => content.includes(w));
            }).slice(0, limit);
            return matched.map(doc => ({ id: doc.id, title: doc.title, content: doc.content, similarity: 0.5 }));
          }
        } catch (e) {
          logger.warn('Local knowledge search fallback also failed', { error: e.message });
        }
        return [];
      }

      const data = await resp.json();
      return data || [];
    } catch (err) {
      logger.warn('Knowledge search failed', { error: err.message });
      return [];
    }
  },

  /**
   * List all documents in the knowledge base (metadata only).
   */
  async list(userId) {
    if (!isConfigured()) return [];

    try {
      const data = await supabaseFetch(
        `/max_knowledge_base?select=id,title,content_type,source,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`
      );
      return data || [];
    } catch (err) {
      logger.warn('Knowledge list failed', { error: err.message });
      return [];
    }
  },

  /**
   * Delete a document by ID.
   */
  async delete(userId, documentId) {
    if (!isConfigured()) {
      throw new Error('Supabase not configured');
    }
    await supabaseFetch(
      `/max_knowledge_base?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(documentId)}`,
      'DELETE'
    );
    return 'Document deleted from knowledge base.';
  },

  /**
   * Format search results as context for the LLM system prompt.
   */
  formatAsContext(results) {
    if (!results || results.length === 0) return '';
    return '\n\nRelevant knowledge base context:\n' +
      results.map((r, i) =>
        `[${i + 1}] ${r.title} (similarity: ${(r.similarity * 100).toFixed(0)}%):\n${r.content}`
      ).join('\n\n') + '\n';
  },

  /**
   * Check if RAG is available (Supabase configured + embedder loaded).
   */
  async isAvailable() {
    if (!isConfigured()) return false;
    const { isEmbedderAvailable } = await import('./embedder.js');
    return await isEmbedderAvailable();
  }
};

export default knowledgeStore;
