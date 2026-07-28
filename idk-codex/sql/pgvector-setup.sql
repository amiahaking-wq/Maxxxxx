-- ============================================================================
-- MAX RAG — Supabase pgvector Setup
-- ============================================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL → New Query).
-- This creates the knowledge base table with vector embeddings and a
-- similarity search function.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS max_knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  business_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'document',
  embedding vector(384),
  metadata JSONB DEFAULT '{}',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
ON max_knowledge_base
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_knowledge_user
ON max_knowledge_base(user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_business
ON max_knowledge_base(business_id);

-- ============================================================================
-- Similarity search function — MUST match the returns table below
-- ============================================================================
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(384),
  match_user_id TEXT,
  match_count INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    id,
    title,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM max_knowledge_base
  WHERE user_id = match_user_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Enable RLS
ALTER TABLE max_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own knowledge" ON max_knowledge_base;
CREATE POLICY "Users can CRUD own knowledge"
ON max_knowledge_base
FOR ALL
USING (true)
WITH CHECK (true);
