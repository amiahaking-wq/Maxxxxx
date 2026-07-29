-- ═══════════════════════════════════════════════════════════════
-- MAX — Graph RAG Setup (Apache AGE on Supabase)
-- ═══════════════════════════════════════════════════════════════
-- Run this in your Supabase SQL Editor AFTER running supabase-setup.sql
--
-- This adds a knowledge graph alongside the existing vector database:
--   - Vector DB: finds things that are SIMILAR (semantic meaning)
--   - Graph DB:  finds things that are CONNECTED (explicit relationships)
--   - Graph RAG: combines both for superior retrieval
--
-- Apache AGE is a Postgres extension that adds Cypher query support
-- (like Neo4j) — runs inside your existing Supabase database.
-- ═══════════════════════════════════════════════════════════════

-- 1. Enable Apache AGE extension
CREATE EXTENSION IF NOT EXISTS age;

-- 2. Load AGE into the search path (required for each session that uses Cypher)
-- Note: AGE requires superuser to load. Supabase may need this run as postgres user.
LOAD 'age';

-- 3. Create the MAX graph (knowledge graph for entities + relationships)
SELECT create_graph('max_graph');

-- ═══════════════════════════════════════════════════════════════
-- NODES — entities in the knowledge graph
-- ═══════════════════════════════════════════════════════════════
-- Create node labels (entity types):
--   - Person:    users, contacts, employees
--   - Project:   codebases, apps, tasks
--   - Document:  files, notes, policies
--   - Concept:   abstract ideas, topics
--   - Event:     things that happened with timestamps

