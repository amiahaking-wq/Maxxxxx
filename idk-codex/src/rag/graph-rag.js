/**
 * Graph RAG Module (Phase 12 — Graph RAG)
 *
 * Combines vector search (semantic similarity) with graph traversal
 * (explicit relationships) for superior retrieval.
 *
 * - Vector DB finds things that are SIMILAR (semantic meaning)
 * - Graph DB  finds things that are CONNECTED (explicit relationships)
 * - Graph RAG combines both: "find docs about X, then show me who/what X is connected to"
 *
 * Uses Apache AGE (Postgres extension) on Supabase — same database as vector store.
 * Falls back to vector-only search if Apache AGE is not installed.
 */

import logger from '../utils/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

async function supabaseRPC(functionName, params) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(params)
    });
    if (!resp.ok) {
      const text = await resp.text();
      logger.warn(`Supabase RPC ${functionName} failed`, { status: resp.status, error: text.substring(0, 200) });
      return null;
    }
    return resp.json();
  } catch (e) {
    logger.warn(`Supabase RPC ${functionName} error`, { error: e.message });
    return null;
  }
}

/**
 * Add a relationship to the knowledge graph.
 * Creates nodes if they don't exist, then creates the edge.
 *
 * @param {string} userId
 * @param {Object} rel - { fromType, fromName, toType, toName, edgeType, properties }
 * @returns {string} result message
 */
export async function addRelationship(userId, rel) {
  const result = await supabaseRPC('add_graph_relationship', {
    p_user_id: userId,
    p_from_type: rel.fromType || 'Concept',
    p_from_name: rel.fromName,
    p_to_type: rel.toType || 'Concept',
    p_to_name: rel.toName,
    p_edge_type: rel.edgeType || 'RELATED_TO',
    p_properties: rel.properties || {}
  });

  if (result === null) {
    // Fallback: store in SQLite memory as a key-value pair
    try {
      const { getDatabase } = await import('../database/db.js');
      const db = getDatabase();
      db.prepare(`CREATE TABLE IF NOT EXISTS max_graph_fallback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        from_name TEXT, from_type TEXT,
        to_name TEXT, to_type TEXT,
        edge_type TEXT,
        properties TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();
      db.prepare(`INSERT INTO max_graph_fallback
        (user_id, from_name, from_type, to_name, to_type, edge_type, properties)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        userId, rel.fromName, rel.fromType || 'Concept',
        rel.toName, rel.toType || 'Concept',
        rel.edgeType || 'RELATED_TO',
        JSON.stringify(rel.properties || {})
      );
      return `Relationship saved (fallback mode): ${rel.fromName} --${rel.edgeType}--> ${rel.toName}`;
    } catch (e) {
      return `Failed to save relationship: ${e.message}`;
    }
  }

  return `Relationship added: ${rel.fromName} (${rel.fromType}) --${rel.edgeType}--> ${rel.toName} (${rel.toType})`;
}

/**
 * Find all relationships for a node (multi-hop graph traversal).
 *
 * @param {string} userId
 * @param {string} nodeName - name to search for (partial match)
 * @param {number} maxDepth - how many hops to follow (default 3)
 * @returns {Array} list of relationships
 */
export async function findRelationships(userId, nodeName, maxDepth = 3) {
  const result = await supabaseRPC('find_relationships', {
    p_user_id: userId,
    p_node_name: nodeName,
    max_depth: maxDepth
  });

  if (result === null) {
    // Fallback: search SQLite fallback table
    try {
      const { getDatabase } = await import('../database/db.js');
      const db = getDatabase();
      db.prepare(`CREATE TABLE IF NOT EXISTS max_graph_fallback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT, from_name TEXT, from_type TEXT,
        to_name TEXT, to_type TEXT, edge_type TEXT, properties TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();
      const rows = db.prepare(`SELECT * FROM max_graph_fallback
        WHERE user_id = ? AND (from_name LIKE ? OR to_name LIKE ?)
        LIMIT 50`).all(userId, `%${nodeName}%`, `%${nodeName}%`);
      return rows.map(r => ({
        entity_name: r.from_name, entity_type: r.from_type,
        relationship: r.edge_type,
        connected_to: r.to_name, connected_type: r.to_type,
        depth: 1
      }));
    } catch (e) {
      return [];
    }
  }

  return result || [];
}

/**
 * Graph RAG search — combines vector + graph retrieval.
 *
 * 1. Vector search: find semantically similar documents
 * 2. Graph traversal: for each doc, find connected entities
 * 3. Return both: the semantic match AND the relationship context
 *
 * @param {string} userId
 * @param {string} query - search query text
 * @param {number} matchCount - max documents to return (default 5)
 * @returns {Object} { documents, relationships, summary }
 */
export async function graphRagSearch(userId, query, matchCount = 5) {
  // Step 1: Vector search (reuse existing knowledgeStore)
  let vectorResults = [];
  try {
    const { knowledgeStore } = await import('./knowledge-store.js');
    vectorResults = await knowledgeStore.search(userId, query, matchCount);
  } catch (e) {
    logger.warn('Vector search failed in graph RAG', { error: e.message });
  }

  // Step 2: Graph traversal — find relationships for entities mentioned in the query
  let graphResults = [];
  try {
    // Extract potential entity names from the query (simple word extraction)
    const words = query.split(/\s+/).filter(w => w.length > 3);
    for (const word of words.slice(0, 5)) {
      const rels = await findRelationships(userId, word, 2);
      if (rels && rels.length > 0) {
        graphResults.push({ entity: word, relationships: rels });
      }
    }
  } catch (e) {
    logger.warn('Graph traversal failed in graph RAG', { error: e.message });
  }

  // Step 3: Build summary
  let summary = '';
  if (vectorResults && vectorResults.length > 0) {
    summary += `Found ${vectorResults.length} semantically similar documents.\n`;
  }
  if (graphResults.length > 0) {
    const totalRels = graphResults.reduce((sum, g) => sum + g.relationships.length, 0);
    summary += `Found ${totalRels} relationship(s) across ${graphResults.length} entities.\n`;
  }
  if (!summary) {
    summary = 'No results found in vector or graph store.';
  }

  return {
    documents: vectorResults || [],
    relationships: graphResults,
    summary
  };
}

/**
 * Format graph RAG results as context for the LLM.
 */
export function formatGraphRagContext(results) {
  if (!results) return '';
  let context = '';

  // Vector results
  if (results.documents && results.documents.length > 0) {
    context += '=== SEMANTIC MATCHES (vector search) ===\n';
    results.documents.forEach((doc, i) => {
      context += `[${i + 1}] ${doc.title || 'Untitled'}\n`;
      context += `    ${(doc.content || '').substring(0, 300)}\n\n`;
    });
  }

  // Graph results
  if (results.relationships && results.relationships.length > 0) {
    context += '\n=== RELATIONSHIP GRAPH (graph traversal) ===\n';
    results.relationships.forEach(group => {
      context += `\nEntity: "${group.entity}"\n`;
      group.relationships.forEach(rel => {
        context += `  ${rel.entity_name} (${rel.entity_type}) --${rel.relationship}--> ${rel.connected_to} (${rel.connected_type})\n`;
      });
    });
  }

  return context;
}

export default { addRelationship, findRelationships, graphRagSearch, formatGraphRagContext };