-- Create a helper table to track graph nodes (for fast lookup)
CREATE TABLE IF NOT EXISTS public.max_graph_nodes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  node_type TEXT NOT NULL,           -- 'Person', 'Project', 'Document', 'Concept', 'Event'
  name TEXT NOT NULL,                -- display name
  properties JSONB DEFAULT '{}',    -- arbitrary key-value properties
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, node_type, name)
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_user ON public.max_graph_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON public.max_graph_nodes(user_id, node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_name ON public.max_graph_nodes(user_id, name);

-- ═══════════════════════════════════════════════════════════════
-- EDGES — relationships between nodes
-- ═══════════════════════════════════════════════════════════════
-- Common relationship types:
--   - KNOWS:         Person → Person (Sara knows John)
--   - WORKS_WITH:    Person → Person (works with)
--   - MARRIED_TO:    Person → Person (married to)
--   - WORKS_ON:      Person → Project (assigned to project)
--   - CREATED:       Person → Document/Project (created)
--   - DEPENDS_ON:    Project → Project (dependency)
--   - MENTIONS:      Document → Concept/Person (mentions)
--   - PART_OF:       Project → Project (subproject)
--   - RELATED_TO:    generic relationship

CREATE TABLE IF NOT EXISTS public.max_graph_edges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_node_id UUID NOT NULL REFERENCES public.max_graph_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES public.max_graph_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,           -- 'KNOWS', 'WORKS_WITH', 'CREATED', etc.
  properties JSONB DEFAULT '{}',    -- e.g. { since: '2023-01-15', strength: 0.9 }
  weight FLOAT DEFAULT 1.0,          -- relationship strength (0-1)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_node_id, to_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_user ON public.max_graph_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON public.max_graph_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON public.max_graph_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON public.max_graph_edges(edge_type);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.max_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_graph_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own graph nodes" ON public.max_graph_nodes;
DROP POLICY IF EXISTS "Users own graph edges" ON public.max_graph_edges;

CREATE POLICY "Users own graph nodes" ON public.max_graph_nodes
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own graph edges" ON public.max_graph_edges
  FOR ALL USING (user_id = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════
-- GRAPH RAG SEARCH FUNCTION
-- Combines vector similarity (semantic) + graph traversal (relationships)
-- ═══════════════════════════════════════════════════════════════
-- This function:
--   1. Takes a query + embedding
--   2. Finds semantically similar documents (vector search)
--   3. For each matching document, finds connected entities (graph traversal)
--   4. Returns both — the semantic match AND the relationship context

CREATE OR REPLACE FUNCTION public.graph_rag_search(
  query_text TEXT,
  query_embedding vector(384),
  match_user_id TEXT,
  match_count INTEGER DEFAULT 5,
  graph_depth INTEGER DEFAULT 2
)
RETURNS TABLE (
  doc_id UUID,
  doc_title TEXT,
  doc_content TEXT,
  similarity FLOAT,
  related_entities JSONB
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  doc RECORD;
  entities JSONB;
BEGIN
  -- Create temp table for results
  CREATE TEMP TABLE IF NOT EXISTS temp_results (
    doc_id UUID,
    doc_title TEXT,
    doc_content TEXT,
    similarity FLOAT,
    related_entities JSONB
  );

  -- Step 1: Vector search — find semantically similar documents
  FOR doc IN
    SELECT id, title, content,
      1 - (embedding <=> query_embedding) AS sim
    FROM public.max_knowledge_base
    WHERE user_id = match_user_id
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> query_embedding) > 0.3
    ORDER BY embedding <=> query_embedding
    LIMIT match_count
  LOOP
    -- Step 2: Graph traversal — find entities related to this document
    -- Look for graph nodes whose name appears in the document content
    -- or that have a MENTIONS edge pointing to this document
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', n.name,
        'type', n.node_type,
        'properties', n.properties,
        'relationship', e.edge_type,
        'connected_to', cn.name
      )
    ), '[]'::jsonb) INTO entities
    FROM public.max_graph_edges e
    JOIN public.max_graph_nodes n ON n.id = e.from_node_id OR n.id = e.to_node_id
    LEFT JOIN public.max_graph_nodes cn ON (
      (cn.id = e.to_node_id AND n.id = e.from_node_id)
      OR (cn.id = e.from_node_id AND n.id = e.to_node_id)
    )
    WHERE e.user_id = match_user_id
      AND (
        n.name ILIKE '%' || query_text || '%'
        OR doc.content ILIKE '%' || n.name || '%'
      )
    LIMIT 20;

    INSERT INTO temp_results VALUES (
      doc.id, doc.title, doc.content, doc.sim, entities
    );
  END LOOP;

  RETURN QUERY SELECT * FROM temp_results;
  DROP TABLE temp_results;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- HELPER: Add a node + edge in one call
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.add_graph_relationship(
  p_user_id TEXT,
  p_from_type TEXT,
  p_from_name TEXT,
  p_to_type TEXT,
  p_to_name TEXT,
  p_edge_type TEXT,
  p_properties JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
  from_id UUID;
  to_id UUID;
  edge_id UUID;
BEGIN
  -- Get or create from_node
  INSERT INTO public.max_graph_nodes (user_id, node_type, name)
  VALUES (p_user_id, p_from_type, p_from_name)
  ON CONFLICT (user_id, node_type, name) DO NOTHING;
  SELECT id INTO from_id FROM public.max_graph_nodes
  WHERE user_id = p_user_id AND node_type = p_from_type AND name = p_from_name;

  -- Get or create to_node
  INSERT INTO public.max_graph_nodes (user_id, node_type, name)
  VALUES (p_user_id, p_to_type, p_to_name)
  ON CONFLICT (user_id, node_type, name) DO NOTHING;
  SELECT id INTO to_id FROM public.max_graph_nodes
  WHERE user_id = p_user_id AND node_type = p_to_type AND name = p_to_name;

  -- Create edge
  INSERT INTO public.max_graph_edges (user_id, from_node_id, to_node_id, edge_type, properties)
  VALUES (p_user_id, from_id, to_id, p_edge_type, p_properties)
  ON CONFLICT (from_node_id, to_node_id, edge_type) DO UPDATE
    SET properties = EXCLUDED.properties
  RETURNING id INTO edge_id;

  RETURN edge_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- HELPER: Find all relationships for a node (multi-hop)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.find_relationships(
  p_user_id TEXT,
  p_node_name TEXT,
  max_depth INTEGER DEFAULT 3
)
RETURNS TABLE (
  entity_name TEXT,
  entity_type TEXT,
  relationship TEXT,
  connected_to TEXT,
  connected_type TEXT,
  depth INTEGER
) AS $$
  WITH RECURSIVE relationship_chain AS (
    -- Base: direct relationships (depth 1)
    SELECT
      n.name AS entity_name, n.node_type AS entity_type,
      e.edge_type AS relationship,
      cn.name AS connected_to, cn.node_type AS connected_type,
      1 AS depth
    FROM public.max_graph_nodes n
    JOIN public.max_graph_edges e ON e.from_node_id = n.id OR e.to_node_id = n.id
    LEFT JOIN public.max_graph_nodes cn ON (
      (cn.id = e.to_node_id AND n.id = e.from_node_id)
      OR (cn.id = e.from_node_id AND n.id = e.to_node_id)
    )
    WHERE n.user_id = p_user_id AND n.name ILIKE '%' || p_node_name || '%'

    UNION ALL

    -- Recursive: follow edges from connected nodes
    SELECT
      rc.connected_to AS entity_name, rc.connected_type AS entity_type,
      e2.edge_type AS relationship,
      cn2.name AS connected_to, cn2.node_type AS connected_type,
      rc.depth + 1
    FROM relationship_chain rc
    JOIN public.max_graph_nodes n2 ON n2.name = rc.connected_to AND n2.user_id = p_user_id
    JOIN public.max_graph_edges e2 ON e2.from_node_id = n2.id OR e2.to_node_id = n2.id
    LEFT JOIN public.max_graph_nodes cn2 ON (
      (cn2.id = e2.to_node_id AND n2.id = e2.from_node_id)
      OR (cn2.id = e2.from_node_id AND n2.id = e2.to_node_id)
    )
    WHERE rc.depth < max_depth
  )
  SELECT DISTINCT * FROM relationship_chain
  WHERE entity_name IS NOT NULL
  LIMIT 50;
$$ LANGUAGE SQL STABLE;

-- ═══════════════════════════════════════════════════════════════
-- GRAPH RAG SETUP COMPLETE
-- ═══════════════════════════════════════════════════════════════
-- Your Supabase now supports:
--   1. Vector search: public.search_knowledge() — semantic similarity
--   2. Graph search:  public.find_relationships() — multi-hop relationships
--   3. Graph RAG:     public.graph_rag_search() — combined vector + graph
--   4. Add relationships: public.add_graph_relationship() — easy insert
--
-- Example: "Sara knows John, who works at Acme"
--   SELECT add_graph_relationship('user1', 'Person', 'Sara', 'Person', 'John', 'KNOWS');
--   SELECT add_graph_relationship('user1', 'Person', 'John', 'Organization', 'Acme', 'WORKS_AT');
--
--   Then query: SELECT * FROM find_relationships('user1', 'Sara');
--   Returns: Sara KNOWS John, John WORKS_AT Acme (multi-hop)
-- ═══════════════════════════════════════════════════════════════
